import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {stationWalls} from '../../src/world/placements/station-walls.js';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'public/assets/station-rooms');
mkdirSync(out,{recursive:true});
const saved=JSON.parse(readFileSync(join(root,'src/world/placements/saved.json'))).station;
const kit=new Map(JSON.parse(readFileSync(join(root,'public/assets/station-kit/manifest.json'))).map(a=>[a.id,a]));
const plans=[],objects=[],walls=[];
stationWalls((id,x,y,z,w,h,yaw)=>walls.push({id,x,y,z,w,h,yaw}));
const sources={
 D:['USACE · 消防站标准设计（维修与洗消）','https://mrsi.erdc.dren.mil/content/cos/hnc/fs/Library/Standard%20Designs/Standard_Design_Fire_Station__Mar2021_.pdf'],
 A:['Central Falmouth Station · 改造平面，第 2 页','https://www.falmouthme.org/DocumentCenter/View/2006/Updated-Central-Fire-Station-Renovation-Plans-12826?bidId='],
 B:['CCD Architects · Fire Station 20 室内实景','https://ccdarchitects.com/portfolio-item/fire-station-20/'],
 C:['Sims + Architects · Amarillo Station 5 竣工图库','https://www.sims-architects.com/city-of-amarillo-fire-station-5']
};
let room;
function zone(id,title,bounds,usage,source){room={id,title,bounds,usage,source,objects:[]};plans.push(room)}
function put(asset,x,z,yaw=0,opt={}){
 const a=kit.get(asset);if(!a)throw Error(asset);
 const n=room.objects.filter(o=>o.asset===asset).length+1;
 const id=opt.bind||('room/'+room.id+'/'+asset+'-'+n);
 const obj={id,asset,name:a.label,room:room.id,parent:'site',profile:'prop',x,y:0,z,yaw,size:a.measured,...opt};
 room.objects.push(obj);objects.push(obj);return obj;
}
function use(id,asset,yaw=0){const p=saved[id].transform;return put(asset,p.x,p.z,yaw,{bind:id})}
function on(base,asset,dx,dz,height=base.size[1],yaw=0){
 const angle=base.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return put(asset,base.x+c*dx+s*dz,base.z-s*dx+c*dz,base.yaw+yaw,{parent:base.id,y:base.y+height,profile:'semantic',socket:'支撑面',solid:false});
}
function wall(asset,axis,fixed,along,y,sign){
 const [w,h,d]=kit.get(asset).measured;
 const host=walls.find(v=>{const [,ax,k,l,r,lo,hi]=v.id.split('/');return ax===axis&&+k===fixed&&along-w/2>=+l-.0001&&along+w/2<=+r+.0001&&y>=+lo&&y+h<=+hi});
 if(!host)throw Error([room.id,asset,axis,fixed,along,y].join(' '));
 const offset=sign*(.12+d/2+.002);
 return put(asset,axis==='x'?along:fixed+offset,axis==='x'?fixed+offset:along,axis==='x'?(sign>0?0:180):(sign>0?90:-90),{y,parent:host.id,profile:'semantic',socket:'墙面',solid:false});
}
function chair(x,z,angle,asset='dining-chair'){return put(asset,x,z,angle)}
zone('workshop','维护工坊',[-21,-10.5,-6,-3.75],'试泵台朝向车厅入口；手工具收在侧台，跨房门的维护通道保持连续。','BD');
use('bench','workbench');put('pump-test-bench',-11.50,-5.05,180);
for(const [id,asset] of [['pump','pump-a'],['faulty','pump-b']]){const p=saved[id].transform;put(asset,p.x,p.z,0,{bind:id,y:p.y,parent:'bench',profile:'semantic',solid:false})}
const work=use('worktable','workbench');on(work,'vise',-.61,0);on(work,'parts-pan',.47,.02);on(work,'wrench',.09,.11);
put('toolbox-cart',-20.35,-9.73);put('parts-rack',-12.8,-9.99);put('scrap-bin',-7.2,-9.82);
wall('pegboard','x',-10.5,-18.3,1.30,1);
zone('garage','车库',[-21,-3.75,-6,10.5],'两车朝南，水带推车停在东侧地面带；墙边收纳给车身周围留出作业面。','BC');
use('truck','engine');use('ambulance','ambulance');use('cart','hose-cart');
put('hose-rack',-20.49,3.4,90);put('cylinder-cart',-20.25,-2.55,90);wall('wash-reel','z',-21,4.8,1.05,1);wall('extinguisher','z',-6,7.3,1,-1);
use('gate','south-shutter');
zone('storage','储物间',[-6,-10.5,-1,-6.25],'靠北放深架，南侧为周转与急救补给，员工从东门取用。','AC');
const shelf=use('shelf','parts-rack');on(shelf,'tote',-.25,0,.133);on(shelf,'medical-box',.28,0,.703);
use('crate','carton');const r=put('parts-rack',-3.25,-6.72,180);on(r,'ems-bag',-.2,0,.703);on(r,'dressing',.37,.02,.739);
put('carton',-5.51,-7.1);wall('parts-label','x',-6.25,-3.3,1.9,-1);
zone('gear','装备间',[-6,-6.25,-1,.75],'出勤柜沿西墙连续排列，长凳居中偏南；装备取用后可直接转入员工通道。','BC');
use('lockers','locker-bench');for(const [z,asset] of [[-5.48,'locker-ready'],[-4.64,'locker-used'],[-3.8,'locker-ready'],[-2.96,'locker-personal'],[-2.12,'locker-ready']])put(asset,-5.5,z,90);
put('shoes',-1.62,-2.85,-90);wall('zone-sign','x',-6.25,-3.55,1.55,1);
zone('decon','洗消间',[-6,.75,-1,10.5],'车厅侧接收污装，洗脱、烘干和沥水依次布置；东侧两个门口预留转身空间。','AD');
use('sink','drain-table',180);use('wash','deep-sink',90);put('dirty-bin',-5.48,1.47);put('extractor-washer',-5.29,4.69,90);put('drying-cabinet',-5.35,8.15,90);
put('laundry-cart',-4.91,9.55);wall('glove-box','z',-6,5.95,1.45,1);wall('wet-clock','z',-1,5.5,1.95,-1);
zone('passage','员工通道',[-1,-10.5,1.5,10.5],'贯通南北的 2.5 米带状空间只安装薄型墙件；各房门前留空。','A');
wall('wayfinding','z',-1,-1.7,1.72,1);wall('room-id','z',1.5,.05,1.62,-1);wall('emergency-light','z',-1,4.9,2.53,1);
zone('kitchen','厨房与餐区',[1.5,-10.5,10,-3.75],'靠北布置备餐线，餐桌四周设座位；西侧员工入口与北门相通。','AB');
const island=use('kitchen','island');on(island,'cutting-board',-.34,.04);on(island,'knife-block',.52,-.05);
const table=use('table','dining-table');on(table,'napkins',0,0);on(table,'mug',-.62,.21);on(table,'bowl',.65,-.18);
for(const x of [5.32,6.68]){chair(x,-7.08,0);chair(x,-5.32,180)}
put('fridge',2.30,-9.81);put('stove',5.46,-9.79);put('pantry',9.43,-9.73,-90);put('recycling',9.43,-4.42);
zone('lounge','休闲室',[10,-10.5,18.25,-3.75],'沙发和休闲椅围绕矮桌，阅读区靠窗；厨房破口和西南方向出入口留空。','B');
use('sofa','sofa');put('recliner',17.34,-8.55,-90);const ct=put('coffee-table',15,-8.28);on(ct,'magazine',-.22,.03);on(ct,'remote',.45,.15);
put('bookcase',17.62,-4.63,-90);const end=put('end-table',13.52,-9.67);on(end,'mug',0,0);put('floor-lamp',16.73,-9.96);
zone('dorm','宿舍',[1.5,-3.75,10,.75],'床侧保留上下床空间；个人柜集中在北墙，两张床各配一个床边置物点。','AB');
use('bed1','bunk',90);use('bed2','bunk');const n1=put('nightstand',2.65,-.18);on(n1,'alarm-clock',0,0);
const n2=put('nightstand',8.14,-2.25);on(n2,'book',0,0);put('wardrobe',4.1,-3.29);put('wardrobe',4.83,-3.29);
zone('bath','卫浴间',[1.5,.75,10,4.25],'洁具集中在两端，隔断遮挡淋浴视线；从员工廊到东门留有贯通带。','AC');
wall('basin','x',4.25,8.5,.65,-1);use('shower','partition',90);put('toilet',2.93,1.46);
wall('mirror-cab','x',4.25,8.5,1.23,-1);wall('towels','x',4.25,9.23,1.22,-1);wall('shower-head','x',.75,4.88,1.91,1);
put('bath-mat',5.07,1.65,0,{solid:false});wall('safety-bar','x',.75,3.78,.84,1);
zone('meeting','办公／会议室',[1.5,4.25,10,10.5],'会议桌两侧对坐，讨论板在北墙；东西门之间的横向通道经过桌北。','AC');
const meet=use('conference','folding-table');on(meet,'binder',-.47,0);on(meet,'pen-cup',.49,0);
for(const x of [5.52,6.48]){chair(x,7.22,0,'folding-chair');chair(x,8.78,180,'folding-chair')}
wall('whiteboard','x',4.25,5.8,1.22,1);put('files',9.35,9.55,-90);put('lectern',2.18,4.95);
zone('watch','值守办公室',[12.75,-3.75,20.75,1.4],'值守桌朝门内布置，交班记录和显示器放在同一工作面；文件柜靠内墙。','AC');
const desk=use('desk','desk');on(desk,'display',-.30,-.15);on(desk,'keyboard',-.30,.19);on(desk,'telephone',.48,0);
chair(17,-.54,180,'office-chair');put('files',20.10,-2.62,-90);put('pedestal',18.32,-1.55);wall('roster','x',1.4,16,1.46,-1);
zone('foyer','门厅',[10,1.4,20.75,8.5],'南门正前留出迎客面；接待台、等候椅和宣传册靠东，沿西边可进入员工区。','AC');
use('reception','watch-desk',-90);chair(20.11,3.42,-90,'waiting-chair');chair(20.11,4.15,-90,'waiting-chair');
put('literature',18.03,7.92,180);put('entry-mat',14,7.44,0,{solid:false});wall('bulletin','x',1.4,18.28,1.22,1);wall('crest','x',8.5,16.61,1.63,-1);
// Secondary working sets use the same local host surfaces as their primary furniture.
const select=id=>{room=plans.find(p=>p.id===id)};
const by=id=>objects.find(o=>o.id===id);
select('workshop');on(work,'sockets',.09,-.20);on(work,'rag',-.32,.24);
const toolChest=room.objects.find(o=>o.asset==='toolbox-cart');on(toolChest,'seal-box',0,0);
select('storage');on(shelf,'food-bag',.35,.01,1.273);on(r,'masks',.29,.02,1.273);on(r,'glove-box',-.26,.01,1.273);
select('garage');const hoseRack=room.objects.find(o=>o.asset==='hose-rack');on(hoseRack,'packed-hose',0,0,.1155);on(hoseRack,'packed-hose',0,0,.6105);
select('gear');on(by('lockers'),'work-gloves-pair',.49,0);wall('name-strip','x',.75,-3.86,1.63,-1);
select('decon');const dt=by('sink');on(dt,'disinfect-tray',.22,0);on(dt,'detergent',-.39,-.15);
wall('chemical-label','z',-1,5.23,1.45,-1);
select('kitchen');const cb=put('base-cab',6.28,-9.79);on(cb,'coffee',-.12,0);on(cb,'seasoning',.24,.05);
wall('upper-cab','x',-10.5,5.57,1.60,1);wall('chores','x',-3.75,7.6,1.52,-1);
on(table,'lunch-box',.55,.23);on(table,'mug',-.45,-.23);
select('lounge');const bookcase=room.objects.find(o=>o.asset==='bookcase');on(bookcase,'game',-.18,0,.633);on(bookcase,'book',.22,0,.633);
on(ct,'game',.25,-.08);wall('photo','x',-10.5,16.71,1.48,1);
select('dorm');on(n2,'cup',.14,-.11);wall('coat-hook','x',-3.75,6.07,1.52,1);put('linen-bag',6.87,-3.18);
select('bath');wall('soap','x',4.25,8.08,1.11,-1);wall('toilet-roll','x',.75,2.47,.6,1);put('bath-bin',2.14,1.26);
select('meeting');on(meet,'book',.17,.04);wall('clock','x',4.25,7.23,1.75,1);
select('watch');on(desk,'mouse',.06,.18);on(by('room/watch/pedestal-1'),'printer',0,0);
select('foyer');wall('plaque','x',1.4,19.81,1.51,1);wall('poster','x',1.4,17.15,1.45,1);wall('clock','x',1.4,15.69,1.91,1);
const gate=by('gate');gate.size=[12,4.5,.18];gate.y=0;gate.parent=saved.gate.parent;gate.profile='semantic';
const file=join(root,'src/world/placements/station-rooms.json');
writeFileSync(file,JSON.stringify({rooms:plans.map(({objects,...v})=>v),objects},null,2)+'\n');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const colors={floor:'#b7b7a3',fixture:'#718c7f',chair:'#bb9970',bed:'#849ca4',vehicle:'#a66d55'};
function makePlate(p){
 const [x0,z0,x1,z1]=p.id==='foyer'?[10,-3.75,20.75,8.5]:p.bounds;
 const w=x1-x0,d=z1-z0,scale=Math.min(625/w,348/d),ox=345-(x0+x1)*scale/2,oz=262-(z0+z1)*scale/2;
 const X=x=>ox+x*scale,Z=z=>oz+z*scale;
 const line=(x,z,end,last,col,width,dash='')=>'<line x1="'+X(x)+'" y1="'+Z(z)+'" x2="'+X(end)+'" y2="'+Z(last)+'" stroke="'+col+'" stroke-width="'+width+'" stroke-dasharray="'+dash+'"/>';
 const floor=p.id==='foyer'?[[10,-3.75],[12.75,-3.75],[12.75,1.4],[20.75,1.4],[20.75,8.5],[10,8.5]]:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
 const outline=floor.map(([x,z])=>X(x)+','+Z(z)).join(' ');
 let grid='',architecture='',symbols='',legend='';
 for(let x=Math.ceil(x0);x<x1;x++)grid+=line(x,z0,x,z1,'#dcdace',1);
 for(let z=Math.ceil(z0);z<z1;z++)grid+=line(x0,z,x1,z,'#dcdace',1);
 for(const v of walls){
  const [,axis,f,l,r,lo,hi]=v.id.split('/'),f0=+f,L=+l,R=+r;
  if(+lo!==0&&!([2.54,2.84,4.5].includes(+lo)))continue;
  const horiz=axis==='x',min=horiz?x0:z0,max=horiz?x1:z1;
  if(f0<(horiz?z0:x0)-.01||f0>(horiz?z1:x1)+.01||R<=min||L>=max)continue;
  const a=Math.max(L,min),b=Math.min(R,max);
  const color=+lo>0?'#579a87':+hi===.75?'#7aabb5':'#343f3a';
  architecture+=horiz?line(a,f0,b,f0,color,+lo?2.2:Math.max(4,.18*scale),+lo?'5 4':''):line(f0,a,f0,b,color,+lo?2.2:Math.max(4,.18*scale),+lo?'5 4':'');
 }
 const roots=p.objects.filter(o=>!o.parent.startsWith('room/')&&!p.objects.some(other=>other.id===o.parent));
 roots.forEach((o,i)=>{
  const n=i+1,ww=Math.max(3,o.size[0]*scale),dd=Math.max(3,o.size[2]*scale),chairs=/chair|recliner|sofa/.test(o.asset),bed=o.asset==='bunk',vehicle=['engine','ambulance'].includes(o.asset);
  const fill=vehicle?colors.vehicle:bed?colors.bed:chairs?colors.chair:o.profile==='semantic'?'#d3a040':colors.fixture;
  let detail='';
  if(vehicle) detail='<rect x="'+(-ww*.41)+'" y="'+(dd*.22)+'" width="'+ww*.82+'" height="'+dd*.13+'" fill="#bacac6"/>';
  if(chairs||bed)detail='<rect x="'+(-ww*.42)+'" y="'+(-dd*.42)+'" width="'+ww*.84+'" height="'+dd*(bed?.23:.15)+'" rx="2" fill="#e3dfce"/>';
  symbols+='<g transform="translate('+X(o.x)+' '+Z(o.z)+') rotate('+(-o.yaw)+')"><rect x="'+(-ww/2)+'" y="'+(-dd/2)+'" width="'+ww+'" height="'+dd+'" rx="1.5" fill="'+fill+'" stroke="#36473e" stroke-width="1"/>'+detail+'</g>';
  symbols+='<text x="'+X(o.x)+'" y="'+(Z(o.z)+3)+'" text-anchor="middle" font-weight="bold" font-size="10" paint-order="stroke" stroke="#f5f3e9" stroke-width="2.3">'+n+'</text>';
  const child=p.objects.filter(v=>v.parent===o.id).map(v=>v.name);
  const entryY=116+i*31;
  legend+='<text x="706" y="'+entryY+'" font-size="14"><tspan fill="#5c7468">'+String(n).padStart(2,'0')+'</tspan>　'+esc(o.name)+'</text>';
  if(child.length)legend+='<text x="741" y="'+(entryY+13)+'" fill="#59635a" font-size="10">'+esc(child.join(' · '))+'</text>';
 });
 const m=Math.min(2,Math.floor(w));return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="540" viewBox="0 0 1000 540"><rect width="1000" height="540" fill="#f4f2e9"/><g font-family="Microsoft YaHei, sans-serif" fill="#253a31"><text x="31" y="44" font-size="28" font-weight="bold">'+p.title+'</text><text x="31" y="70" font-size="14">'+p.usage+'</text><polygon points="'+outline+'" fill="#e8e6d8"/><defs><clipPath id="floor"><polygon points="'+outline+'"/></clipPath></defs><g clip-path="url(#floor)">'+grid+'</g>'+architecture+symbols+'<text x="706" y="87" font-size="13" fill="#657769">布置索引</text>'+legend+'<path d="M44 469h'+m*scale+'" stroke="#283e32" stroke-width="3"/><text x="44" y="488" font-size="12">'+m+' m　·　北 ↑　·　网格 1 m</text><text x="265" y="488" font-size="12">深灰 实墙　　蓝 窗　　绿色虚线 门洞</text><text x="31" y="519" font-size="13">'+p.source.split('').map(k=>esc(sources[k][0])).join('　/　')+'</text></g></svg>';
}
for(const p of plans)writeFileSync(join(out,p.id+'.svg'),makePlate(p));
writeFileSync(join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>消防站房间布置图集</title><style>*{box-sizing:border-box}body{margin:0;background:#edece3;font:16px system-ui;color:#23372d}main{max-width:1380px;margin:auto;padding:24px}h1{margin:0}nav{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0 22px}a{color:#315c48}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:15px}img{width:100%;display:block;border:1px solid #c9cbbd}</style><main><h1>消防站房间布置图集</h1><nav><a href="/station.html?play=1">进入关卡</a><a href="interiors.jpg">全站实景</a>'+Object.values(sources).map(([title,url])=>'<a href="'+url+'">'+title+'</a>').join('')+'</nav><section>'+plans.map(p=>'<article><a href="'+p.id+'.svg"><img src="'+p.id+'.svg" alt="'+p.title+'布局图"></a><a href="'+p.id+'.jpg">查看'+p.title+'实景</a></article>').join('')+'</section></main></html>');
console.log(plans.length+' 张布局图，'+objects.length+' 项布置');
