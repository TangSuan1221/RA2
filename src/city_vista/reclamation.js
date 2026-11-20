import * as THREE from 'three/webgpu';
import { rng, fbm2 } from './util.js';
import {loadTexture} from '../world/assets.js';
import {vec3,mix,uv,transformNormalToView} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Dense rooted clumps leave a broken, meandering walking route through the street.
export function reclaimStreet() {
  const r = rng(781), group = new THREE.Group();
  group.name = 'street-reclamation';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.012,0,0, .012,0,0, -.007,.32,.025, .007,.32,.025, 0,.68,.11
  ],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,.5,1,.5,.5,1],2));
  geometry.setIndex([0,1,2,1,3,2,2,3,4]); geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;for(let i=0;i<normals.count;i++)normals.setXYZ(i,0,1,0);
  const mat = new THREE.MeshStandardNodeMaterial({roughness:.95,side:THREE.DoubleSide});
  mat.colorNode=mix(vec3(.018,.029,.007),vec3(.09,.125,.035),uv().y);
  mat.normalNode=transformNormalToView(vec3(0,1,0));
  const clump=[];
  for(let k=0;k<7;k++){const blade=geometry.clone();blade.scale(1,r.range(.65,1.25),1);blade.rotateY(r()*6.28);blade.translate(r.range(-.17,.17),0,r.range(-.17,.17));clump.push(blade);}
  const clumpGeometry=mergeGeometries(clump);
  const entries=[];
  for(let i=0;i<58000;i++) {
    const x=r.range(-10.4,10.4),z=r.range(-78,38);
    const route=Math.sin(z*.085)*1.35+.8;
    const edge=Math.abs(x-route);
    const cluster=fbm2(x*.29+14,z*.2,3);
    if(edge<1.3+Math.sin(z*.6)*.3 || cluster<.40 || (edge<3.4&&cluster<.6))continue;
    if (Math.abs(x+3.9)<1.9&&Math.abs(z-1.5)<6 || Math.abs(x+4.4)<1.5&&Math.abs(z-21.5)<2.8 || Math.abs(x-4)<1.7&&Math.abs(z-15)<3)continue;
    entries.push({x,z,s:r.range(.28,.9)*(edge>6?1.15:.8)});
  }
  const mesh=new THREE.InstancedMesh(clumpGeometry,mat,entries.length),o=new THREE.Object3D(),c=new THREE.Color();
  entries.forEach(({x,z,s},i)=>{o.position.set(x,.008,z);o.rotation.set(0,r()*6.28,r.range(-.16,.16));o.scale.set(r.range(.6,1.4),s,1);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);c.setRGB(r.range(.48,.78),r.range(.55,.85),r.range(.36,.55));mesh.setColorAt(i,c);});
  mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const d=Math.hypot((x-64)/64,(y-64)/64),n=fbm2(x*.055,y*.055,3),a=d<.55+n*.48?255:0;
    const k=(y*128+x)*4;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=a;pixels.data[k+3]=255;
  }ctx.putImageData(pixels,0,0);
  const alpha=new THREE.CanvasTexture(canvas);
  const floor=new THREE.MeshStandardMaterial({map:loadTexture('textures/brown_mud_leaves_01/brown_mud_leaves_01_diff_1k.jpg',{srgb:true,repeat:3}),normalMap:loadTexture('textures/brown_mud_leaves_01/brown_mud_leaves_01_nor_gl_1k.jpg',{repeat:3}),color:0x656c45,alphaMap:alpha,alphaTest:.5,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  const patches=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),floor,54);
  for(let i=0;i<54;i++){const z=32-Math.floor(i/2)*4.2,x=i%2?-5.5:5.5;o.position.set(x+r.range(-.7,.7),.018,z);o.rotation.set(-Math.PI/2,0,r()*1.1);o.scale.set(r.range(4,7),r.range(5,8),1);o.updateMatrix();patches.setMatrixAt(i,o.matrix);}
  patches.receiveShadow=true;group.add(patches);return group;
}
