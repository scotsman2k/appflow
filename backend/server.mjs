import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {performance} from "node:perf_hooks";
import {randomUUID} from "node:crypto";
import {config,validateConfig} from "./config.mjs";
import {identity} from "./identity.mjs";
import {probeRds,probeS3,closePools} from "./probes.mjs";
import {inventory} from "./inventory.mjs";

const configErrors=validateConfig(config);
if(configErrors.length){
  for(const e of configErrors)console.error("CONFIG: "+e);
  process.exit(2);
}
const dashboardDir=resolve(dirname(fileURLToPath(import.meta.url)),"../dashboard");
const contentTypes={"index.html":"text/html; charset=utf-8","app.js":"application/javascript; charset=utf-8","styles.css":"text/css; charset=utf-8"};
let intervalStart=Date.now(),intervalCount=0;

function commonHeaders(){
  return {
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "X-Frame-Options":"DENY",
    "Cache-Control":"no-store",
    "Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
  };
}
function reply(res,status,data,extra={}){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",...commonHeaders(),...extra});
  res.end(JSON.stringify(data));
}
function errorCode(error){
  return String(error?.name||"ServerError").replace(/[^A-Za-z0-9_]/g,"").slice(0,48);
}
function rateLimited(){
  const now=Date.now();
  if(now-intervalStart>=1000){intervalStart=now;intervalCount=0;}
  intervalCount++;
  return intervalCount>10;
}

async function page(res,filename) {
  if(!Object.prototype.hasOwnProperty.call(contentTypes,filename)){
    reply(res,404,{error:"not_found"});return;
  }
  let body=await readFile(resolve(dashboardDir,filename));
  const headers=commonHeaders();
  if(filename==="index.html"){
    const instance=await identity(config.localTestMode);
    const pageContext={
      mode:config.localTestMode?"local-test":"live",
      pageInstanceId:instance.instanceId,
      pageAvailabilityZone:instance.availabilityZone,
      apiBase:"/api/demo"
    };
    const safeJson=JSON.stringify(pageContext).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    body=Buffer.from(body.toString("utf8").replace("__PAGE_CONTEXT_JSON__",safeJson));
    headers["Server-Timing"]="ec2;desc="+JSON.stringify(instance.instanceId);
  }else{
    headers["Cache-Control"]="private, max-age=60";
  }
  res.writeHead(200,{"Content-Type":contentTypes[filename],...headers});
  res.end(body);
}

async function handle(req,res){
  const requestId=randomUUID();
  const started=performance.now();
  try{
    const url=new URL(req.url,"http://localhost");
    if(req.method!=="GET"){
      reply(res,405,{error:"method_not_allowed"},{Allow:"GET"});return;
    }
    if(url.pathname==="/"){res.writeHead(302,{Location:"/dashboard/",...commonHeaders()});res.end();return;}
    if(url.pathname==="/healthz"||url.pathname==="/api/demo/health"){reply(res,200,{ok:true,service:"architecture-dashboard"});return;}
    if(url.pathname==="/readyz"||url.pathname==="/api/demo/ready"){
      const who=await identity(config.localTestMode);
      reply(res,200,{ready:true,instanceId:who.instanceId});return;
    }
    if(url.pathname==="/dashboard/"||url.pathname==="/dashboard"){
      await page(res,"index.html");return;
    }
    if(url.pathname==="/dashboard/app.js"){await page(res,"app.js");return;}
    if(url.pathname==="/dashboard/styles.css"){await page(res,"styles.css");return;}
    if(!url.pathname.startsWith("/api/demo/")){reply(res,404,{error:"not_found"});return;}
    if(rateLimited()){reply(res,429,{error:"rate_limited"});return;}
    const who=await identity(config.localTestMode);
    if(url.pathname==="/api/demo/identity"){
      reply(res,200,{instanceId:who.instanceId,availabilityZone:who.availabilityZone,requestId,source:who.source});
      return;
    }
    if(url.pathname==="/api/demo/inventory"){
      const data=await inventory(config);
      reply(res,200,data);return;
    }
    if(url.pathname==="/api/demo/request"){
      const dependencies=config.enableDemoProbes&&!config.localTestMode
        ?await Promise.all([probeRds(config),probeS3(config)]):[];
      reply(res,200,{
        type:"request",requestId,
        instanceId:who.instanceId,availabilityZone:who.availabilityZone,
        status:200,latencyMs:Math.round(performance.now()-started),
        checksEnabled:config.enableDemoProbes&&!config.localTestMode,
        dependencies
      },{"X-Served-By-Instance":who.instanceId});
      return;
    }
    if(url.pathname==="/api/demo/check/rds"||url.pathname==="/api/demo/check/s3"){
      if(!config.enableDemoProbes||config.localTestMode){reply(res,403,{error:"probes_disabled"});return;}
      const kind=url.pathname.endsWith("/rds")?"rds":"s3";
      const result=kind==="rds"?await probeRds(config):await probeS3(config);
      reply(res,200,{type:"dependency",requestId,instanceId:who.instanceId,...result});
      return;
    }
    reply(res,404,{error:"not_found"});
  }catch(error){
    console.error(JSON.stringify({requestId,event:"request_failed",code:errorCode(error)}));
    reply(res,503,{error:"backend_unavailable",code:errorCode(error),requestId});
  }
}

const server=http.createServer(handle);
server.requestTimeout=10000;
server.headersTimeout=10000;
server.listen(config.port,"127.0.0.1",()=>console.log(JSON.stringify({
  event:"architecture_adapter_started",port:config.port,mode:config.localTestMode?"local-test":"live",
  dependenciesEnabled:config.enableDemoProbes
})));
async function shutdown(){
  server.close();
  await closePools();
  process.exit(0);
}
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
