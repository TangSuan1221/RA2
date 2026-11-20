import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function towerLift(scene) {
  const x=1220,z=835,top=124.5;
  const metal=new T.MeshStandardMaterial({color:0x555b54,metalness:.55,roughness:.59});
  const fixed=[],moving=[];
  const box=(list,w,h,d,a,b,c)=>list.push(new T.BoxGeometry(w,h,d).translate(a,b,c));
  for(const side of [-1,1]){
    box(fixed,.14,top,.15,x+side*1.6,top/2,z-1);
    box(moving,.09,1.08,2.1,side*1.5,.55,0);

    for(const end of [-1,1])box(moving,.085,2.25,.085,side*1.45,1.14,end);
  }
  for(const y of [.45,.95]) box(moving,2.92,.065,.065,0,y,-1.04);
  box(moving,3.12,.16,2.4,0,-.08,0);
  for(let y=3;y<top;y+=4.6)box(fixed,3.15,.12,.12,x,y,z-1.09);
  const rails=new T.Mesh(mergeGeometries(fixed),metal),cabin=new T.Mesh(mergeGeometries(moving),metal);
  for(const mesh of [rails,cabin]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
  for(const g of [...fixed,...moving])g.dispose();
  cabin.position.set(x,.13,z);
  let phase='idle',elapsed=0,from;
  function begin(pos) {from=pos.clone();phase='boarding';elapsed=0;}
  function descend(){if(phase==='upper'){phase='down';elapsed=0;}}
  function step(dt,pos) {
    elapsed+=dt;
    if(phase==='boarding'||phase==='leaving'){
      let t=Math.min(1,elapsed/Math.max(.4,Math.hypot(x-from.x,z-from.z)/2.5));
      if(phase==='leaving')t=1-t;
      pos.set(T.MathUtils.lerp(from.x,x,t),.13,T.MathUtils.lerp(from.z,z,t));
      if(phase==='boarding'&&t===1){phase='up';elapsed=0;}
      else if(phase==='leaving'&&t===0){pos.copy(from);phase='idle';}
    }else{
      if(phase==='up'||phase==='down'){
        let t=Math.min(1,elapsed/16);
        t=t*t*(3-2*t);
        cabin.position.y=.13+top*(phase==='up'?t:1-t);
        if(elapsed>=16){phase=phase==='up'?'upper':'leaving';elapsed=0;}
      }
      pos.copy(cabin.position);
    }
  }
  return {begin,descend,step,get active(){return phase!=='idle';},get atTop(){return phase==='upper';}};
}
