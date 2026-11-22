import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sets} from './catalog.js';
import {snap} from './solver.js';
import {context} from './context.js';
import {resolvePolicy,profiles} from './config.js';
const file=new URL('../../world/placements/saved.json',import.meta.url);
const revision=s=>createHash('sha256').update(s).digest('hex');
export function placementApi(){return {name:'placement-editor',configureServer(server){
 server.middlewares.use('/api/placements',async(req,res)=>{
  const send=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))};
  try{
   if(req.method==='GET'){const raw=readFileSync(file,'utf8');return send(200,{data:JSON.parse(raw),revision:revision(raw)})}
   if(req.method!=='POST'||!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'来源无效'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>64000)return send(413,{error:'请求过大'})}
   const {scene,changes,base}=JSON.parse(body),set=Object.hasOwn(sets,scene)&&sets[scene];
   if(!set||!Array.isArray(changes))return send(400,{error:'场景无效'});
   const raw=readFileSync(file,'utf8');if(base!==revision(raw))return send(409,{error:'已有更新，请重新加载比较'});
   const data=JSON.parse(raw);data[scene]??={};
   for(const o of changes){
    if(!set.objects.some(s=>s.id===o.id)||!Object.hasOwn(profiles,o.profile)||!['x','y','z','yaw'].every(k=>Number.isFinite(o.transform?.[k])))return send(400,{error:'无效放置数据'});
    const original=set.objects.find(s=>s.id===o.id);
    const keys=Object.keys(o.policyOverride??{});
    if(keys.some(k=>!['angleStep','allowOffGrid','yOffset'].includes(k))||
       (o.policyOverride?.angleStep!=null&&!(Number.isFinite(o.policyOverride.angleStep)&&o.policyOverride.angleStep>0))||
       (o.policyOverride?.yOffset!=null&&!Number.isFinite(o.policyOverride.yOffset)))return send(400,{error:'无效策略'});
    const obj={...original,...o},policy=resolvePolicy(obj);
    const query={object:obj,current:o.transform,pointer:o.transform,policy,layer:'ped'};
    const check=snap(query,context(set,set.objects,obj));
    if(!check.valid)return send(422,{error:check.issues.map(i=>i.code).join(', ')});
    data[scene][o.id]={...(original.parent?{parent:original.parent}:{}),...(check.anchorId?{anchorId:check.anchorId}:{}),profile:o.profile,policyOverride:o.policyOverride,transform:o.transform};
   }
   const next=JSON.stringify(data,null,2)+'\n';writeFileSync(new URL('saved.tmp',file),next);renameSync(new URL('saved.tmp',file),file);
   send(200,{revision:revision(next)});
  }catch{send(400,{error:'保存失败，检查输入'})}
 });
}}}
