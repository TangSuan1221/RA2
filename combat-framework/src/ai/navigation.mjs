import {fits,rayBox} from '../character/collision.mjs';
import {CFG} from '../config.mjs';
const CELL=CFG.navigation.cell,HALF=CFG.navigation.halfCells;
const key=(x,z)=>`${x},${z}`;
const geometryCaches=new WeakMap();
const less=(a,b)=>a.f<b.f||a.f===b.f&&(a.x<b.x||a.x===b.x&&a.z<b.z);
function push(heap,node){let i=heap.length;heap.push(node);while(i){const parent=(i-1)>>1;if(!less(node,heap[parent]))break;heap[i]=heap[parent];i=parent;}heap[i]=node;}
function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&less(heap[child+1],heap[child]))child++;if(!less(heap[child],last))break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
function geometryClearance(obstacles,start,radius,height){
 const query=obstacles.geometryQuery;if(!query?.movementEnabled)return new Map();
 let layers=geometryCaches.get(query);if(!layers){layers=new Map();geometryCaches.set(query,layers);}
 // Meshes are immutable constructor snapshots. Quantization only suppresses
 // sub-micrometre floor contact noise, far below the 5mm collision skin.
 const layer=[start[1],radius,height].map(v=>v.toFixed(6)).join('|');if(!layers.has(layer))layers.set(layer,new Map());return layers.get(layer);
}
// Conservative swept cylinder envelope, including the full head clearance.
export function clearSegment(start,end,obstacles,radius,height){
  if(obstacles.geometryQuery?.movementEnabled){if(obstacles.geometryQuery.sweptBoundsClear?.(start,end,radius,height))return true;const count=Math.max(1,Math.ceil(Math.hypot(...end.map((v,i)=>v-start[i]))/(radius*.45)));for(let i=0;i<=count;i++){const p=start.map((v,j)=>v+(end[j]-v)*i/count),resolved=obstacles.geometryQuery.resolveCapsule({radius,height,posture:'stand',yaw:0},p);if(resolved.valid===false||Math.hypot(...resolved.position.map((v,j)=>v-p[j]))>.006)return false;}return true;}
  const d=end.map((v,i)=>v-start[i]),len=Math.hypot(...d),dir=d.map(v=>v/(len||1));
  return !obstacles.some(b=>rayBox(start,dir,{min:[b.min[0]-radius,b.min[1]-height+.005,b.min[2]-radius],max:[b.max[0]+radius,b.max[1]-.005,b.max[2]+radius]},len)<len);
}
function startSearch(start,goal,obstacles,radius,height){
 const sx=Math.round(start[0]/CELL),sz=Math.round(start[2]/CELL),gx=Math.round(goal[0]/CELL),gz=Math.round(goal[2]/CELL),clearanceCache=geometryClearance(obstacles,start,radius,height);
 const valid=(x,z)=>{const id=key(x,z);if(clearanceCache.has(id))return clearanceCache.get(id);const result=Math.abs(x)<=HALF&&Math.abs(z)<=HALF&&fits([x*CELL,start[1],z*CELL],radius,height,obstacles);clearanceCache.set(id,result);return result;};
 const first={x:sx,z:sz,g:0,f:0};return {start:[...start],goal:[...goal],obstacles,radius,height,geometry:obstacles.geometryQuery,gx,gz,valid,open:[first],all:new Map([[key(sx,sz),first]]),closed:new Set(),best:first,iterations:0,done:false};
}
function advanceSearch(search,budget){
 const q=search;let used=0;
 while(q.open.length&&q.iterations<CFG.navigation.maxExpansions&&used<budget){q.iterations++;used++;const node=pop(q.open),id=key(node.x,node.z);if(q.closed.has(id))continue;q.closed.add(id);if(Math.hypot(node.x-q.gx,node.z-q.gz)<Math.hypot(q.best.x-q.gx,q.best.z-q.gz))q.best=node;if(node.x===q.gx&&node.z===q.gz){q.best=node;q.done=true;break;}
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=node.x+dx,z=node.z+dz,k=key(x,z);if(q.closed.has(k)||!q.valid(x,z)||(dx&&dz&&(!q.valid(node.x+dx,node.z)||!q.valid(node.x,node.z+dz))))continue;const g=node.g+Math.hypot(dx,dz),old=q.all.get(k);if(old&&old.g<=g)continue;const child={x,z,g,f:g+Math.hypot(x-q.gx,z-q.gz),parent:node};q.all.set(k,child);push(q.open,child);}
 }
 q.done ||= !q.open.length||q.iterations>=CFG.navigation.maxExpansions;
 if(q.done){const path=[];for(let p=q.best;p?.parent;p=p.parent)path.push([p.x*CELL,q.start[1],p.z*CELL]);path.reverse();if(q.best.x===q.gx&&q.best.z===q.gz&&fits(q.goal,q.radius,q.height,q.obstacles))path.push([...q.goal]);q.path=path;}
 return used;
}
export function findPath(start,goal,obstacles,radius=.32,height=1.78){const search=startSearch(start,goal,obstacles,radius,height);advanceSearch(search,CFG.navigation.maxExpansions);return search.path;}
export function navigationGoal(actor,goal,obstacles,step){
 if(clearSegment(actor.pos,goal,obstacles,actor.radius,actor.height)){actor.path=null;actor.pathSearch=null;actor.navigationExpanded=0;return goal;}
 const invalid=domain=>!domain||Math.abs(domain.start[1]-actor.pos[1])>CFG.skin||domain.height!==actor.height||domain.radius!==actor.radius||domain.geometry!==obstacles.geometryQuery||domain.obstacles!==obstacles;
 if(actor.path&&invalid(actor.pathDomain)){actor.path=null;actor.pathSearch=null;}
 if(actor.pathSearch&&(Math.abs(actor.pathSearch.start[1]-actor.pos[1])>CFG.skin||actor.pathSearch.height!==actor.height||actor.pathSearch.obstacles!==obstacles||actor.pathSearch.geometry!==obstacles.geometryQuery||actor.pathSearch.radius!==actor.radius))actor.pathSearch=null;
 if(!actor.pathSearch&&(!actor.path||step>=actor.repathAt||Math.hypot(goal[0]-actor.pathGoal[0],goal[2]-actor.pathGoal[2])>1))actor.pathSearch=startSearch(actor.pos,goal,obstacles,actor.radius,actor.height);
 actor.navigationExpanded=0;
 if(actor.pathSearch){actor.navigationExpanded=advanceSearch(actor.pathSearch,CFG.navigation.expansionsPerTick);if(actor.pathSearch.done){actor.path=actor.pathSearch.path;actor.pathDomain={start:actor.pathSearch.start,height:actor.height,radius:actor.radius,geometry:obstacles.geometryQuery,obstacles};actor.pathGoal=actor.pathSearch.goal;actor.pathSearch=null;actor.pathCursor=0;actor.repathAt=step+CFG.navigation.repathSteps;
  // Existing path movement may have advanced while this bounded search ran.
  let closest=Infinity;for(let i=0;i<actor.path.length;i++){const d=Math.hypot(actor.path[i][0]-actor.pos[0],actor.path[i][2]-actor.pos[2]);if(d<closest){closest=d;actor.pathCursor=i;}}if(actor.path.length&&!clearSegment(actor.pos,actor.path[actor.pathCursor],obstacles,actor.radius,actor.height))actor.pathCursor=0;
 }}
 if(!actor.path)return actor.pos;
 while(actor.pathCursor<actor.path.length&&Math.hypot(actor.path[actor.pathCursor][0]-actor.pos[0],actor.path[actor.pathCursor][2]-actor.pos[2])<.25)actor.pathCursor++;
 return actor.path[actor.pathCursor]||actor.pos;
}
