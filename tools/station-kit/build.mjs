import {rebuildReferences,referenceMeshes} from './reference-meshes.mjs';
import {Box3,Vector3,Quaternion,Euler,Matrix4,BoxGeometry,CylinderGeometry,SphereGeometry,TorusGeometry} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {surface} from './surfaces.mjs';
import {draft,out} from './draft.mjs';
const geometries=new Map();
function geometry(shape){
 if(referenceMeshes.has(shape))return referenceMeshes.get(shape);
 if(geometries.has(shape))return geometries.get(shape);
 let g;if(shape==='box')g=new RoundedBoxGeometry(1,1,1,1,.025);
 else if(shape==='oval')g=new SphereGeometry(.5,24,16);
 else if(shape.startsWith('ring')){g=new TorusGeometry(.405,.095,10,32);if(shape.endsWith('x'))g.rotateY(Math.PI/2);if(shape.endsWith('y'))g.rotateX(Math.PI/2);}
 else{g=new CylinderGeometry(.5,.5,1,32);if(shape.endsWith('x'))g.rotateZ(Math.PI/2);if(shape.endsWith('z'))g.rotateX(Math.PI/2);}
 g.computeBoundingBox();const s=g.boundingBox.getSize(new Vector3());g.scale(1/s.x,1/s.y,1/s.z);g.computeBoundingBox();
 geometries.set(shape,g);return g;
}
function profile(plan){
 if(plan.host==='opening'||(plan.group==='建筑装修'&&['bay-floor','blockwall','plasterwall','step','beam','jamb','roof-deck','holding-rail','observation','double-door','steel-door','wood-door'].includes(plan.id)))return 'structural';
 if(['sign','label','stripe'].some(x=>plan.id.includes(x))||['parking-line','align-line','handoff-line','zone-sign','leak','dust','glue','old-paint','gear-shadow','poster','id-card'].includes(plan.id))return 'decor';
 return ['ceiling','wall'].includes(plan.host)?'semantic':'prop';
}
const specialIDs={'watch-desk':['IN-01','IN-03','IN-08'],'south-shutter':['DR-04','DR-08'],'pump-test-bench':['IN-01','IN-04'],'hose-cart':['MV-02','CB-01'],'double-door':['DR-02']};
function build(plan){
 const gl={asset:{version:'2.0',generator:'RA2 Station Kit'},scene:0,scenes:[{nodes:[0]}],nodes:[],meshes:[],materials:[],textures:[],images:[],buffers:[],bufferViews:[],accessors:[]};
 let bytes=0;const chunks=[],geos=new Map(),materials=new Map(),meshes=new Map(),groups=new Map(),bounds=new Box3();
 const root={name:plan.id,children:[],extras:{label:plan.label,units:'metres',designSize:plan.size,host:plan.host,profile:profile(plan),interactionIDs:specialIDs[plan.id]||[]}};gl.nodes.push(root);
 function insert(buf,target){let pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad}const i=gl.bufferViews.length;gl.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:buf.length,...(target?{target}:{})});chunks.push(buf);bytes+=buf.length;return i}
 function attribute(a,type,target){let data=a.array;let acc={bufferView:insert(Buffer.from(data.buffer,data.byteOffset,data.byteLength),target),componentType:data instanceof Float32Array?5126:data instanceof Uint32Array?5125:5123,count:a.count,type};if(type==='VEC3'&&target===34962){acc.min=Array(3).fill(Infinity);acc.max=Array(3).fill(-Infinity);for(let i=0;i<data.length;i++){let k=i%3;acc.min[k]=Math.min(acc.min[k],data[i]);acc.max[k]=Math.max(acc.max[k],data[i])}}return gl.accessors.push(acc)-1}
 function geom(shape){if(!geos.has(shape)){let g=geometry(shape);geos.set(shape,{attributes:{POSITION:attribute(g.attributes.position,'VEC3',34962),NORMAL:attribute(g.attributes.normal,'VEC3',34962),TEXCOORD_0:attribute(g.attributes.uv,'VEC2',34962)},...(g.index?{indices:attribute(g.index,'SCALAR',34963)}:{})})}return geos.get(shape)}
 let plateTexture;
 function material(m,label,isPlate=false){let key=m+label+(isPlate?"_plate":"");if(materials.has(key))return materials.get(key);const metal=['steel','iron','brass'].includes(m);
 let tex=plateTexture;
 if(!isPlate||tex===undefined){tex=gl.textures.length;gl.images.push({mimeType:'image/png',bufferView:insert(isPlate?readFileSync(join(out,'concept.png')):surface(m,label))});gl.textures.push({source:gl.images.length-1});if(isPlate)plateTexture=tex;}let glass=m==='glass';
 let material={name:label||m,pbrMetallicRoughness:{baseColorTexture:{index:tex},baseColorFactor:isPlate?[.77,.77,.77,1]:[1,1,1,glass?.44:1],metallicFactor:isPlate?(metal?.24:.03):metal?.70:.05,roughnessFactor:glass?.16:metal?.43:.79},...(glass?{alphaMode:'BLEND',doubleSided:true}:{})};
 const i=gl.materials.push(material)-1;materials.set(key,i);return i;}
 function parent(name){
 if((plan.id==='south-shutter'||plan.id.startsWith('shutter-'))&&['leaf-slat','bottom-seal','bottom-bar'].includes(name))return 'moving_leaf';
 if((plan.id==='hose-cart'||plan.id.startsWith('cart-'))&&name==='brake')return 'brake_pedal';
 if(plan.id==='cart-loaded'&&name.startsWith('cargo-'))return 'pump_load';
 if(plan.id==='hose-cart'&&name==='woven-hose')return 'hose_load';
 return null;}
 for(const p of plan.parts){
 let [x,y,w,h]=p.front,[z,sideY,d,sideH]=p.right;
 if(y!==sideY||h!==sideH||JSON.stringify(p.top)!==JSON.stringify([x,z,w,d]))throw Error('Inconsistent views '+plan.id);
 const label=['lettering','board','log','id-plate','name'].includes(p.part)?({'exit':'EXIT','watch-desk':'DUTY LOG','pump-a':'PUMP A','pump-b':'PUMP B','id-card':'PUMP 07'}[plan.id]||plan.id):'';
 const mat=material(p.material,label,referenceMeshes.has(p.shape)),key=p.shape+':'+mat;
 if(!meshes.has(key))meshes.set(key,gl.meshes.push({primitives:[{...geom(p.shape),material:mat}]})-1);
 const node={name:p.part,mesh:meshes.get(key),translation:[x,y,z],scale:[w,h,d]};
 const rot=new Quaternion().setFromEuler(new Euler(0,0,p.angle));if(p.angle)node.rotation=rot.toArray();
 const m=new Matrix4().compose(new Vector3(x,y,z),rot,new Vector3(w,h,d));bounds.union(geometry(p.shape).boundingBox.clone().applyMatrix4(m));
 const group=parent(p.part);let children=root.children;if(group){if(!groups.has(group)){const branch={name:group,children:[]};if(group==='brake_pedal')branch.translation=[x,y,z];root.children.push(gl.nodes.push(branch)-1);groups.set(group,branch)}const branch=groups.get(group);children=branch.children;if(branch.translation)node.translation=node.translation.map((v,i)=>v-branch.translation[i]);}
 children.push(gl.nodes.push(node)-1);
 }
 // The authored views use a common reference origin. Ground the root at the measured lowest point.
 root.translation=[0,-bounds.min.y,0];const measured=bounds.getSize(new Vector3()).toArray().map(v=>+v.toFixed(4));root.extras.measuredSize=measured;
 const attachments={floor:[0,0,0],opening:[0,0,0],ceiling:[0,measured[1],0],wall:[0,measured[1]/2,bounds.min.z]};
 root.extras.mount=attachments[plan.host]||[0,0,0];
 let bin=Buffer.concat(chunks);gl.buffers.push({byteLength:bin.length});const j=Buffer.from(JSON.stringify(gl)),jp=Buffer.alloc((4-j.length%4)%4,32),bp=Buffer.alloc((4-bin.length%4)%4);
 const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+jp.length+bin.length+bp.length,8);header.writeUInt32LE(j.length+jp.length,12);header.write('JSON',16);bh.writeUInt32LE(bin.length+bp.length);bh.write('BIN\0',4);
 const result=Buffer.concat([header,j,jp,bh,bin,bp]);writeFileSync(join(out,'models',plan.id+'.glb'),result);
 return {id:plan.id,label:plan.label,group:plan.group,host:plan.host,design:plan.size,measured,parts:plan.parts.length,bytes:result.length,view:'views/'+plan.id+'.svg',model:'models/'+plan.id+'.glb',profile:root.extras.profile,mount:root.extras.mount,interactionIDs:root.extras.interactionIDs};
}
const plans=draft();
rebuildReferences(plans);
writeFileSync(join(out,'projections.json'),JSON.stringify(plans));
const manifest=plans.map(build);
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(manifest.length+' GLBs, '+manifest.reduce((s,a)=>s+a.bytes,0)+' bytes');
