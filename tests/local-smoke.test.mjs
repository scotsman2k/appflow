import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

const kitRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");

test("serves the real dashboard adapter in explicit local-test mode",async ()=>{
  const port=18787;
  const server=spawn(process.execPath,["backend/server.mjs"],{
    cwd:kitRoot,env:{...process.env,APP_MODE:"local-test",DASHBOARD_PORT:String(port)},
    stdio:["ignore","pipe","pipe"]
  });
  try{
    let ready=false;
    for(let attempt=0;attempt<60;attempt++){
      if(server.exitCode!==null)throw new Error("Server exited unexpectedly: "+server.exitCode);
      try{
        const response=await fetch("http://127.0.0.1:"+port+"/healthz");
        if(response.ok){ready=true;break;}
      }catch{ /* starting */ }
      await delay(100);
    }
    assert.ok(ready,"server health endpoint ready");
    const page=await fetch("http://127.0.0.1:"+port+"/dashboard/");
    assert.equal(page.status,200);
    const html=await page.text();
    assert.match(html,/Infrastructure in motion/);
    assert.match(html,/i-local-test/);
    assert.match(html,/data-json=/);
    const namespacedHealth=await (await fetch("http://127.0.0.1:"+port+"/api/demo/health")).json();
    assert.equal(namespacedHealth.ok,true);
    const inventory=await (await fetch("http://127.0.0.1:"+port+"/api/demo/inventory")).json();
    assert.equal(inventory.mode,"local-test");
    assert.equal(inventory.instances[0].instanceId,"i-local-test");
    const request=await fetch("http://127.0.0.1:"+port+"/api/demo/request");
    assert.equal(request.headers.get("x-served-by-instance"),"i-local-test");
    const data=await request.json();
    assert.equal(data.instanceId,"i-local-test");
    assert.deepEqual(data.dependencies,[]);
    const check=await fetch("http://127.0.0.1:"+port+"/api/demo/check/rds");
    assert.equal(check.status,403);
    const post=await fetch("http://127.0.0.1:"+port+"/api/demo/request",{method:"POST"});
    assert.equal(post.status,405);
  }finally{
    server.kill("SIGTERM");
  }
});
