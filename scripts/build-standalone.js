'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="(core|project|app)\.js"><\/script>/g,(_,name)=>'<script>\n'+fs.readFileSync(path.join(root,name+'.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>');
const target=path.join(root,'TrackBridge.html');
if(process.argv.includes('--check')) {
 if(fs.readFileSync(target,'utf8')!==html) throw Error('TrackBridge.html is stale: run npm run build');
} else fs.writeFileSync(target,html);
