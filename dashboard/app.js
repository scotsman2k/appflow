(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var rand = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };
  var now = function () { return new Date().toLocaleTimeString("en-US", {hour12:false, hour:"2-digit", minute:"2-digit", second:"2-digit"}); };
  var pageContext = {};
  try { pageContext=JSON.parse($("page-context")?.getAttribute("data-json")||"{}"); } catch(ignore) {}
  var instances = [
    {id:"i-0a3b71e5d0c228431",name:"demo-app-web-01",az:"us-east-1a",subnet:"subnet-0a91c1b7",x:453,y:155,present:true,healthy:true,booting:false,requests:308},
    {id:"i-04b9a126e9f2274c2",name:"demo-app-web-02",az:"us-east-1a",subnet:"subnet-0a91c1b7",x:586,y:155,present:true,healthy:true,booting:false,requests:312},
    {id:"i-0f29e44caae839145",name:"demo-app-web-05",az:"us-east-1a",subnet:"subnet-0a91c1b7",x:719,y:155,present:false,healthy:false,booting:false,requests:0},
    {id:"i-0914b7cf52bc8032a",name:"demo-app-web-03",az:"us-east-1b",subnet:"subnet-0be42a8f",x:453,y:390,present:true,healthy:true,booting:false,requests:315},
    {id:"i-082b1d2c3ad6e419c",name:"demo-app-web-04",az:"us-east-1b",subnet:"subnet-0be42a8f",x:586,y:390,present:true,healthy:true,booting:false,requests:313},
    {id:"i-0d38f426eb74129cb",name:"demo-app-web-06",az:"us-east-1b",subnet:"subnet-0be42a8f",x:719,y:390,present:false,healthy:false,booting:false,requests:0}
  ];
  var state = {
    running:true, selected:"instance0", filter:"all", requests:1248, latency:42,
    rds:true, s3:true, rdsLatency:12, s3Latency:18,
    lastInstance:0, lastStatus:200, lastLatency:42, turn:0, realFeed:false,
    liveMode:false, inventory:null, requestInFlight:false
  };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function createPath(id, flow, d) {
    return '<path id="'+esc(id)+'" class="flow-path '+flow+'" data-flow="'+flow+'" d="'+d+'"/>';
  }
  function buildPaths() {
    var paths = [];
    paths.push(createPath("flow-users-alb","app","M124 311 C170 311 195 311 242 311"));
    instances.forEach(function (inst,i) {
      var endY = inst.y + 50;
      paths.push(createPath("flow-alb-"+i,"app","M380 312 C420 312 411 "+endY+" "+inst.x+" "+endY));
      paths.push(createPath("flow-rds-"+i,"rds","M"+(inst.x+116)+" "+(endY-7)+" C870 "+(endY-7)+" 874 310 910 310"));
      paths.push(createPath("flow-s3-"+i,"s3","M"+(inst.x+116)+" "+(endY+10)+" C1000 "+(endY+10)+" 1115 319 1171 319"));
    });
    $("flow-layer").innerHTML = paths.join("");
    filterPaths();
  }
  function filterPaths() {
    document.querySelectorAll(".flow-path").forEach(function (path) {
      var className = path.dataset.flow;
      var number = Number(path.id.split("-").pop());
      var linkedToInstance = /^flow-(alb|rds|s3)-\d+$/.test(path.id);
      path.classList.toggle("dimmed",state.filter !== "all" && state.filter !== className);
      path.classList.toggle("inactive",linkedToInstance && !instances[number].present);
    });
  }
  function buildInstances() {
    var html = [];
    instances.forEach(function (inst,i) {
      var x=inst.x, y=inst.y;
      var visual = !inst.present?"empty":(!inst.healthy&&!inst.booting?"failed":"");
      var title = !inst.present?"Scale-out slot":(inst.name.length>17?inst.name.slice(0,16)+"…":inst.name);
      var sub = !inst.present?"Waiting for capacity":inst.id.substring(0,13)+"…";
      var count = !inst.present?"NOT PROVISIONED":inst.booting?"LAUNCHING":inst.healthy?(inst.requests.toLocaleString()+" REQUESTS"):"UNHEALTHY";
      html.push(
        '<g class="instance-card selectable '+visual+(state.selected==="instance"+i?" selected-node":"")+'" data-asset="instance'+i+'">'+
        '<rect class="instance-base" x="'+x+'" y="'+y+'" width="116" height="100" rx="10"/>'+
        '<rect class="instance-top" x="'+(x+1)+'" y="'+(y+1)+'" width="114" height="28" rx="9"/>'+
        '<rect x="'+(x+12)+'" y="'+(y+10)+'" width="13" height="13" rx="2.5" fill="none" stroke="#e6a563" stroke-width="1.8"/>'+
        '<path d="M'+(x+15)+' '+(y+8)+' V'+(y+25)+' M'+(x+21)+' '+(y+8)+' V'+(y+25)+' M'+(x+10)+' '+(y+13)+' H'+(x+27)+' M'+(x+10)+' '+(y+20)+' H'+(x+27)+'" stroke="#e6a563" stroke-width=".9"/>'+
        '<circle class="instance-indicator" cx="'+(x+103)+'" cy="'+(y+17)+'" r="4"/>'+
        '<text class="instance-label" x="'+(x+12)+'" y="'+(y+48)+'">'+esc(title)+'</text>'+
        '<text class="instance-id" x="'+(x+12)+'" y="'+(y+66)+'">'+esc(sub)+'</text>'+
        '<text class="instance-rps" x="'+(x+12)+'" y="'+(y+85)+'">'+esc(count)+'</text>'+
        '<g class="security-marker"><rect x="'+(x+93)+'" y="'+(y-9)+'" width="23" height="23" rx="5" fill="#c4662f"/><text x="'+(x+104.5)+'" y="'+(y+7)+'" text-anchor="middle" class="security-letter">A</text></g>'+
        '</g>'
      );
    });
    $("instance-layer").innerHTML = html.join("");
    filterPaths();
  }

  function svgPoint(path, progress) {
    var len=path.getTotalLength();
    return path.getPointAtLength(Math.max(0,Math.min(1,progress))*len);
  }
  function animatePath(id, color, duration, reverse) {
    var path=$(id);
    if(!path) return;
    var flow=path.dataset.flow;
    if(state.filter!=="all"&&state.filter!==flow) return;
    var particle=document.createElementNS(NS,"circle");
    particle.setAttribute("r","5.1");
    particle.setAttribute("fill",color);
    particle.setAttribute("class","animated-particle");
    $("particles-layer").appendChild(particle);
    path.classList.add("highlight");
    var start=performance.now();
    function frame(time) {
      if(!particle.isConnected)return;
      var progress=Math.min(1,(time-start)/duration);
      var position=svgPoint(path,reverse?1-progress:progress);
      particle.setAttribute("cx",position.x);
      particle.setAttribute("cy",position.y);
      if(progress<1){requestAnimationFrame(frame);}
      else {
        particle.remove();
        setTimeout(function(){path.classList.remove("highlight");},150);
      }
    }
    requestAnimationFrame(frame);
  }
  function flashInstance(i) {
    var node=document.querySelector('[data-asset="instance'+i+'"]');
    if(!node)return;
    node.classList.add("active-response");
    setTimeout(function(){node.classList.remove("active-response");},1100);
  }
  function addActivity(type,title,description) {
    var row=document.createElement("div");
    row.className="activity-item";
    row.innerHTML='<span class="activity-type '+esc(type)+'">'+({app:"↗",rds:"DB",s3:"S3",fail:"!"}[type]||"·")+'</span>'+
      '<div class="activity-text"><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></div>'+
      '<span class="activity-time">'+esc(now())+'</span>';
    $("activity-list").prepend(row);
    while($("activity-list").children.length>5)$("activity-list").lastChild.remove();
  }
  function updateStats() {
    $("requests-stat").textContent=state.requests.toLocaleString();
    $("latency-stat").textContent=state.latency;
    var present=instances.filter(function(x){return x.present;});
    var healthy=present.filter(function(x){return x.healthy;}).length;
    $("healthy-stat").textContent=healthy;
    $("total-stat").textContent=present.length;
    $("health-description").textContent=present.length===0?(state.liveMode?"Awaiting AWS inventory":"No targets"):healthy===present.length?"All targets healthy":(present.length-healthy)+" target(s) unavailable";
    updateDependencies();
  }
  function updateDependencies() {
    [["rds","rdsLatency","rds-result","rds-latency","db-overview","db-connection-indicator"],["s3","s3Latency","s3-result","s3-latency","s3-overview","s3-connection-indicator"]].forEach(function(a){
      var good=state[a[0]];
      var unknown=good===null;
      $(a[2]).textContent=unknown?"Not tested":good?"Healthy":"Unreachable";
      $(a[2]).className="dep-status "+(unknown?"":good?"good":"fail");
      $(a[3]).textContent=unknown?"No measurement":good?state[a[1]]+" ms":"Failed";
      $(a[4]).textContent=unknown?"Not checked":good?"Reachable":"Unreachable";
      $(a[4]).classList.toggle("fail",good===false);
      $(a[5]).textContent=unknown?"Unknown":good?"Connected":"Failed";
      $(a[5]).classList.toggle("failed",good===false);
    });
  }
  function selectAsset(id) {
    state.selected=id;
    document.querySelectorAll(".selectable").forEach(function(el){el.classList.toggle("selected-node",el.dataset.asset===id);});
    var info=assetDetails(id);
    $("inspector-heading").textContent=info.title;
    $("inspect-name").textContent=info.name;
    $("inspect-id").textContent=info.id;
    $("inspector-icon").textContent=info.icon;
    $("inspector-icon").className="inspect-icon "+info.color;
    $("inspect-health").textContent=info.health;
    $("inspect-health-dot").className="health-dot"+(info.failed?" failed":"");
    $("inspect-az").textContent=info.location;
    $("inspect-details").innerHTML=info.details.map(function(row){return '<div class="detail-row"><span class="detail-label">'+esc(row[0])+'</span><span class="detail-value">'+esc(row[1])+'</span></div>';}).join("");
  }
  function assetDetails(id) {
    if(/^instance\d+$/.test(id)){
      var i=Number(id.substring(8)),p=instances[i];
      if(state.liveMode&&!p.present)return {
        title:"EC2 instance slot",name:"Awaiting AWS inventory",id:"Not yet registered",icon:"EC2",color:"orange",
        health:"Not evaluated",location:"Unknown",failed:false,details:[["Source","Auto Scaling / ELBv2 APIs"],["Status","No verified target in this canvas slot"]]
      };
      return {
        title:"EC2 instance",name:p.name,id:p.id,icon:"EC2",color:"orange",
        health:!p.present?"Not provisioned":p.booting?"Launching":p.healthy?"Healthy · InService":"Unhealthy · OutOfService",
        location:p.az,failed:p.present&&!p.healthy,
        details:[["Instance ID",p.id],["Auto Scaling group",state.inventory?.asg?.name||"demo-app-asg"],["Private subnet",p.subnet],["Requests in view",p.requests.toLocaleString()],["RDS connectivity",state.rds===null?"Not tested":state.rds?"Reachable":"Unreachable"],["S3 connectivity",state.s3===null?"Not tested":state.s3?"Reachable":"Unreachable"],["Status",p.healthy?"Healthy":p.present?"Unhealthy":"Not provisioned"]]
      };
    }
    var map={
      users:{title:"Application clients",name:"Application users",id:"HTTPS client requests",icon:"WEB",color:"blue",health:"Client requests active",location:"Entry point",details:[["Protocol","HTTPS 443"],["Request path","Client → ALB → EC2"],["Traffic mode",state.realFeed?"Observed telemetry":"Synthetic demonstration"]]},
      alb:{title:"Application Load Balancer",name:"demo-app-alb",id:"app/demo-app-alb/example",icon:"ALB",color:"purple",health:"Healthy · 2 Availability Zones",location:"us-east-1",details:[["Scheme","Internal"],["Listener","HTTPS 443"],["Target group","demo-app-targets"],["Target selection","AWS ALB"],["Healthy targets",instances.filter(function(x){return x.healthy;}).length+" registered"],["VPC","demo-application-vpc"]]},
      vpc:{title:"Virtual private cloud",name:"demo-application-vpc",id:"vpc-0c9f4a125b9d",icon:"VPC",color:"purple",health:"Available",location:"us-east-1",details:[["CIDR","10.42.0.0/16"],["Application subnets","2 private"],["DB subnets","Multi-AZ DB subnet group"],["Ingress","Approved private network"],["Security controls","Security groups / IAM"]]},
      "zone-a":{title:"Availability zone",name:"us-east-1a",id:"demo-app-private-a",icon:"AZ",color:"blue",health:"Available",location:"us-east-1a",details:[["Application subnet","subnet-0a91c1b7"],["CIDR","10.42.16.0/24"],["EC2 Auto Scaling","demo-app-asg"],["Private access","Yes"]]},
      "zone-b":{title:"Availability zone",name:"us-east-1b",id:"demo-app-private-b",icon:"AZ",color:"blue",health:"Available",location:"us-east-1b",details:[["Application subnet","subnet-0be42a8f"],["CIDR","10.42.17.0/24"],["EC2 Auto Scaling","demo-app-asg"],["Private access","Yes"]]},
      rds:{title:"Database dependency",name:"demo-app-postgres",id:"RDS PostgreSQL · Multi-AZ",icon:"RDS",color:"purple",health:state.rds===null?"Not tested":state.rds?"Reachable · TLS":"Connection failed",failed:state.rds===false,location:"Private DB subnets",details:[["Engine","PostgreSQL"],["Port","5432 / TLS"],["Connectivity check","SELECT 1"],["Last check",state.liveMode?"Not measured yet":state.rdsLatency+" ms · simulated"],["Database role","Least-privilege application user"],["HA","Multi-AZ deployment"]]},
      s3:{title:"Object storage",name:"demo-app-artifacts",id:"Primary + replicated buckets",icon:"S3",color:"green",health:state.s3===null?"Not tested":state.s3?"Reachable · HTTPS":"Endpoint unavailable",failed:state.s3===false,location:"us-east-1 → us-west-2",details:[["Primary bucket","demo-app-artifacts-use1"],["Replica bucket","demo-app-artifacts-usw2"],["Connectivity check","HeadObject"],["Last check",state.liveMode?"Not measured yet":state.s3Latency+" ms · simulated"],["Endpoint","Private S3 connectivity"],["Replication","Configured · demo"],["Access","IAM role + bucket policy"]]}
    };
    if(state.liveMode&&!state.inventory)return {
      title:"AWS inventory pending",name:"Awaiting verified AWS metadata",id:"Discovery in progress",
      icon:"AWS",color:"blue",health:"Not evaluated",location:"Unknown",failed:false,
      details:[["Source","AWS control-plane Describe APIs"],["Note","No sample resource values should be treated as live"]]
    };
    var current=state.inventory;
    if(current){
      if(id==="vpc"&&current.vpc){
        map.vpc.name=current.vpc.name||current.vpc.id;
        map.vpc.id=current.vpc.id||"Unknown VPC";
        map.vpc.details=[["CIDR",current.vpc.cidr||"Unknown"],["Region",current.region||"Unknown"],["Auto Scaling",current.asg?.name||"Unknown"]];
      }
      if(id==="alb"&&current.alb){
        map.alb.name=current.alb.name||"ALB";
        map.alb.id=current.alb.dnsName||current.alb.name;
        map.alb.details=[["Scheme",current.alb.scheme||"Unknown"],["Target group",current.targetGroup?.arn||"Unknown"],["Healthy targets",instances.filter(function(p){return p.present&&p.healthy;}).length+" in view"]];
      }
      if(id==="rds"&&current.rds){
        map.rds.name=current.rds.identifier||"RDS";
        map.rds.id=current.rds.endpoint||"Endpoint undisclosed";
        map.rds.details=[["Endpoint",current.rds.endpoint||"Unknown"],["Port",String(current.rds.port||5432)],["Multi-AZ",String(current.rds.multiAz??"Unknown")],["Check","SELECT 1"],["Last observed",state.rds===null?"Not tested":state.rds?state.rdsLatency+" ms":"Failed"]];
      }
      if(id==="s3"&&current.s3){
        map.s3.name=current.s3.primary||"S3 bucket";
        map.s3.id=current.s3.replica?"Replicated object storage":"S3 object storage";
        map.s3.details=[["Primary",current.s3.primary||"Unknown"],["Replica",current.s3.replica||"Not configured"],["Check","HeadObject"],["Last observed",state.s3===null?"Not tested":state.s3?state.s3Latency+" ms":"Failed"],["Replication","Not inferred from primary HeadObject"]];
      }
      if((id==="zone-a"||id==="zone-b")&&Array.isArray(current.zones)){
        var azNames=Array.from(new Set(current.instances.map(function(p){return p.availabilityZone;}))).sort();
        var azName=azNames[id==="zone-a"?0:1];
        var subnet=current.zones.find(function(s){return s.name===azName;});
        map[id].name=azName||"No registered AZ";
        map[id].id=subnet?.subnetId||"No subnet";
        map[id].location=azName||"Not available";
        map[id].details=[["App subnet",subnet?.subnetName||"Not discovered"],["Subnet ID",subnet?.subnetId||"Not discovered"],["CIDR",subnet?.cidr||"Unknown"],["ASG",current.asg?.name||"Unknown"]];
      }
    }
    return map[id]||map.vpc;
  }
  function nextHealthy() {
    var healthy=instances.map(function(x,i){return x.present&&x.healthy?i:-1;}).filter(function(i){return i>=0;});
    if(!healthy.length)return -1;
    state.turn=(state.turn+1)%healthy.length;
    return healthy[state.turn];
  }
  function reflectResponse(i,latency,status) {
    var inst=instances[i];
    state.lastInstance=i;state.lastLatency=latency;state.lastStatus=status;
    $("last-responder").textContent=inst.id;
    $("last-response-status").textContent="HTTP "+status;
    $("last-response-latency").textContent=latency+" ms";
    flashInstance(i);
    state.latency=Math.round((state.latency*3+latency)/4);
    updateStats();
    if(state.selected==="instance"+i) selectAsset(state.selected);
  }
  function reportDependency(kind,i,force) {
    var good=state[kind],latency=state.realFeed?state[kind+"Latency"]:rand(kind==="rds"?9:14,kind==="rds"?36:51);
    if(good)state[kind+"Latency"]=latency;
    var color=good?(kind==="rds"?"#c185ff":"#f0a456"):"#f06d79";
    animatePath("flow-"+kind+"-"+i,color,800,false);
    setTimeout(function(){
      if(good){
        animatePath("flow-"+kind+"-"+i,"#56d7a6",660,true);
        addActivity(kind,(kind==="rds"?"PostgreSQL SELECT 1":"S3 HeadObject")+" · success",instances[i].name+" → "+(kind==="rds"?"demo-app-postgres":"demo-app-artifacts")+" · "+latency+" ms");
      }else{
        addActivity("fail",(kind==="rds"?"PostgreSQL":"S3")+" connectivity failed",instances[i].name+" · simulated timeout");
      }
      updateDependencies();
      if(state.selected===kind||state.selected==="instance"+i)selectAsset(state.selected);
    },720);
    if(force && !good)updateDependencies();
  }
  function sendRequest() {
    if(state.liveMode){sendLiveRequest();return;}
    var i=nextHealthy();
    if(i<0){addActivity("fail","No healthy targets","All EC2 instances are unavailable");return;}
    var inst=instances[i],latency=rand(28,86),status=200;
    inst.requests++;state.requests++;
    animatePath("flow-users-alb","#5bbaff",540,false);
    setTimeout(function(){animatePath("flow-alb-"+i,"#5bbaff",710,false);},240);
    setTimeout(function(){
      if(Math.random()<.73)reportDependency("rds",i,false);
      if(Math.random()<.61)reportDependency("s3",i,false);
    },660);
    setTimeout(function(){
      animatePath("flow-alb-"+i,"#56d7a6",720,true);
      animatePath("flow-users-alb","#56d7a6",620,true);
      reflectResponse(i,latency,status);
      addActivity("app","HTTP 200 served by "+inst.name,inst.id+" · "+inst.az+" · "+latency+" ms");
      buildInstances();
    },1050);
    updateStats();
  }
  function runProbe(kind) {
    if(state.liveMode){runLiveProbe(kind);return;}
    var i=state.selected.match(/^instance\d+$/)?Number(state.selected.substring(8)):state.lastInstance;
    if(!instances[i].healthy)i=nextHealthy();
    if(i<0){addActivity("fail","Dependency check unavailable","No healthy EC2 instance available");return;}
    addActivity("app","Connectivity check requested",instances[i].name+" initiated read-only "+(kind==="rds"?"database":"S3 object")+" probe");
    reportDependency(kind,i,true);
  }
  function scaleOut() {
    var i=instances.findIndex(function(p){return !p.present;});
    if(i<0){addActivity("app","Capacity is at maximum","All six illustrative EC2 slots are present");return;}
    var inst=instances[i];inst.present=true;inst.booting=true;
    buildInstances();updateStats();
    addActivity("app","Auto Scaling launch requested",inst.name+" · "+inst.az+" · pending health checks");
    setTimeout(function(){inst.booting=false;inst.healthy=true;buildInstances();updateStats();addActivity("app","New EC2 target healthy",inst.id+" is receiving ALB traffic");},2300);
  }
  function failSelected() {
    var i=/^instance\d+$/.test(state.selected)?Number(state.selected.substring(8)):state.lastInstance;
    var alive=instances.filter(function(p){return p.present&&p.healthy;});
    if(alive.length<=1){addActivity("fail","Cannot fail the final instance","Keep one target available for the demonstration");return;}
    if(!instances[i].present||!instances[i].healthy)i=instances.findIndex(function(p){return p.present&&p.healthy;});
    instances[i].healthy=false;
    addActivity("fail","EC2 target unhealthy",instances[i].name+" removed from demo request selection");
    buildInstances();updateStats();selectAsset("instance"+i);
  }
  function restore() {
    instances.forEach(function(p){if(p.present){p.healthy=true;p.booting=false;}});
    state.rds=true;state.s3=true;
    buildInstances();updateStats();selectAsset(state.selected);
    addActivity("app","Service recovery complete","Demo EC2 targets, PostgreSQL and S3 restored");
  }
  function updateClock() {
    $("utc-clock").textContent=new Date().toLocaleTimeString("en-GB",{timeZone:"UTC",hour12:false})+" UTC";
  }
  function setupBars() {
    $("request-bars").innerHTML=Array.from({length:17},function(){return '<i style="height:'+rand(8,27)+'px"></i>';}).join("");
  }
  function setRunning(running) {
    state.running=running;
    $("generator-state").textContent=running?"Running":"Paused";
    $("generator-state").classList.toggle("paused",!running);
    $("traffic-action-label").textContent=running?"Pause traffic":"Resume traffic";
    $("traffic-action-symbol").textContent=running?"Ⅱ":"▷";
  }
  function toggleDependency(kind) {
    state[kind]=!state[kind];
    updateDependencies();selectAsset(state.selected);
    $(kind==="rds"?"toggle-rds":"toggle-s3").textContent=state[kind]?"Simulate failure":"Restore service";
    addActivity(state[kind]?kind:"fail",(kind==="rds"?"PostgreSQL":"S3")+(state[kind]?" recovered":" unavailable"),"Demo-only connectivity state changed");
  }
  async function apiJson(path) {
    var response=await fetch("/api/demo"+path,{cache:"no-store",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(10000)});
    var result=await response.json();
    if(!response.ok)throw new Error(result.error||"HTTP "+response.status);
    return result;
  }
  function applyInventory(data) {
    if(!data||!Array.isArray(data.instances))throw new Error("Invalid inventory payload");
    state.inventory=data;
    var counts=new Map(instances.map(function(p){return [p.id,p.requests];}));
    instances.forEach(function(p){p.present=false;p.healthy=false;p.booting=false;p.requests=0;});
    var zones=Array.from(new Set(data.instances.map(function(p){return p.availabilityZone;}))).sort();
    zones.slice(0,2).forEach(function(az,groupIndex){
      var group=data.instances.filter(function(p){return p.availabilityZone===az;}).slice(0,3);
      group.forEach(function(source,j){
        var target=instances[(groupIndex===0?0:3)+j];
        target.id=String(source.instanceId||"");
        target.name=String(source.name||target.id);
        target.az=String(source.availabilityZone||"Unknown");
        target.subnet=String(source.subnetId||"Unknown");
        target.present=true;
        target.healthy=source.healthy===true;
        target.booting=String(source.lifecycleState||"").toLowerCase().includes("pending");
        target.requests=counts.get(target.id)||0;
      });
    });
    document.querySelector(".env-pill").textContent="AWS / "+(data.mode==="local-test"?"LOCAL TEST":"LIVE");
    document.querySelector(".topbar-region").textContent=data.region||"AWS";
    if(data.vpc){
      document.querySelector(".vpc-name").textContent=(data.vpc.name||data.vpc.id||"VPC").slice(0,27);
      document.querySelector(".vpc-cidr").textContent=data.vpc.cidr||"";
    }
    if(data.asg)document.querySelector(".asg-name").textContent=(data.asg.name||"Auto Scaling").slice(0,29);
    if(data.alb)document.querySelector(".alb-node .resource-meta").textContent=(data.alb.name||"ALB").slice(0,22);
    if(data.rds)document.querySelector(".rds-node .resource-meta").textContent=(data.rds.identifier||"RDS").slice(0,22);
    if(data.s3)document.querySelector(".s3-node .resource-meta").textContent=(data.s3.primary||"S3 bucket").slice(0,21);
    if(Array.isArray(data.zones)){
      document.querySelectorAll(".zone").forEach(function(zone,i){
        var name=zones[i]||"Unused AZ",z=data.zones.find(function(v){return v.name===name;});
        zone.querySelector(".zone-caption").textContent=name;
        zone.querySelector(".subnet-label").textContent=z?(z.subnetName+" · "+(z.cidr||"")).slice(0,48):"No registered subnet";
      });
    }
    buildInstances();updateStats();selectAsset(state.selected);
    (data.warnings||[]).forEach(function(w){addActivity("fail","Inventory advisory",String(w).slice(0,140));});
  }
  async function loadInventory() {
    try{applyInventory(await apiJson("/inventory"));}
    catch(error){addActivity("fail","AWS inventory unavailable",String(error.message||"Discovery failed"));}
  }
  function observedDependency(dep,i){
    if(dep.kind!=="rds"&&dep.kind!=="s3")return;
    var kind=dep.kind,ok=dep.ok===true;
    state[kind]=ok;state[kind+"Latency"]=Number(dep.latencyMs)||0;
    if(i>=0){
      animatePath("flow-"+kind+"-"+i,ok?(kind==="rds"?"#c185ff":"#f0a456"):"#f06d79",760,false);
      if(ok)setTimeout(function(){animatePath("flow-"+kind+"-"+i,"#56d7a6",570,true);},780);
    }
    addActivity(ok?kind:"fail",(kind==="rds"?"PostgreSQL SELECT 1":"S3 HeadObject")+(ok?" · success":" · failed"),String(dep.resource||"Configured dependency")+" · "+(ok?state[kind+"Latency"]+" ms":String(dep.errorCode||"check failed")));
    updateDependencies();
  }
  async function sendLiveRequest() {
    if(state.requestInFlight)return;
    state.requestInFlight=true;
    try{
      var result=await apiJson("/request");
      var i=instances.findIndex(function(p){return p.present&&p.id===result.instanceId;});
      state.requests++;
      if(i>=0){
        instances[i].requests++;
        animatePath("flow-users-alb","#5bbaff",530,false);
        setTimeout(function(){animatePath("flow-alb-"+i,"#5bbaff",650,false);},150);
        setTimeout(function(){
          animatePath("flow-alb-"+i,"#56d7a6",610,true);
          animatePath("flow-users-alb","#56d7a6",520,true);
          reflectResponse(i,Number(result.latencyMs)||0,Number(result.status)||200);
          buildInstances();
        },760);
      }else{
        $("last-responder").textContent=String(result.instanceId||"Unmapped target");
        $("last-response-latency").textContent=(Number(result.latencyMs)||0)+" ms";
        addActivity("fail","Request came from an unmapped target","Refresh AWS inventory; never guess the serving EC2");
      }
      addActivity("app","Actual HTTP "+result.status+" from "+String(result.instanceId||"unknown"),String(result.availabilityZone||"")+" · "+String(result.latencyMs||0)+" ms · "+String(result.requestId||""));
      (result.dependencies||[]).forEach(function(dep){setTimeout(function(){observedDependency(dep,i);},680);});
      if(result.checksEnabled===false)updateDependencies();
      updateStats();
    }catch(error){addActivity("fail","Live request failed",String(error.message||"No response"));}
    finally{state.requestInFlight=false;}
  }
  async function runLiveProbe(kind) {
    try{
      var result=await apiJson("/check/"+kind);
      var i=instances.findIndex(function(p){return p.present&&p.id===result.instanceId;});
      observedDependency(result,i);
      if(state.selected===kind)selectAsset(kind);
    }catch(error){addActivity("fail","Live "+kind.toUpperCase()+" check unavailable",String(error.message||"No response"));}
  }
  function initializeLiveMode() {
    state.liveMode=true;state.realFeed=true;state.requests=0;state.latency=0;
    state.rds=null;state.s3=null;
    instances.forEach(function(p){p.present=false;p.healthy=false;p.booting=false;p.requests=0;});
    $("last-responder").textContent="Awaiting observed response";
    $("last-response-status").textContent="Not tested";
    $("last-response-latency").textContent="—";
    buildInstances();
    selectAsset("instance0");
    $("activity-list").innerHTML="";
    var local=pageContext.mode==="local-test";
    document.querySelector(".demo-pill").innerHTML='<span class="pulsing"></span> '+(local?"LOCAL TEST":"LIVE AWS RESPONSES");
    document.querySelector(".topology-live").innerHTML='<span class="pulsing"></span> '+(local?"LOCAL TEST":"OBSERVED REQUESTS");
    document.querySelector(".stat-card:first-child .stat-footer").textContent="Observed demo requests · this browser";
    document.querySelector(".stat-card:nth-child(3) .stat-top").textContent="RECENT SERVER TIME";
    document.querySelector(".stat-card:nth-child(3) .stat-footer").textContent="Backend duration · excludes network transit";
    document.querySelector(".dependency-panel .bottom-panel-header p").textContent=local?"Local test does not contact RDS or S3":"Checks run on the actual responding EC2 instance";
    $("request-bars").innerHTML="";
    document.querySelector(".side-note").textContent=local?"Local test mode does not contact AWS, S3, or RDS.":"Live requests use the existing ALB path. RDS and S3 checks run only when enabled. Infrastructure changes are disabled.";
    $("page-serving").textContent="Page served by "+String(pageContext.pageInstanceId||"unknown")+" · "+String(pageContext.pageAvailabilityZone||"unknown");
    ["scale-out","fail-instance","restore-instances","toggle-rds","toggle-s3"].forEach(function(id){
      $(id).disabled=true;$(id).title="Simulation-only control; disabled in live mode.";
    });
    updateStats();
    addActivity("app",local?"Local adapter test mode":"EC2 dashboard response observed","Initial HTML served by "+String(pageContext.pageInstanceId||"unknown"));
    loadInventory();
    setInterval(loadInventory,30000);
  }
  function initializeExternalFeed() {
    var feedParam=new URLSearchParams(window.location.search).get("feed");
    if(!feedParam)return;
    var target;
    try{
      target=new URL(feedParam,window.location.href);
      if(target.origin!==window.location.origin)throw new Error("Telemetry must use a same-origin endpoint.");
    }catch(e){addActivity("fail","Telemetry configuration rejected","Use a same-origin /api/events SSE endpoint");return;}
    setRunning(false);
    try{
      var feed=new EventSource(target.href);
      feed.onopen=function(){
        state.realFeed=true;
        document.querySelector(".demo-pill").innerHTML='<span class="pulsing"></span> LIVE TELEMETRY';
        document.querySelector(".topology-live").innerHTML='<span class="pulsing"></span> LIVE TELEMETRY';
        addActivity("app","Live telemetry connected","Receiving events from authenticated application backend");
      };
      feed.onmessage=function(e){
        var evt;
        try{evt=JSON.parse(e.data);}catch(x){return;}
        if(evt.type==="request"){
          var i=instances.findIndex(function(p){return p.id===evt.instanceId;});
          if(i<0)return;
          state.requests++;
          instances[i].requests++;
          var duration=Number(evt.latencyMs)||0;
          animatePath("flow-users-alb","#5bbaff",420,false);
          setTimeout(function(){animatePath("flow-alb-"+i,"#5bbaff",610,false);},150);
          setTimeout(function(){reflectResponse(i,duration,Number(evt.status)||200);buildInstances();},700);
          addActivity("app","Observed request served by "+instances[i].name,instances[i].id+" · "+duration+" ms");
          if(Array.isArray(evt.dependencies))evt.dependencies.forEach(function(dep){
            if(dep.kind!=="rds"&&dep.kind!=="s3")return;
            state[dep.kind]=dep.ok===true;
            state[dep.kind+"Latency"]=Number(dep.latencyMs)||0;
            reportDependency(dep.kind,i,false);
          });
        }else if(evt.type==="dependency"&&(evt.kind==="rds"||evt.kind==="s3")){
          var selected=instances.findIndex(function(p){return p.id===evt.instanceId;});
          state[evt.kind]=evt.ok===true;
          state[evt.kind+"Latency"]=Number(evt.latencyMs)||0;
          if(selected>=0)reportDependency(evt.kind,selected,false);
        }else if(evt.type==="target"){
          var targetInstance=instances.find(function(p){return p.id===evt.instanceId;});
          if(targetInstance){targetInstance.present=evt.present===true;targetInstance.healthy=evt.healthy===true;buildInstances();updateStats();}
        }
      };
      feed.onerror=function(){addActivity("fail","Telemetry stream interrupted","Waiting for event stream reconnection");};
    }catch(e){addActivity("fail","Telemetry stream unavailable","The browser could not open the configured endpoint");}
  }
  function init() {
    buildPaths();buildInstances();setupBars();updateStats();updateClock();
    setInterval(updateClock,1000);
    selectAsset("instance0");
    addActivity("s3","S3 HeadObject · success","demo-app-web-01 → demo-app-artifacts · 18 ms");
    addActivity("rds","PostgreSQL SELECT 1 · success","demo-app-web-01 → demo-app-postgres · 12 ms");
    addActivity("app","HTTP 200 served by demo-app-web-01","i-0a3b71e5d0c228431 · us-east-1a · 42 ms");
    $("topology").addEventListener("click",function(e){
      var target=e.target.closest(".selectable");if(target&&target.dataset.asset)selectAsset(target.dataset.asset);
    });
    document.querySelectorAll(".layer-btn").forEach(function(btn){
      btn.addEventListener("click",function(){
        state.filter=btn.dataset.filter;
        document.querySelectorAll(".layer-btn").forEach(function(b){b.classList.toggle("active",b===btn);});
        filterPaths();
      });
    });
    $("toggle-traffic").addEventListener("click",function(){setRunning(!state.running);});
    $("send-request").addEventListener("click",sendRequest);
    $("scale-out").addEventListener("click",scaleOut);
    $("fail-instance").addEventListener("click",failSelected);
    $("restore-instances").addEventListener("click",restore);
    $("check-rds").addEventListener("click",function(){runProbe("rds");});
    $("check-s3").addEventListener("click",function(){runProbe("s3");});
    $("toggle-rds").addEventListener("click",function(){toggleDependency("rds");});
    $("toggle-s3").addEventListener("click",function(){toggleDependency("s3");});
    $("security-overlay").addEventListener("change",function(){ $("topology").classList.toggle("show-security",this.checked);});
    $("fit-view").addEventListener("click",function(){
      document.querySelector('[data-filter="all"]').click();selectAsset("instance0");
    });
    if(pageContext.mode==="live"||pageContext.mode==="local-test")initializeLiveMode();
    else initializeExternalFeed();
    setInterval(function(){if(state.running&&(state.liveMode||!state.realFeed))sendRequest();},2300);
  }
  document.addEventListener("DOMContentLoaded",init);
})();
