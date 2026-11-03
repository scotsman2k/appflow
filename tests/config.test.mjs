import test from "node:test";
import assert from "node:assert/strict";
import {validateConfig} from "../backend/config.mjs";

const valid={
  appMode:"live",port:8787,dbPort:5432,inventoryTtlMs:30000,probeTimeoutMs:3500,
  localTestMode:false,enableDemoProbes:false,asgName:"existing-asg",
  targetGroupArn:"arn:example",dbCaBundle:"",s3Bucket:"",s3SentinelKey:""
};
test("live adapter can inspect the already deployed stack without dependency probes",()=>{
  assert.deepEqual(validateConfig(valid),[]);
});
test("live mode requires the existing ASG and target group",()=>{
  const errors=validateConfig({...valid,asgName:"",targetGroupArn:""});
  assert.ok(errors.some(e=>e.includes("ASG_NAME")));
  assert.ok(errors.some(e=>e.includes("TARGET_GROUP_ARN")));
});
test("local test mode never requires AWS resource parameters",()=>{
  assert.deepEqual(validateConfig({...valid,appMode:"local-test",localTestMode:true,asgName:"",targetGroupArn:""}),[]);
});
test("enabled dependency checks require existing resources and a secret reference",()=>{
  const errors=validateConfig({...valid,enableDemoProbes:true});
  for(const name of ["DB_HOST","DB_NAME","DB_SECRET_ARN","RDS_CA_BUNDLE","S3_BUCKET","S3_SENTINEL_KEY"]){
    assert.ok(errors.some(e=>e.includes(name)),name);
  }
});
test("rejects unsafe modes, ports and timeouts",()=>{
  const errors=validateConfig({...valid,appMode:"simulated-live",port:0,dbPort:99999,probeTimeoutMs:200,inventoryTtlMs:1000});
  assert.equal(errors.length,5);
});
