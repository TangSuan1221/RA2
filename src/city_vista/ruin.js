import * as THREE from 'three/webgpu';
import {texture,positionWorld,normalMap,vec2,mix,vec3,mx_fractal_noise_float,smoothstep,normalWorldGeometry} from 'three/tsl';
import {loadTexture} from '../world/assets.js';
import {rng} from './util.js';
import {ledgeHeight} from './ground.js';
import {ledgeEdge} from './layout.js';

export function buildRuinFrame(){
 const root=new THREE.Group();root.name='broken-observation-wall';
 const diff=loadTexture('textures/cracked_concrete/cracked_concrete_diff_2k.jpg',{srgb:true});
 const nor=loadTexture('textures/cracked_concrete/cracked_concrete_nor_gl_2k.jpg');
 const m=new THREE.MeshStandardNodeMaterial({roughness:.96});
 const p=positionWorld;
 const dirt=smoothstep(.4,.68,mx_fractal_noise_float(p.mul(.75),3,2,.5).mul(.5).add(.5));
 const side=normalWorldGeometry.x.abs();
 const sample= t=>mix(texture(t,p.xy.mul(.45)),texture(t,p.zy.mul(.45)),side);
 m.colorNode=sample(diff).rgb.mul(mix(vec3(.54,.55,.5),vec3(.12,.18,.08),dirt));
 m.normalNode=normalMap(sample(nor),vec2(1.3));
 const shape=new THREE.Shape();shape.moveTo(-8,4.5);shape.lineTo(-8,12);shape.lineTo(-6.7,11.5);shape.lineTo(-6.3,9.8);shape.lineTo(-5.7,10);shape.lineTo(-5.35,8.3);shape.lineTo(-4.4,7.6);shape.lineTo(-4.8,6.4);shape.lineTo(-3.4,5.9);shape.lineTo(-3.1,4.5);shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:.58,bevelEnabled:true,bevelThickness:.08,bevelSize:.07,bevelSegments:2,steps:1});
 const wallPos=g.attributes.position;for(let i=0;i<wallPos.count;i++)if(wallPos.getY(i)<4.7)wallPos.setY(i,-.2);g.computeVertexNormals();
 const wall=new THREE.Mesh(g,m);wall.position.z=-4;wall.castShadow=wall.receiveShadow=true;root.add(wall);
 const steel=new THREE.MeshStandardMaterial({color:0x513a25,metalness:.65,roughness:.88});
 for(let i=0;i<8;i++){
  const x=-6.5+i*.39,y=9.7-i*.48;
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,-3.7),new THREE.Vector3(x+.18,y+.7,-3.68),new THREE.Vector3(x+.62,y+1,-3.9)]);
  const rod=new THREE.Mesh(new THREE.TubeGeometry(curve,9,.022,5,false),steel);root.add(rod);
 }
 const r=rng(441),rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),m,55),o=new THREE.Object3D();
 for(let i=0;i<55;i++){const s=r.range(.06,.20),x=r.range(-5,8),z=ledgeEdge(x)+r.range(.7,3);o.position.set(x,ledgeHeight(x,z)+s*.22,z);o.rotation.set(r(),r()*6.28,r());o.scale.set(s,s*.55,s*.8);o.updateMatrix();rocks.setMatrixAt(i,o.matrix);}
 rocks.receiveShadow=rocks.castShadow=true;root.add(rocks);return root;
}
