'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const file of fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.js')).sort()) {
 const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit'});
 if(result.error) throw result.error;
 if(result.status!==0) process.exit(result.status || 1);
}
const built=spawnSync(process.execPath,['scripts/build-standalone.js','--check'],{cwd:root,stdio:'inherit'});
if(built.error) throw built.error;
process.exit(built.status || 0);
