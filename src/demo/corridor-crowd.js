import * as T from 'three';

export function corridorCrowd(scene){
 const people=Array.from({length:28},(_,i)=>{
  const cluster=i<12?927:i<19?865:i<24?1042:1120;
  const angle=i*2.39996,radius=1.5+(i%5)*1.35;
  const x=cluster+Math.cos(angle)*radius,z=1280+Math.sin(angle)*radius;
  return {x,z,homeX:x,homeZ:z,goalX:x,goalZ:z,alert:false};
 });
 const figures=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),
  new T.MeshStandardMaterial({roughness:.96,flatShading:true}),people.length*6);
 figures.name='21 corridor silhouettes';figures.castShadow=true;figures.frustumCulled=false;
 figures.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(figures);
 const part=new T.Object3D(),color=new T.Color();
 const coats=[0x534b40,0x4f5650,0x514649,0x454d53];
 for(let i=0;i<people.length;i++)for(let n=0;n<6;n++){
  figures.setColorAt(i*6+n,color.set(n===1?0x8c8070:n>=4?0x413f3e:coats[i%4]));
 }
 let near=false,heard=false,clock=0,dirty=true;
 function horn(x,z,rain){
  const radius=rain?180:300;
  let count=0;
  for(const [i,p] of people.entries())if(Math.hypot(p.x-x,p.z-z)<=radius){
   const a=i*2.4,spread=2+i%4;
   p.goalX=x+Math.cos(a)*spread;p.goalZ=z+Math.sin(a)*spread;p.alert=true;count++;
  }
  heard=count>0||heard;
  return {radius,count};
 }
 function update(x,z,dt){
  clock+=dt;
  figures.visible=Math.abs(x-1000)<570&&Math.abs(z-1280)<440;
  let closest=Infinity;
  for(const [i,p] of people.entries()){
   const playerDistance=Math.hypot(x-p.x,z-p.z);
   if(p.alert&&Math.hypot(x-p.goalX,z-p.goalZ)>90){
    p.alert=false;p.goalX=p.homeX;p.goalZ=p.homeZ;
   }
   if(p.alert)closest=Math.min(closest,playerDistance);
   const dx=p.goalX-p.x,dz=p.goalZ-p.z,d=Math.hypot(dx,dz);
   const step=Math.min(d,dt*(p.alert?2.4+i%5*.17:1.45));
   if(step>0){p.x+=dx/d*step;p.z+=dz/d*step}
   if(!figures.visible||(!step&&!dirty))continue;
   const yaw=d>.05?Math.atan2(dx,dz):i*2.4;
   const swing=d>.1?Math.sin(clock*7+i):0;
   function limb(n,lateral,y,forward,w,h,depth,tilt=0){
    part.position.set(p.x+lateral*Math.cos(yaw)+forward*Math.sin(yaw),y,p.z-lateral*Math.sin(yaw)+forward*Math.cos(yaw));
    part.rotation.set(tilt,yaw,0,'YXZ');part.scale.set(w,h,depth);part.updateMatrix();figures.setMatrixAt(i*6+n,part.matrix);
   }
   limb(0,0,1.07,0,.3,.48,.21,.13);limb(1,0,1.61,.07,.17,.21,.17);
   for(const sign of [-1,1]){
    limb(sign<0?2:3,sign*.26,1.02,.08,.095,.37,.095,.19+swing*sign*.47);
    limb(sign<0?4:5,sign*.12,.44,0,.13,.45,.12,-swing*sign*.45);
   }
  }
  if(figures.visible)figures.instanceMatrix.needsUpdate=true;
  dirty=!figures.visible;
  if(!near&&closest<15){near=true;return '人群接近车辆，驶离鸣笛位置可拉开距离。'}
  if(heard&&closest===Infinity){near=false;heard=false;return '已驶离声源，人群正在散去。'}
  return '';
 }
 return {horn,update};
}
