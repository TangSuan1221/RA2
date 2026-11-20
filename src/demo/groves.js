import * as T from 'three';
import {edges,offset,roadWidth} from './network.js';
import {Tree} from '@dgreenheck/ez-tree';

// Clustered planting at the edges of the documented fort, glasshouse and tower lots.
export function addGroves(scene) {
  const leaves = new T.TextureLoader().load('/assets/evac-art/ash-branch.webp');
  leaves.colorSpace = T.SRGBColorSpace;
  const bark = new T.MeshStandardMaterial({color:0x51473a,roughness:1});
  const canopy = new T.MeshStandardMaterial({map:leaves,alphaTest:.43,roughness:.93,side:T.DoubleSide});
  const branch = new T.PlaneGeometry(1,1), stem = new T.CylinderGeometry(.07,.19,1,6);
  let seed=741;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const pose=new T.Object3D(), color=new T.Color();
  const roads=edges.filter(e=>e.state!=='closed');
  const ash=new Tree();
  ash.loadPreset('Ash Medium');ash.options.seed=918;
  Object.assign(ash.options.branch,{sections:{0:8,1:5,2:3,3:2},segments:{0:7,1:5,2:3,3:3}});
  ash.options.branch.children[0]=7;ash.options.branch.children[1]=4;
  ash.options.leaves.count=9;ash.generate();
  const crown=ash.leavesMesh.geometry,wood=ash.branchesMesh.geometry;
  crown.computeBoundingBox();
  const height=crown.boundingBox.max.y;
  const center=crown.boundingBox.getCenter(new T.Vector3());
  const vertex=new T.Vector3(),leafNormal=new T.Vector3(),normal=crown.attributes.normal;
  for(let i=0;i<normal.count;i++){
    vertex.fromBufferAttribute(crown.attributes.position,i).sub(center).normalize();
    leafNormal.fromBufferAttribute(normal,i).lerp(vertex,.68).normalize();
    normal.setXYZ(i,leafNormal.x,leafNormal.y,leafNormal.z);
  }
  const foliage=new T.MeshStandardMaterial({map:ash.leavesMesh.material.map,color:0x849572,alphaTest:.43,side:T.DoubleSide,roughness:.89});
  for(const [x,z,length,angle] of [[424,538,91,0],[507,569,63,1.56],[369,620,66,1.49],[598,254,48,1.43],[681,250,44,1.39],[1168,752,111,.02],[1295,870,72,1.52],[1160,887,110,-.08]]){
    const trees=[];
    for(let i=0;i<length/2;i++){
      const along=(random()-.5)*length, across=(random()+random()-1)*10;
      const px=x+along*Math.cos(angle)-across*Math.sin(angle),pz=z+along*Math.sin(angle)+across*Math.cos(angle);
      if(roads.some(e=>offset(px,pz,e).d<roadWidth(e)/2+2.4))continue;
      trees.push([px,pz,2.8+random()**1.4*9]);
    }
    const mature=trees.filter((t,i)=>t[2]>6&&i%3===0);
    if(mature.length){
      const limbs=new T.InstancedMesh(wood,bark,mature.length),leafClusters=new T.InstancedMesh(crown,foliage,mature.length);
      mature.forEach(([px,pz,h],i)=>{
        pose.position.set(px,0,pz);pose.rotation.set(0,px*.94,.036*Math.cos(pz));
        pose.scale.set(h/height*(.85+.18*Math.sin(px)),h/height,h/height);pose.updateMatrix();
        limbs.setMatrixAt(i,pose.matrix);leafClusters.setMatrixAt(i,pose.matrix);
      });
      for(const mesh of [limbs,leafClusters]){mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
    }
    const understory=trees.filter((t,i)=>t[2]<=6||i%3!==0);
    const crowns=new T.InstancedMesh(branch,canopy,understory.length*12),trunks=new T.InstancedMesh(stem,bark,understory.length);
    understory.forEach(([px,pz,h],i)=>{
      pose.position.set(px,h*.28,pz);pose.rotation.set(0,random()*3,.06*(random()-.5));pose.scale.set(h*.13,h*.57,h*.13);pose.updateMatrix();trunks.setMatrixAt(i,pose.matrix);
      const tint=random(),baseAngle=random()*6;
      for(let j=0;j<12;j++){
        const a=baseAngle+j*2.39996,level=j/12,r=h*.17*(1-level*.65);
        pose.position.set(px+Math.cos(a)*r,h*(.47+.44*level),pz+Math.sin(a)*r);
        pose.rotation.set((random()-.5)*.85,a,(random()-.5)*.9);
        const span=h*(.45+.18*random()-.18*level);
        pose.scale.set(span,span*1.2,1);pose.updateMatrix();crowns.setMatrixAt(i*12+j,pose.matrix);
        color.setHSL(.18+tint*.035,.18+.10*tint,.29+level*.10+random()*.07);crowns.setColorAt(i*12+j,color);
      }
    });
    for(const mesh of [crowns,trunks]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
  }
}
