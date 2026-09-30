'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {knots,evaluate,parameterAtDistance}=require('../native-spline'),{fit}=require('../fit-track'),{buildCurves,projectMarker}=require('../project-fitted-markers');
const p=[[0,0,0],[1,0,0],[2,0,0],[3,0,0]];
assert.throws(()=>knots(new Array(4)),/finite/);assert.throws(()=>knots([p[0],new Array(3),p[2],p[3]]),/finite/);
for(const invalid of [[0,1,1,2],[0,1,NaN,3],new Array(4)])assert.throws(()=>evaluate(p,1.5,invalid),/knots/);
for(const table of [[{distanceM:1,parameter:2},{distanceM:.5,parameter:3}],[{distanceM:1,parameter:NaN}],[{distanceM:1,parameter:0}],new Array(2)])assert.throws(()=>parameterAtDistance(table,.2,1));
assert.throws(()=>parameterAtDistance([{distanceM:1,parameter:2}],.2,NaN));
for(const options of [{maxNodes:Infinity},{maxNodes:4.5},{sampleStepM:Infinity},{toleranceM:NaN},{initialSpacingM:Infinity}])assert.throws(()=>fit(p,options),/options/);
assert.throws(()=>buildCurves({passed:true},0),/step/);assert.throws(()=>projectMarker([NaN,0,0],[]),/projection/);
// All captured native lookup tables remain accepted by the stricter validation.
const folder=path.join(__dirname,'../research/bahrain_live05');let tables=0;
for(const name of fs.readdirSync(folder).filter(n=>/^track-0-node-\d+-table8\.bin$/.test(n))){
 const index=Number(name.match(/node-(\d+)/)[1]),raw=fs.readFileSync(path.join(folder,'track-0-nodes.bin')),bytes=fs.readFileSync(path.join(folder,name));
 if(!bytes.length)continue;
 const table=Array.from({length:bytes.length/8},(_,i)=>({distanceM:bytes.readFloatLE(i*8),parameter:bytes.readFloatLE(i*8+4)}));
 const start=raw.readFloatLE(index*152+88);assert.equal(parameterAtDistance(table,0,start).parameter,start);assert.equal(parameterAtDistance(table,table.at(-1).distanceM,start).parameter,table.at(-1).parameter);tables++;
}
assert(tables>0);console.log('Curve validation passed, including '+tables+' real native lookup tables');
