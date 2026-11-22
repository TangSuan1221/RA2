import {parts} from '../../world/placements/station-layout.js';
const object=(id,name,profile,x,y,z,yaw,w,h,d,socketType)=>({id,name,prefabId:id,profile,socketType,transform:{x,y,z,yaw},footprint:{w,h,d}});
export const sets={
 lab:{bounds:[5,20,3,16],objects:[
 object('sofa','沙发','prop',12.37,.42,8.91,37,2.1,.8,.9),object('wall','墙段','structural',8,.42,6,0,3,2.8,.25,'wall'),object('door','门','semantic',10,.42,6,0,1.2,2.2,.18,'door'),object('paper','纸片','decor',14,.42,10,17,.4,.01,.3)],
 anchors:[['wall-A','wall',8,.42,6,0],['door-A','door',10,.42,6,0]],supports:[[5,20,3,16,.42]]},
 station:{bounds:[-27,27,-23,31],objects:[],anchors:[],supports:[]},
 world:{bounds:[1645,1680,1245,1276],objects:[object('utility','供电区配电柜','prop',1660,0,1259.2,0,1,1.8,.65),object('barrel','供电区铁桶','prop',1670,0,1259.3,0,.62,.9,.62)],anchors:[],supports:[[1645,1680,1245,1276,0]]}
};

for(const part of parts){
 const {id,profile,transform:t,footprint:f}=part;
 const obj={...part,prefabId:id,socketType:id};
 sets.station.objects.push(obj);
 if(profile==='structural'||profile==='semantic'){
  sets.station.anchors.push([part.parent+'/'+id,id,t.x,t.y,t.z,t.yaw,part.opening?f.w:undefined,part.opening?f.h:undefined]);
 }
 if(part.shape==='floor'||['sink','bench','tray'].includes(id)){
  sets.station.supports.push([t.x-f.w/2,t.x+f.w/2,t.z-f.d/2,t.z+f.d/2,t.y+f.h,id]);
 }
}
