import roomLayout from './station-rooms.json' with {type:'json'};
import {stationWalls} from './station-walls.js';

// 底面轴心，尺寸用米。复合件的细分几何保留在宿主局部空间。
export const parts=[];
const byId=new Map();
function part(id,name,parent,x,y,z,w,h,d,options={}){
 const host=byId.get(parent);
 const t=host?.transform??{x:0,y:0,z:0};
 const spec={id,name,parent,profile:'structural',shape:'box',color:'wall',solid:true,...options,
  transform:{x:t.x+x,y:t.y+y,z:t.z+z,yaw:options.yaw??0},footprint:{w,h,d},local:{x,y,z}};
 parts.push(spec);byId.set(id,spec);return spec;
}
function slab(id,x,z,w,d,top){
 return part(id,'楼板 '+id,'datum',x,top-.26,z,w,.26,d,{shape:'floor',solid:false});
}
slab('site',0,4,52,52,0);
stationWalls((id,x,y,z,w,h,yaw)=>part(id,'墙段 '+id,'datum',x,y,z,w,h,.24,{yaw}));
const mount=(id,name,parent,x,y,z,w,h,d,extra={})=>part(id,name,parent,x,y,z,w,h,d,{profile:'semantic',...extra});
function standing(id,name,parent,x,z,w,h,d,color='steel',extra={}){
 const host=byId.get(parent);
 return part(id,name,parent,x,host.footprint.h,parent==='site'?z-host.transform.z:z,w,h,d,{profile:'prop',color,...extra});
}

function prop(id,name,x,z,w,h,d){return standing(id,name,'site',x,z,w,h,d)}

for(const [id,x,z,w,d,y] of [['garage',-13.5,3.375,15,14.25,6.2],['workshop',-13.5,-7.125,15,6.75,3.5],['middle',2,0,16,21,3.5],['living',14.125,-7.125,8.25,6.75,3.5],['front',15.375,2.375,10.75,12.25,3.5]]){
part('roof-'+id,'屋盖','datum',x,y,z,w,.22,d,{shape:'roof'});
}
prop('truck','消防泵车',-17,5,3,2.7,8);
mount('cab','驾驶室','truck',0,2.7,2.4,2.9,.5,2);
prop('ambulance','救护车',-11.8,5.5,2.6,2.45,6);
prop('car','接驳车',-13,18,2.4,1.45,4);
mount('trunk','交货','car',0,.65,2.1,1.5,.55,.24,{solid:false});
prop('bench','泵具试验台',-9.4,-5.05,2,.9,.8);
mount('pump','待检泵','bench',-.45,.9,0,.58,.46,.45,{color:'steel',solid:false});
mount('faulty','待拆泵','bench',.4,.9,0,.45,.38,.44,{color:'steel',solid:false});
mount('gauge','压力表','bench',.5,1.28,0,.25,.2,.1,{color:'cyan',solid:false});
prop('cart','水带推车',-8,4,.8,.98,1.2);
const header=parts.find(p=>p.transform.x===-13&&p.transform.z===10.5&&p.transform.y===4.5);
mount('gate','出车卷门',header.id,0,-3.25,0,12,3.25,.18,{color:'steel'});
mount('chain','卷门手链',header.id,6.15,-3.5,-.22,.1,.75,.1,{color:'cyan',solid:false});
prop('reception','值班警报台',19,5.5,2.6,1,1);
mount('board','工单夹','reception',0,1,0,.6,.25,.2,{color:'green',solid:false});
for(const [id,name,x,z,w,h,d] of [
['crate','储物箱',-5,-9,1.2,1,.8],['shelf','储物架',-4,-10,2,1.8,.6],['lockers','装备柜',-3,-.1,3,.98,.75],
['sink','洗消台',-2.3,9.6,1.8,.9,.7],['wash','洗消池',-5,6,1,.8,1.5],['kitchen','厨房操作台',4,-9.8,4,.9,.8],
['table','餐桌',6,-6.2,2,.8,1],['sofa','休闲室沙发',15,-9.8,3,.85,1],['bed1','宿舍床',4,-.15,2,.55,.9],
['bed2','宿舍床',9,-1.5,1,.55,2],['basin','卫浴洗手盆',8.5,3.6,1.8,.85,.65],['shower','淋浴隔板',4.5,2.8,.12,1.9,1.4],
['conference','会议桌',6,8,2.8,.78,1.35],['desk','值守办公桌',17,-1.5,2,.8,.9],['worktable','检修操作台',-16,-6.8,2,.9,.9]
])prop(id,name,x,z,w,h,d);
export const rooms=[
['维护工坊',-15,-8.8],['车库',-14,0],['储物间',-3.4,-8],['装备间',-3.4,-3.2],['洗消间',-3.4,5],['员工通道',.25,0],
['厨房',5,-8],['休闲室',14,-6.5],['宿舍',6,-1.8],['卫浴间',6,2.5],['办公／会议室',5.8,6.4],['值守办公室',16,0],['门厅',15.3,5]
];

export const dressing=roomLayout.objects;
for(const entry of dressing){
 if(entry.bind)continue;
 const host=byId.get(entry.parent);
 const [w,h,d]=entry.size;
 const {x,y,z}=host.transform;
 part(entry.id,entry.name,entry.parent,entry.x-x,entry.y-y,entry.z-z,w,h,d,{
  yaw:entry.yaw,profile:entry.profile,solid:entry.solid??true,color:'steel',kitAsset:entry.asset
 });
}
