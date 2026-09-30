'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../core'),P=require('../project'),A=require('../race-adapter');
const root=path.resolve(__dirname,'..');
// Execute the actual browser application with a minimal DOM, preserving its export handler.
const canvasContext=new Proxy({}, {get:()=>()=>{}}),elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:id==='scale'?'100':id==='yaw'?'0':id==='layout'?'track/models_gp_2024.ini':'',checked:id==='physics',clientWidth:600,clientHeight:400,textContent:'',querySelectorAll:()=>[],getContext:()=>canvasContext,addEventListener:()=>{}});return elements.get(id);}
const sandbox={TrackBridge:B,TrackProject:P,document:{getElementById:element},window:{devicePixelRatio:1},TextEncoder,Uint8Array,Blob,console,setTimeout:callback=>{callback();}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),sandbox);
const config=JSON.parse(fs.readFileSync(path.join(root,'build_kalinago_gp2024/trackbridge-project.json')));
sandbox.inputConfig=config;
sandbox.model=B.parseKn5(fs.readFileSync(path.join(root,'demo/demo.kn5')));
sandbox.aiLines=['fast_lane','pit_lane'].map(name=>({name:name+'.ai',source:'track/gp_2024/ai/'+name+'.ai',...B.parseAi(fs.readFileSync(path.join(root,'sources/kalinago_v092/content/tracks/00_kalinago/gp_2024/ai/'+name+'.ai')))}));
vm.runInContext("state.models=[{name:'demo.kn5',source:'track/demo.kn5',size:1,position:[0,0,0],model}];state.lines=aiLines;state.metadata=inputConfig;download=(blob,name)=>{globalThis.resultBlob=blob;globalThis.resultName=name;};",sandbox);
function unzip(bytes){const entries=new Map();let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30,name=bytes.subarray(start,start+nameLength).toString('utf8'),dataAt=start+nameLength+extra;entries.set(name,bytes.subarray(dataAt,dataAt+size));offset=dataAt+size;}return entries;}
(async()=>{
 await element('export').onclick();assert(sandbox.resultBlob,element('status').textContent);
 const entries=unzip(Buffer.from(await sandbox.resultBlob.arrayBuffer()));
 const manifest=JSON.parse(entries.get('trackbridge-project.json'));
 assert.equal(manifest.installable,false);assert.equal(manifest.coordinateUnits,'centimetres');assert.deepEqual(manifest.transform,{axisMap:'x,z,y',scale:100,yaw:0});
 assert.equal(manifest.lines.length,2);assert(entries.has('models/0_demo/model.obj'));assert(entries.has('models/0_demo/collision.obj'));
 const race=A.readCsv(entries.get('lines/fast_lane.ai.csv').toString()),pit=A.readCsv(entries.get('lines/pit_lane.ai.csv').toString());
 const adapted=A.adapt(manifest,race,pit);
 assert.equal(adapted.installable,false);assert.equal(adapted.timingGates.length,3);assert(Math.abs(adapted.race.polylineLengthM-5717.0059111)<1e-5);
 sandbox.resultBlob=null;vm.runInContext('state.lines.push(state.lines[0]);',sandbox);await element('export').onclick();
 assert.equal(sandbox.resultBlob,null);assert.match(element('status').textContent,/Duplicate AI line/);
 console.log('Browser export integration passed: actual ZIP, CLI-compatible manifest/CSV, geometry adapter and duplicate-layout rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
