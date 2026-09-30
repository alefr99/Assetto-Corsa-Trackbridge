'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const B=require('../core'),P=require('../project'),A=require('../race-adapter'),{validateLiveTrack}=require('../validate-live-track');
// Buffer views must preserve offsets rather than reading unrelated bytes from the pool.
const ai=Buffer.alloc(56);ai.writeInt32LE(7);ai.writeInt32LE(2,4);ai.writeFloatLE(1,36);
const pooled=Buffer.concat([Buffer.from('padding'),ai,Buffer.from('tail')]);
assert.equal(B.parseAi(pooled.subarray(7,63)).points.length,2);
assert.throws(()=>B.mapPoint([NaN,0,0]));assert.throws(()=>B.mapPoint([0,0,0],{yaw:NaN}));assert.throws(()=>B.mapPoint([0,0,0],{scale:-1}));
for(const name of ['..\\evil','C:/evil','a//b','a/./b','a\0b','a'.repeat(65536)]) assert.throws(()=>B.zip([{name,data:'x'}]));
assert.throws(()=>B.zip([{name:'valid',data:{length:3}}]));
assert.throws(()=>P.drsZones('[ZONE_0]\nDETECTION=\nSTART=0.2\nEND=0.4'));
for(const points of [[],[{positionCm:[0,0,0]}],[{positionCm:[0,0,0]},{positionCm:[NaN,0,0]}]]) assert.throws(()=>A.makeLine(points,false));
assert.throws(()=>P.timingGates([{name:'AC_TIME_0_L',position:[0,0,0]},{name:'AC_TIME_0_L',position:[1,0,0]}]),/Duplicate/);
const config=require('../build_kalinago_gp2024/trackbridge-project.json');
const race=A.readCsv(fs.readFileSync(path.join(__dirname,'../build_kalinago_gp2024/lines/fast_lane.ai.csv'),'utf8'));
const pit=A.readCsv(fs.readFileSync(path.join(__dirname,'../build_kalinago_gp2024/lines/pit_lane.ai.csv'),'utf8'));
const calibration=require('../research/native-spline-verification.json');
for(const value of [undefined,null,NaN,Infinity,-1]) for(const key of ['maxInverseParameterError','maxArcErrorM']) {
 const invalid=structuredClone(calibration);invalid.evidence[key]=value;
 assert.throws(()=>A.adapt(config,race,pit,invalid),/calibration/);
}
assert.throws(()=>A.transform(new Array(3),config.transform));
const coincident=structuredClone(config);coincident.timingGates[1]={...coincident.timingGates[0],index:1};
assert.throws(()=>A.adapt(coincident,race,pit),/Sector order/);
const fit=require('../research/kalinago-fit03.json'),stock=require('../research/bahrain_live04/snapshot.json');
const snapshot=structuredClone(stock),track=snapshot.tracks.find(t=>t.fullPath.endsWith('.RaceTrackSpline'));
track.raceCount=fit.topology.raceNodeCount;track.pitCount=fit.topology.pitNodeCount;
track.nodes=fit.topology.positionsCm.map((p,index)=>({index,position:[p.X,p.Y,p.Z]}));
assert.equal(validateLiveTrack(fit,snapshot).passed,true);
const originalPosition=track.nodes[0].position;track.nodes[0].position=new Array(3);assert.equal(validateLiveTrack(fit,snapshot).passed,false);track.nodes[0].position=originalPosition;
const saved=track.nodes[0];delete track.nodes[0];assert.equal(validateLiveTrack(fit,snapshot).passed,false);
track.nodes[0]=null;assert.equal(validateLiveTrack(fit,snapshot).passed,false);
track.nodes[0]=saved;track.nodes={length:fit.topology.positionsCm.length};assert.equal(validateLiveTrack(fit,snapshot).passed,false);
// Export CLI: nested INI, real source containment, and no successful output on errors.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'trackbridge-cli-'));
try {
 const source=path.join(root,'source'),nested=path.join(source,'nested');fs.mkdirSync(nested,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'../demo/demo.kn5'),path.join(nested,'demo.kn5'));
 fs.writeFileSync(path.join(nested,'models.ini'),'[MODEL_0]\nFILE=demo.kn5\n');
 fs.mkdirSync(path.join(nested,'ai'));fs.writeFileSync(path.join(nested,'ai/fast_lane.ai'),ai);
 const run=(layout,out)=>spawnSync(process.execPath,[path.join(__dirname,'../convert.js'),'--track',source,'--layout',layout,'--out',out,'--report-only'],{encoding:'utf8'});
 const out=path.join(root,'out');let result=run('nested/models.ini',out);assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'trackbridge-project.json')));assert.equal(manifest.models.length,1);assert.equal(manifest.lines.length,1);assert.equal(manifest.installable,false);
 const original=fs.readFileSync(path.join(nested,'demo.kn5'));result=run('nested/models.ini',out);assert.notEqual(result.status,0);assert.deepEqual(fs.readFileSync(path.join(nested,'demo.kn5')),original);
 fs.symlinkSync(path.join(nested,'demo.kn5'),path.join(source,'internal.kn5'));
 fs.writeFileSync(path.join(source,'models.ini'),'[MODEL_0]\nFILE=internal.kn5');assert.equal(run('models.ini',path.join(root,'internal')).status,0);
 fs.writeFileSync(path.join(root,'external.kn5'),original);fs.symlinkSync(path.join(root,'external.kn5'),path.join(source,'external.kn5'));
 fs.writeFileSync(path.join(source,'models.ini'),'[MODEL_0]\nFILE=external.kn5');result=run('models.ini',path.join(root,'escaped'));assert.notEqual(result.status,0);assert.match(result.stderr,/outside/,JSON.stringify(result));assert.equal(fs.existsSync(path.join(root,'escaped')),false);
 // A parse failure after staging begins must not leave a partial export.
 fs.writeFileSync(path.join(source,'broken.kn5'),'bad KN5');fs.writeFileSync(path.join(source,'models.ini'),'[MODEL_0]\nFILE=broken.kn5');
 const brokenOutput=path.join(root,'broken-output');assert.notEqual(run('models.ini',brokenOutput).status,0);assert.equal(fs.existsSync(brokenOutput+'.partial'),false);
 fs.writeFileSync(path.join(source,'models.ini'),'[OTHER]\nFILE=demo.kn5');assert.notEqual(run('models.ini',path.join(root,'empty')).status,0);
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('Stability regressions passed: binary views, ZIP paths, finite geometry, calibration evidence, timing gates, live identity and CLI paths');
