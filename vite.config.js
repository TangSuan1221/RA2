import {actionSettingsApi} from './combat-framework/render/action-settings-api.mjs';
import {placementApi} from './src/editor/snap/api.js';
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=import.meta.dirname;
const candidate=resolve(root,'src/demo/station-candidate.js');
const directory=resolve(root,'src/demo/released');
const release=resolve(directory,'station.js');
function sceneReview(){
  return {name:'scene-review',configureServer(server){
    server.middlewares.use('/api/review/station',(req,res)=>{
      const source=readFileSync(candidate);
      const revision=createHash('sha256').update(source).digest('hex');
      res.setHeader('Cache-Control','no-store');
      if(req.method==='POST'){
        const origin=req.headers.origin;
        if(!origin || new URL(origin).host!==req.headers.host || req.headers['x-review-revision']!==revision){
          res.statusCode=409;return res.end('请刷新后重新验收当前版本');
        }
        mkdirSync(directory,{recursive:true});
        writeFileSync(release+'.tmp',source);
        renameSync(release+'.tmp',release);
      }else if(req.method!=='GET'){res.statusCode=405;return res.end();}
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({revision,merged:existsSync(release)&&readFileSync(release).equals(source)}));
    });
  }};
}
export default defineConfig({plugins:[actionSettingsApi(),sceneReview(),placementApi()],build:{rollupOptions:{input:Object.fromEntries(['motion','index','combat','review','station'].map(name=>[name,resolve(root,name+'.html')]).concat([['snapLab',resolve(root,'docs/snap-lab.html')]]))}}});

