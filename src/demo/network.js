import {pioneerFloor,stairLevel} from './pioneer-floor.js';
import layout from '../../docs/driving-demo/layout.json';
export {layout};
export const start='275,1810';
export const boatDock='150,930',boatTurn='240,470';
export const stops=[
 [start,'出生民居','领取车钥匙','沿滨海路北行，去消防站取急救箱。'],
 ['420,1220','消防站','领取急救箱','沿路前往劳顿堡，领取净水。'],
 ['440,590','劳顿堡','领取净水','驶往广播站，取得撤离频率。'],
 ['760,360','广播站','接收撤离频率','前往变电站恢复渡口供电。'],
 ['1680,1280','变电站','恢复供电','返回西岸渡口登船撤离。'],
 ['240,930','交易渡口','登船撤离','撤离成功']];
export const widths={轿车:2.6,摩托:1.2,卡车:3.6,步行:.7};
export const state={bridge:false,clear:false,tide:false,rain:false,night:false};
const nodes={...layout.nodes};
const quayStreets=[[206,520],[229,520],[229,580],[294,520],[294,590]];
for(const p of quayStreets)nodes[p.join(',')]=p;
for(const p of [[399,1220],[399,1168],[457,1220]])nodes[p.join(',')]=p;
const quayLink=(a,b)=>({a,b,grade:'L3',gap:5,state:'',z:0});
// The service tunnel parallels the surface avenue and shares its two junctions.
const segments=layout.edges.flatMap(e=>{
 if(e.a==='240,1220'&&e.b==='420,1220')return [{...e,b:'399,1220'},{...e,a:'399,1220'}];
 if(e.a==='240,520'&&e.b==='240,590')return [
  {...e,b:'229,520'},{...e,a:'229,520',b:'229,580'},{...e,a:'229,580'}];
 if(e.a==='240,590'&&e.b==='440,590')return [{...e,b:'294,590'},{...e,a:'294,590'}];
 if(e.state!=='tunnel')return [e];
 const [ax,az]=nodes[e.a],[bx,bz]=nodes[e.b];
 const via=[.1,.9].map(t=>{
  const id=e.a+'/tunnel/'+t;
  nodes[id]=[ax+(bx-ax)*t+18,az+(bz-az)*t];
  return id;
 });
 return [{...e,b:via[0]},{...e,a:via[0],b:via[1]},{...e,a:via[1]}];
}).concat([quayLink('206,520','229,520'),quayLink('240,520','294,520'),quayLink('294,520','294,590'),
 quayLink('399,1220','399,1168'),{...quayLink('420,1220','457,1220'),grade:'L2'}]);
export const edges=segments.map(e=>({...e,A:nodes[e.a],B:nodes[e.b],length:Math.hypot(nodes[e.a][0]-nodes[e.b][0],nodes[e.a][1]-nodes[e.b][1])}));
export const roadWidth=e=>e.state==='rail'?e.gap:({L1:28,L2:16,L3:8,L4:3,L5:5}[e.grade]);
export function open(e,mode){
 if(mode==='划船')return e.state==='boat';
 if(e.state==='closed'||e.state==='boat'||e.state==='clear'&&!state.clear||e.state==='bridge'&&state.bridge||e.state==='tide'&&state.tide)return false;
 return widths[mode]<=e.gap;
}
export function offset(x,z,e){
 const dx=e.B[0]-e.A[0],dz=e.B[1]-e.A[1],t=Math.max(0,Math.min(1,((x-e.A[0])*dx+(z-e.A[1])*dz)/e.length**2));
 return {x:e.A[0]+t*dx,z:e.A[1]+t*dz,t,d:Math.hypot(x-e.A[0]-t*dx,z-e.A[1]-t*dz)};
}
const elevated = edges.filter(e => e.state === 'rail');
export function railHeight(e, along) {
 const ramp = Math.min(64, e.length / 3);
 return 10.8 * Math.max(0, Math.min(1, along / ramp, (e.length - along) / ramp));
}
export function onCorridorSidewalk(x,z){
 const distance=Math.abs(z-1280);
 return x>=806&&x<=1090&&distance>=8&&distance<=12.1;
}
export function heightAt(x,z,mode,fromHeight) {
 if(mode !== '步行')return 0;if(onCorridorSidewalk(x,z))return .09+.15*Math.min(1,Math.max(0,(Math.abs(x-943)-2)/4));
 const lower=pioneerFloor(x,z);if(lower<0)return stairLevel(x,z,fromHeight);
 for(const rail of elevated) {
  const p=offset(x,z,rail);
  if(p.d>roadWidth(rail)/2+.005)continue;
  const level=railHeight(rail,p.t*rail.length);
  // A pedestrian can also walk under the same xy crossing on a ground street.
  if(fromHeight !== undefined && fromHeight<.55 && level>1 &&
     edges.some(e=>e.state!=='rail'&&open(e,mode)&&offset(x,z,e).d<=roadWidth(e)/2))return 0;
  return level;
 }
 return 0;
}
export function shortest(src,dest,mode){
 const q=[[0,src,[]]],seen=new Set();
 while(q.length){q.sort((a,b)=>b[0]-a[0]);const [dist,n,path]=q.pop();if(n===dest)return {dist,path};if(seen.has(n))continue;seen.add(n);
 for(const e of edges){if(!open(e,mode)||n!==e.a&&n!==e.b)continue;const next=n===e.a?e.b:e.a;q.push([dist+e.length,next,[...path,next]])}}
 return null;
}
export function route(x,z,dest,mode,fromHeight){
 let nearest;
 for(const e of edges){
  if(!open(e,mode))continue;
  const p=offset(x,z,e);
  const sidewalk=mode==='步行'&&onCorridorSidewalk(x,z)&&e.A[1]===1280&&e.B[1]===1280&&Math.abs(p.x-x)<.01;
  if(p.d>(sidewalk?12.1:roadWidth(e)/2)+.05||nearest&&p.d>=nearest.p.d)continue;
  const level=e.state==='rail'?railHeight(e,p.t*e.length):mode==='步行'?pioneerFloor(p.x,p.z):0;
  if(fromHeight!==undefined&&Math.abs(fromHeight-level)>=1)continue;
  nearest={e,p};
 }
 if(!nearest)return [];
 const {e,p}=nearest;let best=null;
 for(const n of [e.a,e.b]){const r=shortest(n,dest,mode);if(!r)continue;const d=r.dist+Math.hypot(p.x-nodes[n][0],p.z-nodes[n][1]);if(!best||d<best.d)best={d,path:[[p.x,p.z],nodes[n],...r.path.map(id=>nodes[id])]}}
 return best?.path||[];
}



