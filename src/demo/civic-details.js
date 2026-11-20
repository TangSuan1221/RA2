import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {edges,offset,roadWidth} from './network.js';

function dressPumper(engine){
 const canvas=new T.MeshStandardMaterial({color:0x744137,roughness:.93,side:T.DoubleSide});
 const cover=new T.PlaneGeometry(3.63,1.95,6,6);cover.rotateX(-Math.PI/2);
 const p=cover.attributes.position;
 for(let i=0;i<p.count;i++)p.setY(i,.055*(1-Math.abs(p.getZ(i)))+.016*Math.cos(p.getX(i)*4.3));
 cover.computeVertexNormals();
 const hood=new T.Mesh(cover,canvas);hood.position.set(-2.35,2.55,0);engine.add(hood);
 const ivory=new T.MeshStandardMaterial({color:0xd7d5c7,roughness:.52,metalness:.16});
 const dark=new T.MeshStandardMaterial({color:0x312d29,roughness:.73});
 const parts=(x,y,z,w,h,d,m)=>{
  const part=new T.Mesh(new T.BoxGeometry(w,h,d),m);part.position.set(x,y,z);engine.add(part);
 };
 for(const side of [-1,1]){
  for(const ax of [2.34,3.05])parts(ax,2.19,side*1.225,.091,.82,.035,ivory);
  parts(2.35,1.48,side*1.225,.021,.56,.024,dark);
  parts(3.10,1.75,side*1.23,.18,.045,.041,dark);
 }
 for(const ax of [-3.91,-2.35,-.79])parts(ax,2.61,0,.037,.025,1.92,dark);
 const hose=new T.MeshStandardMaterial({color:0x20221f,roughness:.89});
 for(const side of [-1,1]){
  const tube=new T.Mesh(new T.CylinderGeometry(.104,.104,3.58,14),hose);
  tube.position.set(-2.37,2.59,side*1.05);tube.rotation.z=Math.PI/2;engine.add(tube);
  for(const ax of [-3.92,-2.30,-.71])parts(ax,2.60,side*1.05,.062,.20,.24,dark);
 }
 engine.traverse(part=>{
  if(!part.isMesh)return;
  const mat=part.material;
  if(mat.name==='Original red outdoor paint'){mat.color.setRGB(.37,.32,.31);mat.roughness=.54;}
  if(mat.name==='Original fine-grained tyre rubber'){mat.color.setRGB(.39,.41,.40);mat.roughness=.86;}
 });
}

export function addCivicDetails(scene){
 const loader=new T.TextureLoader(), root=new T.Group();
 root.name='Civic landmarks';scene.add(root);
 function surface(id,color,size='1k'){
  const prefix='/assets/textures/'+id+'/'+id+'_';
  const map=loader.load(prefix+'diff_'+size+'.jpg'),normalMap=loader.load(prefix+'nor_gl_'+size+'.jpg');
  map.colorSpace=T.SRGBColorSpace;
  return new T.MeshStandardMaterial({color,map,normalMap,normalScale:new T.Vector2(.48,.48),roughness:.83});
 }
 const mats={
  slab:surface('cracked_concrete',0xbdbab0,'2k'), stone:surface('concrete_moss',0x9f9b89),
  red:surface('rusty_painted_metal',0xae4031),iron:surface('rusty_painted_metal',0x827b6e),
  glass:new T.MeshStandardMaterial({color:0x324345,metalness:.52,roughness:.23})
 };
 const leaves=loader.load('/assets/evac-art/ash-branch.webp');leaves.colorSpace=T.SRGBColorSpace;
 mats.foliage=new T.MeshStandardMaterial({map:leaves,color:0x86925f,side:T.DoubleSide,alphaTest:.38});
 const shapes={box:new T.BoxGeometry(),sprig:new T.PlaneGeometry()};
 const roads=edges.filter(e=>e.state!=='closed'&&e.state!=='boat');
 let batches;
 const dummy=new T.Object3D();
 function put(mat,x,y,z,w,h,d,shape='box',rx=0,ry=0,rz=0){
  dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(rx,ry,rz);dummy.updateMatrix();
  const key=mat+'/'+shape;
  if(!batches.has(key))batches.set(key,{mat,shape,transforms:[]});
  batches.get(key).transforms.push(dummy.matrix.clone());
 }
 function clear(x,z,r){return roads.every(e=>offset(x,z,e).d>roadWidth(e)/2+r+.4)}
 function district(name,draw){
  batches=new Map();draw();
  for(const {mat,shape,transforms} of batches.values()){
   const mesh=new T.InstancedMesh(shapes[shape],mats[mat],transforms.length);
   transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name=name+' '+mat;
   mesh.castShadow=shape!=='sprig';mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);
  }
 }
 function shrub(x,z,height,seed){
  for(let i=0;i<6;i++){
   const a=i*2.4+seed;
   put('foliage',x+.33*height*Math.cos(a),height*.49,z+.33*height*Math.sin(a),height*1.35,height,1,'sprig',-.25,a,.16*Math.cos(a));
  }
 }
 function slabs(x,z,n,m,step){
  for(let i=0;i<n;i++)for(let j=0;j<m;j++){
   const xx=x+i*step,zz=z+j*step;
   if(clear(xx,zz,step*.71))put('slab',xx,.018,zz,step-.09,.065,step-.12,'box',0,0,0);
  }
 }
 district('Engine company',()=>{
  slabs(398,1207,11,2,3.4);
  new GLTFLoader().load('/assets/models/engine-07.glb',({scene:engine})=>{
   engine.name='Engine Company 07 pumper';
   engine.rotation.y=Math.PI+.215;
   engine.position.set(437.35,.025,1215.32);
   engine.scale.set(1.25,1.075,1.02);
   dressPumper(engine);
   engine.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;}});
   root.add(engine);
  });
  for(let i=0;i<4;i++)put('red',413+i*1.7,8.3,1197,.16,1.5,.15);
  for(const y of [8.0,8.8])put('iron',415.55,y,1197,5.3,.09,.09);
  for(const xx of [417,430])put('red',xx, .6,1206,.19,1.2,.19);
 });
 district('Fort Lawton',()=>{
  slabs(410,563,13,5,3.6);
  const x=469,z=611;
  put('stone',x,1.62,z,4.6,3.2,3.4);put('iron',x,3.33,z,5.1,.24,3.9);
  put('glass',x,2.05,z+1.73,3.65,.98,.1);
  for(const xx of [-1.5,0,1.5])put('iron',x+xx,2.05,z+1.82,.09,1.05,.09);
  for(const [px,pz,n] of [[396,575,8],[441,567,7],[469,620,8]]){
   for(let i=0;i<n;i++){
    const xx=px+i*1.54;if(!clear(xx,pz,1.8))continue;
    put('stone',xx,.15,pz+1.35,1.52,.29,.24);shrub(xx,pz,1.2+.4*Math.sin(i),i);
   }
  }
 });
 district('Needle forecourt',()=>{
  slabs(1173,824,16,11,4.25);
  for(const [x,z,span] of [[1175,868,33],[1230,860,25],[1192,834,15]]){
   for(let i=0;i<span;i+=2.5){
    if(!clear(x+i,z,1.6))continue;
    put('iron',x+i,1.24,z,.13,2.48,.13);
    for(const y of [.65,1.55,2.32])put('iron',x+i,y,z,2.52,.07,.07);
    shrub(x+i,z+.62,.75+.4*Math.abs(Math.sin(i)),i);
   }
  }
 });
 return root;
}
