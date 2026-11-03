const identityState = {value:null, expires:0};

async function imds(path) {
  const tokenResponse = await fetch("http://169.254.169.254/latest/api/token", {
    method:"PUT",
    headers:{"X-aws-ec2-metadata-token-ttl-seconds":"21600"},
    signal:AbortSignal.timeout(800)
  });
  if (!tokenResponse.ok) throw new Error("IMDSv2 token request failed.");
  const token = await tokenResponse.text();
  const valueResponse = await fetch("http://169.254.169.254/latest/meta-data/"+path,{
    headers:{"X-aws-ec2-metadata-token":token},
    signal:AbortSignal.timeout(800)
  });
  if (!valueResponse.ok) throw new Error("IMDSv2 metadata request failed.");
  return valueResponse.text();
}

export async function identity(localTestMode=false) {
  if (identityState.value && identityState.expires>Date.now()) return identityState.value;
  let value;
  if (localTestMode) {
    value={instanceId:"i-local-test",availabilityZone:"local-test",region:"local",source:"local-test"};
  } else {
    const [instanceId,availabilityZone]=await Promise.all([imds("instance-id"),imds("placement/availability-zone")]);
    value={instanceId,availabilityZone,region:availabilityZone.slice(0,-1),source:"imds-v2"};
  }
  identityState.value=value;
  identityState.expires=Date.now()+300000;
  return value;
}
