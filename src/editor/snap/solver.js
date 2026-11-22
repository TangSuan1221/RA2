import {config} from './config.js';
const messages={'no-surface':'占地没有完整支撑面','no-socket':'缺少兼容安装点','out-of-world':'超出编辑边界','path-too-narrow':'步行主通道不足 1.2 m','gap-matrix':'净距靠近通行分档边界','slope-too-steep':'支撑面坡度超过 12%','overlap':'占地与已有对象相交','opening-size':'构件尺寸与安装洞口不同'};
const issues={};
for(const [code,message] of Object.entries(messages)){
 issues[code]={code,message,severity:['no-surface','no-socket','out-of-world'].includes(code)?'error':'warn'};
}
export class AnchorIndex{
 constructor(){this.rows=new Map()}
 register(a){
  const k=Math.floor(a.x/config.hashMeters),j=Math.floor(a.z/config.hashMeters);
  if(!this.rows.has(k))this.rows.set(k,new Map());
  const row=this.rows.get(k);if(!row.has(j))row.set(j,[]);row.get(j).push(a);
 }
 nearest(kind,q,r){
  const p=q.pointer,h=config.hashMeters;let best=null,min=r*r;
  for(let x=Math.floor((p.x-r)/h);x<=Math.floor((p.x+r)/h);x++){
   const row=this.rows.get(x);if(!row)continue;
   for(let z=Math.floor((p.z-r)/h);z<=Math.floor((p.z+r)/h);z++){
    const entries=row.get(z);if(!entries)continue;
    for(let i=0;i<entries.length;i++){
     const a=entries[i];if(a.kind!==kind||a.type&&a.type!==q.object.socketType||a.layer&&a.layer!==q.layer)continue;
     const d=(a.x-p.x)**2+(a.y-p.y)**2+(a.z-p.z)**2;
     if(d<min||d===min&&(!best||a.id<best.id)){best=a;min=d}
    }
   }
  }
  return best;
 }
}
export function result(){return {transform:{x:0,y:0,z:0,yaw:0},kind:'free',anchorId:undefined,issues:[],valid:true}}
export function snapInto(out,q,ctx){
 const p=q.policy,t=out.transform,m=q.pointer,cur=q.current,f=q.object.footprint;
 out.issues.length=0;out.kind='free';out.anchorId=undefined;out.valid=true;
 t.x=m.x;t.z=m.z;t.y=cur.y;t.yaw=cur.yaw;
 const grid=(p.xz==='grid'||!p.allowOffGrid)?!q.ctrl:q.shift;
 let anchor=null;
 if(p.requiresSocket||grid){
  for(let i=0;i<p.priority.length;i++){
   const k=p.priority[i];
   if(k==='grid'||(!grid&&k!=='socket')||(q.shift&&p.xz==='free'&&!p.requiresSocket))continue;
   anchor=ctx.anchors.nearest(k,q,p.tolerance[k]);if(anchor)break;
  }
 }
 if(anchor){
  out.anchorId=anchor.id;out.kind=anchor.kind;
  if(!q.ctrl){t.x=anchor.x;t.z=anchor.z}
  if(anchor.yaw!=null)t.yaw=anchor.yaw;
 }else if(grid){
  const s=q.step??config.gridMeters,x=Math.round(m.x/s)*s,z=Math.round(m.z/s)*s;
  if(q.shift||Math.hypot(x-m.x,z-m.z)<=p.tolerance.grid){t.x=x;t.z=z;out.kind='grid'}
 }
 if(p.requiresSocket&&anchor?.kind!=='socket')out.issues.push(issues['no-socket']);
 if(anchor?.yaw==null&&!q.alt&&p.angleStep)t.yaw=((Math.round(t.yaw/p.angleStep)*p.angleStep+180)%360+360)%360-180;
 const rad=t.yaw*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
 let max=-Infinity,slope=0,outside=false,missing=false;
 const surface=p.y==='surface'&&p.surfaceMode!=='none';
 for(let i=0;i<5;i++){
  const dx=i?(i&1?1:-1)*f.w/2:0,dz=i?(i<=2?1:-1)*f.d/2:0;
  const x=t.x+dx*c+dz*s,z=t.z-dx*s+dz*c;
  if(!ctx.grid.worldToCell(x,z))outside=true;
  if(!surface||i&&p.surfaceMode!=='footprint')continue;
  const sample=ctx.surface.sample(x,z);
  if(!sample){missing=true;continue}
  max=Math.max(max,sample.y);
  const n=sample.normal;slope=Math.max(slope,Math.hypot(n.x,n.z)/Math.max(n.y,.00001));
 }
 if(outside)out.issues.push(issues['out-of-world']);
 if(missing)out.issues.push(issues['no-surface']);
 if(surface&&Number.isFinite(max)){t.y=max;if(out.kind==='free')out.kind='surface'}
 if(p.y==='socket'&&anchor)t.y=anchor.y;
 t.y+=p.yOffset??0;
 if(slope>config.slopeRatio)out.issues.push(issues['slope-too-steep']);
 ctx.validator?.validateInto(out.issues,t,q,anchor);
 for(let i=0;i<out.issues.length;i++)if(out.issues[i].severity==='error')out.valid=false;
 return out;
}
export function snap(q,ctx){return snapInto(result(),q,ctx)}
export function warn(list,code){list.push(issues[code])}

// 在两个物件的四个局部轴上检查投影，同时保留正的分隔距离。
export function clearance(a,f,b,g){
 const u=a.yaw*Math.PI/180,v=b.yaw*Math.PI/180;
 let separation=-Infinity;
 for(let i=0;i<4;i++){
  const axis=(i<2?u:v)+(i%2)*Math.PI/2;
  const radius=(Math.abs(Math.cos(axis-u))*f.w+Math.abs(Math.sin(axis-u))*f.d+Math.abs(Math.cos(axis-v))*g.w+Math.abs(Math.sin(axis-v))*g.d)/2;
  separation=Math.max(separation,Math.abs((b.x-a.x)*Math.cos(axis)-(b.z-a.z)*Math.sin(axis))-radius);
 }
 return separation;
}
export function validator(objects){
 return {validateInto(list,t,q,a){
  if(a?.opening&&(Math.abs(a.opening.w-q.object.footprint.w)>.001||Math.abs(a.opening.h-q.object.footprint.h)>.001))warn(list,'opening-size');
  let gap=Infinity;
  for(const other of objects){
   if(other.id===q.object.id)continue;
   const b=other.transform,g=other.footprint;
   if(b.y>=t.y+q.object.footprint.h||t.y>=b.y+g.h)continue;
   gap=Math.min(gap,clearance(t,q.object.footprint,b,g));
  }
  if(gap<-.001)warn(list,'overlap');
  if(q.object.ignoreClearance?.enabled&&q.object.ignoreClearance.reason?.trim())return;
  if(q.layer==='ped'&&(q.pathWidth??(q.object.onWalkway?gap:Infinity))<config.pathMeters)warn(list,'path-too-narrow');
  for(const limit of config.gapsMeters)if(Math.abs(gap-limit)<=config.gapToleranceMeters){warn(list,'gap-matrix');break}
 }};
}
