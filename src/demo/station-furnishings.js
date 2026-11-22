import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {dressing} from '../world/placements/station-layout.js';

const pigments={oak:0xa67c54,red:0xa44b3c,olive:0x75745c,steel:0x9b9f9e,iron:0x606864,cloth:0xb4a88b,rubber:0x3e4140,black:0x343936,paper:0xe2dbc5,brass:0xa68e62};
const surfaces={oak:'rough_wood',steel:'rusty_metal_02',iron:'rusty_metal_02',olive:'green_metal_rust',red:'rusty_painted_metal'};
const traced=new Set(['pump-test-bench','hose-cart','watch-desk','south-shutter']);
function projectedUV(g){
 const position=g.attributes.position,normal=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<position.count;i++){
  const x=Math.abs(normal.getX(i)),y=Math.abs(normal.getY(i)),z=Math.abs(normal.getZ(i));
  if(y>=x&&y>=z)uv.setXY(i,position.getX(i),position.getZ(i));
  else uv.setXY(i,x>z?position.getZ(i):position.getX(i),position.getY(i));
 }
}
function dial(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#ded8c9';ctx.fillRect(0,0,256,256);ctx.translate(128,128);ctx.font='14px sans-serif';ctx.textAlign='center';
 for(let i=0;i<=40;i++){const t=(135+i*6.75)*Math.PI/180,cs=Math.cos(t),sn=Math.sin(t),l=i%5?98:88;
  ctx.beginPath();ctx.moveTo(108*cs,108*sn);ctx.lineTo(l*cs,l*sn);ctx.strokeStyle='#393c37';ctx.lineWidth=i%5?1:3;ctx.stroke();
  if(i%5===0){ctx.fillStyle='#393c37';ctx.fillText(i*5,75*cs,75*sn+5)}}
 ctx.fillText('PSI',0,46);ctx.beginPath();ctx.moveTo(8,5);ctx.lineTo(-58,-63);ctx.strokeStyle='#974737';ctx.lineWidth=4;ctx.stroke();
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return new T.MeshStandardMaterial({map:texture,roughness:.68});
}
export async function furnishStation(scene,meshes){
 const loader=new GLTFLoader(),textures=new T.TextureLoader(),cache=new Map(),materials=new Map(),maps=new Map(),gauge=dial();
 const invisible=new T.MeshBasicMaterial({visible:false});
 function surface(name,original){
  if(!Object.hasOwn(pigments,name))return original;
  if(materials.has(name))return materials.get(name);
  const s=surfaces[name],m=new T.MeshStandardMaterial({color:pigments[name],roughness:/steel|iron|brass/.test(name)?.58:.83,metalness:/steel|iron|brass/.test(name)?.38:.03});
  if(s){if(!maps.has(s)){const map=textures.load('/assets/textures/'+s+'/'+s+'_diff_1k.jpg');map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;maps.set(s,map)}m.map=maps.get(s)}
  materials.set(name,m);return m;
 }
 async function template(id){
  if(cache.has(id))return cache.get(id);
  const job=loader.loadAsync('/assets/station-kit/models/'+id+'.glb').then(({scene:source})=>{
   source.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(source,true),center=bounds.getCenter(new T.Vector3()),groups=new Map();
   source.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(id==='south-shutter'&&!/^(leaf-slat|bottom-bar)/.test(mesh.name))return;
    const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();g.applyMatrix4(mesh.matrixWorld);
    let m=mesh.material;
    if(traced.has(id)||surfaces[m.name]||['rubber','cloth'].includes(m.name)){
     const original=m;m=surface(m.name,original);
     if(traced.has(id)&&m===original)m=surface('paper',original);
     projectedUV(g);
     if(mesh.name.startsWith('gauge-face')){
      g.computeBoundingBox();const box=g.boundingBox,uv=g.attributes.uv,p=g.attributes.position;
      for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-box.min.x)/(box.max.x-box.min.x),(p.getY(i)-box.min.y)/(box.max.y-box.min.y));
      m=gauge;
     }
    }
    g.translate(-center.x,-bounds.min.y,-center.z);
    if(!groups.has(m))groups.set(m,[]);groups.get(m).push(g);
   });
   const group=new T.Group();
   for(const [material,geoms] of groups){const merged=mergeGeometries(geoms);const node=new T.Mesh(merged,material);node.castShadow=node.receiveShadow=true;group.add(node);geoms.forEach(g=>g.dispose())}
   const unused=new Set();source.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(!groups.has(o.material))unused.add(o.material)}});
   const oldMaps=new Set();for(const m of unused){if(m.map)oldMaps.add(m.map);m.dispose()}for(const t of oldMaps){t.dispose();t.source.data?.close?.()}
   return group;
  });cache.set(id,job);return job;
 }
 // Limit simultaneous decoding, especially for the captured-reference meshes.
 const ids=[...new Set(dressing.map(o=>o.asset))];let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<ids.length)await template(ids[next++])}));
 for(const entry of dressing){
  const host=meshes.get(entry.id),node=(await template(entry.asset)).clone(),[w,h,d]=entry.size;
  if(!host)throw Error('缺少放置宿主 '+entry.id);
  if(entry.id==='gate'){
   const box=new T.Box3().setFromObject(node,true),bounds=box.getSize(new T.Vector3()),mid=box.getCenter(new T.Vector3());
   const f=host.geometry.parameters;node.scale.set(f.width/bounds.x,f.height/bounds.y,f.depth/bounds.z);
   node.position.copy(mid).multiply(node.scale).negate();host.material=invisible;host.add(node);continue;
  }
  const originalHeight=host.geometry.parameters.height;
  const bodyHeight=entry.id==='reception'?.98:h;
  host.geometry=new T.BoxGeometry(w,bodyHeight,d);
  host.position.y+=(bodyHeight-originalHeight)/2+.012;host.material=invisible;
  // Bound props inherit the editor's saved yaw, plus the asset's front-axis correction.
  if(entry.bind)host.rotation.y+=entry.yaw*Math.PI/180;
  node.position.y=-bodyHeight/2;node.name=entry.asset;host.add(node);host.visible=true;host.castShadow=false;
 }
 const cart=meshes.get('cart'),empty=cart.children.at(-1),loaded=(await template('cart-loaded')).clone();
 loaded.position.y=empty.position.y;loaded.visible=false;cart.add(loaded);
 cart.userData.setLoad=active=>{empty.visible=!active;loaded.visible=active};
 scene.updateMatrixWorld(true);scene.userData.roomDressingCount=dressing.length;
}
