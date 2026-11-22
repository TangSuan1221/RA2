import {AnchorIndex,validator} from './solver.js';
export function context(set,objects,object){
 const [xmin,xmax,zmin,zmax]=set.bounds,anchors=new AnchorIndex();
 for(const [id,type,x,y,z,yaw,w,h] of set.anchors)anchors.register({id,type,kind:'socket',x,y,z,yaw,opening:w?{w,h}:null});
 const cell={};const sample={y:0,normal:{x:0,y:1,z:0},layer:'ped'};
 return {anchors,grid:{worldToCell:(x,z)=>x>=xmin&&x<=xmax&&z>=zmin&&z<=zmax?cell:null},
 surface:{sample(x,z){
  let height=-Infinity;
  for(const [a,b,c,d,y,id] of set.supports)if((!object.parent||object.profile!=='prop'||object.parent===id)&&x>=a&&x<=b&&z>=c&&z<=d&&y<=object.transform.y+.35)height=Math.max(height,y);
  if(!Number.isFinite(height))return null;sample.y=height;return sample;
 }},validator:validator(objects)};
}
