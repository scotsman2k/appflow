import {readFileSync} from "node:fs";
import {Pool} from "pg";
import {S3Client, HeadObjectCommand} from "@aws-sdk/client-s3";
import {SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager";
import {performance} from "node:perf_hooks";

const pools=new Map();
const s3Clients=new Map();
const secretClients=new Map();

function errorType(err) {
  const name=String(err?.name || "Error").replace(/[^A-Za-z0-9_]/g,"").slice(0,48);
  return name || "Error";
}
function elapsed(start){return Math.round(performance.now()-start);}

async function credentials(cfg) {
  if(!cfg.dbSecretArn)throw new Error("Existing database secret reference is required.");
  if(!secretClients.has(cfg.awsRegion))secretClients.set(cfg.awsRegion,new SecretsManagerClient({region:cfg.awsRegion}));
  const response=await secretClients.get(cfg.awsRegion).send(new GetSecretValueCommand({SecretId:cfg.dbSecretArn}));
  if(!response.SecretString)throw new Error("The database secret has no SecretString.");
  const secret=JSON.parse(response.SecretString);
  const user=secret.username||secret.user;
  if(!user||!secret.password)throw new Error("Database secret is missing username or password.");
  return {user,password:secret.password};
}

async function dbPool(cfg) {
  const key=cfg.dbHost+":"+cfg.dbName;
  const cached=pools.get(key);
  if(cached && Date.now()-cached.created<600000)return cached.pool;
  if(!cfg.dbHost||!cfg.dbName||!cfg.dbCaBundle)throw new Error("Database endpoint, name, or CA bundle missing.");
  const auth=await credentials(cfg);
  const ca=readFileSync(cfg.dbCaBundle,"utf8");
  const pool=new Pool({
    host:cfg.dbHost,port:cfg.dbPort,database:cfg.dbName,
    user:auth.user,password:auth.password,
    max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:cfg.probeTimeoutMs,
    ssl:{ca,rejectUnauthorized:true,servername:cfg.dbHost},
    application_name:"architecture-live-probe"
  });
  if(cached)await cached.pool.end().catch(()=>{});
  pools.set(key,{pool,created:Date.now()});
  return pool;
}

export async function probeRds(cfg) {
  const start=performance.now();
  try{
    const pool=await dbPool(cfg);
    const client=await pool.connect();
    try{
      await client.query("SET statement_timeout = 2000");
      const result=await client.query("SELECT 1 AS healthy");
      if(result.rows?.[0]?.healthy!==1)throw new Error("Unexpected health query response.");
      return {kind:"rds",ok:true,operation:"SELECT 1",latencyMs:elapsed(start),resource:cfg.rdsIdentifier||cfg.dbHost};
    }finally{client.release();}
  }catch(err){
    return {kind:"rds",ok:false,operation:"SELECT 1",latencyMs:elapsed(start),resource:cfg.rdsIdentifier||"not configured",errorCode:errorType(err)};
  }
}

export async function probeS3(cfg) {
  const start=performance.now();
  try{
    if(!cfg.s3Bucket||!cfg.s3SentinelKey)throw new Error("S3 sentinel object is not configured.");
    if(!s3Clients.has(cfg.awsRegion))s3Clients.set(cfg.awsRegion,new S3Client({region:cfg.awsRegion}));
    await s3Clients.get(cfg.awsRegion).send(new HeadObjectCommand({Bucket:cfg.s3Bucket,Key:cfg.s3SentinelKey}),{abortSignal:AbortSignal.timeout(cfg.probeTimeoutMs)});
    return {kind:"s3",ok:true,operation:"HeadObject",latencyMs:elapsed(start),resource:cfg.s3Bucket};
  }catch(err){
    return {kind:"s3",ok:false,operation:"HeadObject",latencyMs:elapsed(start),resource:cfg.s3Bucket||"not configured",errorCode:errorType(err)};
  }
}

export async function closePools() {
  await Promise.all(Array.from(pools.values()).map(entry=>entry.pool.end().catch(()=>{})));
  pools.clear();
}
