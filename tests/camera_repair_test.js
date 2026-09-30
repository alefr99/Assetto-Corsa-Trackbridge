'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {prepareCameraRepair}=require('../prepare-camera-repair');
const {visibilityInput,inputHash,applyVisibility}=require('../camera-visibility-input');
const root=path.join(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const stock=read('research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json');
const fit=read('research/kalinago-fit03.json'),raw=fs.readFileSync(path.join(root,'research/bahrain_live05/track-0-nodes.bin'));
assert.equal(stock[102].Properties.TrackNodeID,undefined,'Regression fixture must omit the real zero node');
const original=JSON.stringify(stock),patch=prepareCameraRepair(stock,fit,raw);
assert.equal(JSON.stringify(stock),original,'Generator mutated its source');
assert.deepEqual(patch.exports.find(e=>e.index===102).Properties.TrackNodeID,5);
assert.equal(patch.exports.find(e=>e.index===102).Properties.LastTrackNodeID,14);
assert.ok(patch.exports.some(e=>e.index===196),'Skipped camera root');
assert.ok(!patch.exports.some(e=>[105,106,107,201].includes(e.index)),'Generic or excluded spline camera edited');
assert.deepEqual(patch.removeActors,['RaceSimSplineCameraActor_2']);
let zeroEnd=structuredClone(stock);delete zeroEnd[72].Properties.LastTrackNodeID;
assert.equal(prepareCameraRepair(zeroEnd,fit,raw).exports.find(e=>e.index===72).Properties.LastTrackNodeID,5,'Omitted end means node zero, not the start node');
for(const bad of [null,-1,108,124,1.5]){let s=structuredClone(stock);s[102].Properties.TrackNodeID=bad;assert.throws(()=>prepareCameraRepair(s,fit,raw),/Invalid source camera node/);}
let bad=structuredClone(fit);bad.topology.positionsCm[0].X=Infinity;assert.throws(()=>prepareCameraRepair(stock,bad,raw),/Nonfinite/);
const report=read('research/camera-repair1005/visibility.json');
assert.equal(inputHash(visibilityInput(patch,fit)),report.inputSha256);
const final=applyVisibility(patch,fit,report);
assert.deepEqual(final,read('research/camera-repair1005/level-patch.json'),'Reviewed patch became stale');
assert.equal(final.sampledVisibility.samples,165);
for(const mutate of [r=>r.inputSha256='0'.repeat(64),r=>r.cameras[0].visibleSamples=4,r=>r.cameras[0].positionM[0]=Infinity,r=>r.cameras[1]=r.cameras[0]]){let r=structuredClone(report);mutate(r);assert.throws(()=>applyVisibility(patch,fit,r));}
console.log('Camera repair: omitted zero fields, bounds, spline exclusion, source preservation, report identity and 165 visibility samples passed');
