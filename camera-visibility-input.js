'use strict';
const crypto=require('node:crypto');
const {buildCurves}=require('./project-fitted-markers');
function visibilityInput(patch,fit){
 const race=buildCurves(fit.race),pit=buildCurves(fit.pit),count=fit.topology.raceNodeCount;
 return patch.coverage.map(c=>{
  const isRace=c.start<count,curves=isRace?race:pit,n=isRace?count:fit.pit.nodes.length,offset=isRace?0:fit.topology.pitEntryNode;
  const ids=[];let i=c.start-offset;
  for(let k=0;k<n;k++,i=(i+1)%n){if(i===c.end-offset)break;ids.push(i);}
  if(!ids.length||ids.some(i=>!curves[i]))throw Error('Empty or invalid camera interval');
  const samples=ids.flatMap(i=>curves[i].samples.map(s=>s.point));
  const targets=Array.from({length:5},(_,j)=>samples[Math.round(j*(samples.length-1)/4)].map((x,k)=>x+(k===2?1:0)));
  const mid=targets[2].map((x,k)=>x-(k===2?1:0)),near=samples[Math.min(samples.length-1,Math.round(samples.length/2)+1)];
  return {...c,mid,targets,yaw:Math.atan2(near[1]-mid[1],near[0]-mid[0])};
 });
}
function inputHash(input){return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');}
function applyVisibility(patch,fit,report){
 const input=visibilityInput(patch,fit);
 if(report.inputSha256!==inputHash(input)||report.cameras?.length!==input.length)throw Error('Visibility report belongs to another camera input');
 const result=structuredClone(patch),seen=new Set();
 for(const camera of report.cameras){
  const original=input.find(c=>c.index===camera.index);
  if(!original||seen.has(camera.index)||Object.keys(original).some(k=>JSON.stringify(camera[k])!==JSON.stringify(original[k])))throw Error('Visibility camera identity mismatch');
  seen.add(camera.index);
  if(camera.sampleCount!==5||camera.visibleSamples!==5||camera.clear?.length!==5||camera.clear.some(x=>x!==true))throw Error('Obstructed camera samples');
  if(camera.positionM?.length!==3||!camera.positionM.every(Number.isFinite)||![camera.pitch,camera.heading].every(Number.isFinite))throw Error('Nonfinite camera position');
  const root=result.exports.find(e=>e.index===camera.root);
  if(!root?.Properties.RelativeLocation)throw Error('Missing camera root patch');
  root.Properties.RelativeLocation=Object.fromEntries(['X','Y','Z'].map((k,i)=>[k,camera.positionM[i]*100]));
  root.Properties.RelativeRotation={Pitch:camera.pitch,Yaw:camera.heading,Roll:0};
 }
 result.sampledVisibility={cameraCount:report.cameras.length,samples:report.cameras.length*5,inputSha256:report.inputSha256,runtimeValidated:false};
 return result;
}
module.exports={visibilityInput,inputHash,applyVisibility};
