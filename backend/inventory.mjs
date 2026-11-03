import {EC2Client,DescribeInstancesCommand,DescribeSubnetsCommand,DescribeVpcsCommand} from "@aws-sdk/client-ec2";
import {AutoScalingClient,DescribeAutoScalingGroupsCommand} from "@aws-sdk/client-auto-scaling";
import {ElasticLoadBalancingV2Client,DescribeTargetHealthCommand,DescribeLoadBalancersCommand} from "@aws-sdk/client-elastic-load-balancing-v2";
import {RDSClient,DescribeDBInstancesCommand} from "@aws-sdk/client-rds";

let cache=null;
let inFlight=null;

function tagName(tags,fallback) {
  return tags?.find(t=>t.Key==="Name")?.Value || fallback;
}
function compactError(err) {
  return String(err?.name||"DiscoveryError").replace(/[^A-Za-z0-9_]/g,"").slice(0,48);
}
function testFixture(cfg) {
  return {
    mode:"local-test",collectedAt:new Date().toISOString(),region:"local",
    vpc:{id:"vpc-local",name:"local-test-vpc",cidr:"127.0.0.0/8"},
    alb:{name:"local-test-alb",scheme:"internal"},
    asg:{name:"local-test-asg",desired:1,min:1,max:1},
    zones:[{name:"local-test",subnetId:"subnet-local",subnetName:"local-test-subnet",cidr:"127.0.0.0/8"}],
    instances:[{instanceId:"i-local-test",name:"local-test-instance",availabilityZone:"local-test",subnetId:"subnet-local",healthy:true,healthState:"healthy",lifecycleState:"InService"}],
    rds:{identifier:"not-connected",endpoint:null,port:5432,multiAz:false},
    s3:{primary:"not-connected",replica:"not-connected"},
    warnings:["Local test is not connected to AWS."]};
}

async function discover(cfg) {
  if(cfg.localTestMode)return testFixture(cfg);
  const ec2=new EC2Client({region:cfg.awsRegion});
  const asgClient=new AutoScalingClient({region:cfg.awsRegion});
  const elb=new ElasticLoadBalancingV2Client({region:cfg.awsRegion});
  const rds=new RDSClient({region:cfg.awsRegion});
  const warnings=[];

  const asgResult=await asgClient.send(new DescribeAutoScalingGroupsCommand({AutoScalingGroupNames:[cfg.asgName]}));
  const group=asgResult.AutoScalingGroups?.[0];
  if(!group)throw new Error("Configured Auto Scaling group was not found.");
  const groupInstances=group.Instances||[];
  const ids=groupInstances.map(i=>i.InstanceId).filter(Boolean);
  const details=ids.length?await ec2.send(new DescribeInstancesCommand({InstanceIds:ids})):null;
  const machines=(details?.Reservations||[]).flatMap(r=>r.Instances||[]);
  const byId=new Map(machines.map(i=>[i.InstanceId,i]));
  const targetHealth=await elb.send(new DescribeTargetHealthCommand({TargetGroupArn:cfg.targetGroupArn}));
  const targets=new Map((targetHealth.TargetHealthDescriptions||[]).map(x=>[x.Target?.Id,x.TargetHealth?.State]));
  const instances=groupInstances.map(a=>{
    const instance=byId.get(a.InstanceId);
    const targetState=targets.get(a.InstanceId)||"not-registered";
    return {
      instanceId:a.InstanceId,
      name:tagName(instance?.Tags,a.InstanceId),
      availabilityZone:a.AvailabilityZone || instance?.Placement?.AvailabilityZone || "unknown",
      subnetId:instance?.SubnetId||"",
      privateIp:instance?.PrivateIpAddress||"",
      lifecycleState:a.LifecycleState||"unknown",
      targetHealth:targetState,
      healthy:a.LifecycleState==="InService"&&targetState==="healthy"
    };
  });
  if(instances.length>6)warnings.push("The prototype canvas displays only six EC2 nodes. Expand its dynamic layout for larger fleets.");
  if(new Set(instances.map(i=>i.availabilityZone)).size>2)warnings.push("The prototype canvas displays only two availability zones. Extend its layout for more AZs.");

  const subnets=Array.from(new Set(instances.map(i=>i.subnetId).filter(Boolean)));
  const subnetResult=subnets.length?await ec2.send(new DescribeSubnetsCommand({SubnetIds:subnets})):null;
  const zones=(subnetResult?.Subnets||[]).map(s=>({
    name:s.AvailabilityZone,subnetId:s.SubnetId,subnetName:tagName(s.Tags,s.SubnetId),cidr:s.CidrBlock
  }));
  const vpcId=machines[0]?.VpcId||"";
  const vpcResult=vpcId?await ec2.send(new DescribeVpcsCommand({VpcIds:[vpcId]})):null;
  const vpcData=vpcResult?.Vpcs?.[0];
  let alb={name:cfg.albName||"Configured ALB",scheme:"internal"};
  if(cfg.albName){
    try{
      const result=await elb.send(new DescribeLoadBalancersCommand({Names:[cfg.albName]}));
      const lb=result.LoadBalancers?.[0];
      if(lb)alb={name:lb.LoadBalancerName,scheme:lb.Scheme,dnsName:lb.DNSName,vpcId:lb.VpcId};
    }catch(e){warnings.push("ALB discovery: "+compactError(e));}
  }
  let database={identifier:cfg.rdsIdentifier||"Configured database",endpoint:cfg.dbHost||null,port:cfg.dbPort,multiAz:null};
  if(cfg.rdsIdentifier){
    try{
      const result=await rds.send(new DescribeDBInstancesCommand({DBInstanceIdentifier:cfg.rdsIdentifier}));
      const db=result.DBInstances?.[0];
      if(db)database={
        identifier:db.DBInstanceIdentifier,
        endpoint:db.Endpoint?.Address||cfg.dbHost,
        port:db.Endpoint?.Port||cfg.dbPort,
        multiAz:db.MultiAZ,
        engine:db.Engine,
        status:db.DBInstanceStatus
      };
    }catch(e){warnings.push("RDS discovery: "+compactError(e));}
  }
  return {
    mode:"live",collectedAt:new Date().toISOString(),region:cfg.awsRegion,
    vpc:{id:vpcId,name:tagName(vpcData?.Tags,vpcId),cidr:vpcData?.CidrBlock||""},
    alb,asg:{name:group.AutoScalingGroupName,desired:group.DesiredCapacity,min:group.MinSize,max:group.MaxSize},
    targetGroup:{arn:cfg.targetGroupArn},
    zones,instances,rds:database,s3:{primary:cfg.s3Bucket,replica:cfg.s3ReplicaBucket||""},
    warnings
  };
}

export async function inventory(cfg) {
  if(cache && cache.expires>Date.now())return cache.data;
  if(inFlight)return inFlight;
  inFlight=discover(cfg).then(data=>{
    cache={data,expires:Date.now()+cfg.inventoryTtlMs};
    return data;
  }).catch(err=>{
    if(cache)return {...cache.data,stale:true,warnings:[...(cache.data.warnings||[]),"Refresh failed: "+compactError(err)]};
    throw err;
  }).finally(()=>{inFlight=null;});
  return inFlight;
}
