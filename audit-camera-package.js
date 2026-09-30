'use strict';
const assert=require('node:assert/strict');
const localIndex=ref=>{
 const path=ref?.ObjectPath;
 assert.ok(typeof path==='string'&&path.startsWith('/Game/Circuits/Bahrain/Lvl_Bahrain.'),'Expected local object reference');
 const index=Number(path.split('.').at(-1));assert.ok(Number.isInteger(index)&&index>=0&&index<208,'Invalid local reference');return index;
};
function equalPatch(actual,expected,label){
 if(typeof expected==='number'){
  // Zero-valued unversioned properties can be omitted by the independent reader.
  if(actual===undefined&&expected===0)actual=0;
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=Math.max(.0002,Math.abs(expected)*2e-7),label);return;
 }
 if(expected&&typeof expected==='object'){
  if(Array.isArray(expected))assert.equal(actual?.length,expected.length,label);
  for(const key of Object.keys(expected))equalPatch(actual?.[key],expected[key],label+'.'+key);return;
 }
 assert.equal(actual,expected,label);
}
function auditCameraPackage(selected,patch,baseline){
 const objects=new Map(selected.map(o=>[o.index,o.value]));assert.equal(objects.size,selected.length,'Duplicate decoded export');
 for(const edit of patch.exports){const o=objects.get(edit.index);assert.equal(o?.Name,edit.name,'Export identity changed');equalPatch(o.Properties,edit.Properties,'export '+edit.index);}
 const level=objects.get(24);assert.equal(level?.Type,'Level');
 const expected=baseline[24].Actors.filter(ref=>!patch.removeActors.includes(baseline[ref?localIndex(ref):-1]?.Name));
 assert.deepEqual(level.Actors.map(r=>r?.ObjectPath??null),expected.map(r=>r?.ObjectPath??null),'Unexpected level actor change');
 const active=new Set(level.Actors.filter(Boolean).map(localIndex));
 const raceCount=129,pitFirst=130,pitLast=157,raceCoverage=new Set(),pitCoverage=new Set();let startCameras=0;
 for(const camera of patch.coverage){
  const o=objects.get(camera.index),p=o.Properties,actorIndex=localIndex(o.Outer),actor=objects.get(actorIndex);
  assert.ok(active.has(actorIndex),'Camera actor excluded from level');
  assert.equal(localIndex(actor.Properties.CameraComponent),camera.index,'Actor/component reference mismatch');
  assert.equal(localIndex(p.AttachParent),camera.root,'Attachment changed');
  assert.equal(localIndex(actor.Properties.RootComponent),camera.root,'Root component mismatch');
  assert.equal(localIndex(objects.get(camera.root).Outer),actorIndex,'Root belongs to another actor');
  const start=p.TrackNodeID??0,end=p.LastTrackNodeID??0,isRace=start<raceCount;
  assert.ok(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>=0);
  assert.equal(isRace,end<raceCount,'Cross-domain camera range');
  if(!isRace)assert.ok(start>=pitFirst&&end<=pitLast&&start<=end,'Invalid pit interval');
  assert.equal(p.CameraType,camera.type);
  if(p.CameraType==='ECameraType::TrackCamMax'){startCameras++;assert.equal(start,0,'Race start camera moved away from finish');}
  if(p.CameraType==='ECameraType::TrackSide'){
   let i=start;for(let k=0;k<(isRace?raceCount:pitLast-pitFirst+1);k++,i=isRace?(i+1)%raceCount:i+1){(isRace?raceCoverage:pitCoverage).add(i);if(i===end)break;}
  }
 }
 assert.equal(startCameras,1,'Expected one race start camera');
 assert.equal(raceCoverage.size,raceCount,'Normal camera coverage has a gap');
 assert.equal(pitCoverage.size,pitLast-pitFirst+1,'Normal pit camera coverage has a gap');
 assert.ok(!active.has(162),'Stock spline camera still active');
 // A camera edit must leave all racing and garage data unchanged.
 const trackIndex=baseline.findIndex(o=>o?.Name==='RaceTrackSpline');
 assert.ok(trackIndex>=0&&objects.has(trackIndex),'Race component missing from readback');
 assert.deepEqual(objects.get(trackIndex).Properties,baseline[trackIndex].Properties,'Race component changed');
 return {offlineReadbackPassed:true,runtimeValidated:false,decodedExports:selected.length,cameraEdits:patch.exports.length,activeRemappedCameras:patch.coverage.length,raceNodesCovered:raceCoverage.size,pitNodesCovered:pitCoverage.size,splineCameraExcluded:true};
}
module.exports={auditCameraPackage,equalPatch};
if(require.main===module){
 const fs=require('node:fs'),[selected,patch,baseline,out]=process.argv.slice(2);
 if(!out)throw Error('Usage: node audit-camera-package.js SELECTED.json PATCH.json BASELINE.json NEW_REPORT.json');
 const read=p=>JSON.parse(fs.readFileSync(p));let source=read(baseline);
 if(source[0]?.index!==undefined){const indexed=Array(208).fill(null);for(const entry of source)indexed[entry.index]=entry.value;source=indexed;}
 const result=auditCameraPackage(read(selected),read(patch),source);
 fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});console.log(result);
}
