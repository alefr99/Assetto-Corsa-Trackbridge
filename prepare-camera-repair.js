'use strict';
// Map camera coverage by travelled distance, retaining the native camera actors.
const fs=require('node:fs');
const {buildCurves}=require('./project-fitted-markers');
const {createRaceNodeMapper}=require('./camera-distance-mapping');
const read=p=>JSON.parse(fs.readFileSync(p));
function prepareCameraRepair(objects,fit,raw) {
if(!Array.isArray(objects)||!Buffer.isBuffer(raw)||raw.length<108*0x98)throw Error('Invalid source camera data');
if(fit.topology?.raceNodeCount!==fit.race?.nodes?.length||fit.topology?.positionsCm?.length!==fit.topology.raceNodeCount+fit.topology.pitNodeCount)throw Error('Invalid target topology');
const curves=buildCurves(fit.race), chain=[0];for(const c of curves)chain.push(chain.at(-1)+c.lengthM);
const mapper=createRaceNodeMapper(Array.from({length:108},(_,i)=>({chainage:raw.readFloatLE(i*0x98+0x6c),length:raw.readFloatLE(i*0x98+0x68)})),106,chain);
function remap(n){
 if(!Number.isInteger(n)||n<0||n>123||n===108)throw Error('Invalid source camera node: '+n);
 if(n>=109)return fit.topology.pitEntryNode+Math.round((n-109)/14*(fit.topology.pitExitNode-fit.topology.pitEntryNode));
 return mapper.map(n);
}
const changes=new Map(),coverage=[];
function patch(i,p){changes.set(i,{index:i,name:objects[i].Name,Properties:{...(changes.get(i)?.Properties??{}),...p}});}
const nodes=fit.topology.positionsCm;
if(!nodes.every(p=>p&&['X','Y','Z'].every(k=>Number.isFinite(p[k]))))throw Error('Nonfinite camera target');
const raceCount=fit.topology.raceNodeCount;
const removeActors=['RaceSimSplineCameraActor_2'];
for(let i=0;i<objects.length;i++){
 const o=objects[i],p=o.Properties??{};
 const actor=Number(o.Outer?.ObjectPath?.split('.').at(-1));
 if(o.Type==='RaceSimCameraComponent' && !removeActors.includes(objects[actor]?.Name) && ['ECameraType::TrackSide','ECameraType::OptionalTrackSide','ECameraType::TrackCamMax'].includes(p.CameraType)){
  // CUE4Parse omits zero-valued unversioned fields. Zero is a real node,
  // including when LastTrackNodeID is the end of a wrapped interval.
  const start=remap(p.TrackNodeID===undefined?0:p.TrackNodeID),end=remap(p.LastTrackNodeID===undefined?0:p.LastTrackNodeID);
  if((start<raceCount)!==(end<raceCount))throw Error('Camera crosses race/pit domains');
  const fields={TrackNodeID:start,LastTrackNodeID:end};
  if(p.BehaviourSettings?.length)fields.BehaviourSettings=p.BehaviourSettings.map(()=>({
   TrackingSettings:{TrackingMethod:'ETrackingMethod::Follow',HasLatePickup:false,HasDropOffPoint:false,RelativeOffset:{X:0,Y:0,Z:100}},
   ZoomSettings:{ZoomMethod:'EZoomMethod::Automatic',TargetViewHeight:1400,ShouldInterpZoom:true,ZoomInterpSpeed:8},ShouldFinishCompleteShot:false
  }));
  patch(i,fields);
  const rootIndex=Number(p.AttachParent?.ObjectPath.split('.').at(-1)),root=objects[rootIndex];
  if(root?.Properties?.RelativeLocation){
   const middle=start<raceCount?(start+Math.floor(((end-start+raceCount)%raceCount)/2))%raceCount:Math.floor((start+end)/2);
   const pos=nodes[middle],next=nodes[middle<raceCount?(middle+1)%raceCount:Math.min(middle+1,nodes.length-1)],yaw=Math.atan2(next.Y-pos.Y,next.X-pos.X);
   const offset=middle<raceCount?5500:3500,height=middle<raceCount?2200:1500;
   patch(rootIndex,{RelativeLocation:{X:pos.X-Math.sin(yaw)*offset,Y:pos.Y+Math.cos(yaw)*offset,Z:pos.Z+height},...(root.Properties.RelativeRotation?{RelativeRotation:{Pitch:-Math.atan2(height,offset)*180/Math.PI,Yaw:yaw*180/Math.PI-90,Roll:0}}:{})});
  }
  coverage.push({index:i,root:rootIndex,camera:o.Outer?.ObjectName,type:p.CameraType,start,end});
 }
 if(o.Type==='RaceSimHelicamPositionComponent'){
  const n=remap(p.StartNodeID??0),pos=nodes[n];patch(i,{StartNodeID:n,RelativeLocation:{X:pos.X,Y:pos.Y,Z:pos.Z+12000}});
 }
}
const result={installable:false,runtimeValidated:false,sourceLapLengthM:mapper.total,removeActors,exports:[...changes.values()],coverage,limitations:['Runtime shots and occlusion require validation','The stock spline camera is excluded from the level actor list; exports and object indices are preserved']};
return result;
}
module.exports={prepareCameraRepair};
if(require.main===module){
const objects=read('research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json');
const fit=read('research/kalinago-fit03.json'),raw=fs.readFileSync('research/bahrain_live05/track-0-nodes.bin');
const result=prepareCameraRepair(objects,fit,raw);
fs.writeFileSync(process.argv[2]??'research/camera-layout04.json',JSON.stringify(result,null,2),{flag:'wx'});
console.log('Prepared',result.exports.length,'camera edits with distance-based coverage and automatic zoom');
}
