// Ruined marine museum. Original geometry, existing CC0 scanned surfaces.
import * as THREE from 'three/webgpu';
import { vec3, mix, positionLocal, positionWorld, normalWorldGeometry, texture, luminance, mx_noise_float, smoothstep, float } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadHDR, loadModel, InstanceBatch, trs, loadTexture } from '../world/assets.js';
import { archMaterial, paintedSteel } from '../flooded_atrium/materials.js';
import { mulberry, boxUV } from '../flooded_atrium/util.js';
import { hangStrand, buildFoliage } from '../flooded_atrium/foliage.js';
import { createVolumeFog, VOLUME_LAYER } from '../core/renderer.js';

export const SHOTS = {
 hero: { position: [0, 2.1, 17], lookAt: [0, 6.3, -5], fov: 62 },
 gallery: { position: [9, 7.2, 2], lookAt: [-2, 5, -5], fov: 65 },
 top: { mode:'top', yaw:0, pitch:55, distance:34, target:[0,2,-3] }
};

export async function build({scene,renderer,camera}) {
 const rng = mulberry(8631);
 scene.background = new THREE.Color(0x8babb2);
 scene.environment = await loadHDR('hdri/kloofendal_overcast_1k.hdr');
 scene.background=scene.environment;
 scene.backgroundBlurriness=.1;
 scene.backgroundIntensity=.8;
 scene.environmentIntensity = .34;
 scene.fog = new THREE.FogExp2(0x64797a,.006);
 renderer.toneMappingExposure = .9;
 const concrete = archMaterial('concrete_wall_008',{res:'2k',tint:0xabb2ae,dark:.85,scale:.35,moss:.7});
 const turquoise = archMaterial('worn_mossy_plasterwall',{tint:0x459594,dark:.8,scale:.33,moss:.5});
 const floor = archMaterial('cracked_concrete',{res:'2k',tint:0x969e91,dark:.85,scale:.16,moss:.3});
 const mossScan=loadTexture('textures/concrete_moss/concrete_moss_diff_2k.jpg',{srgb:true});
 const wear=texture(mossScan,positionWorld.xz.mul(.35)).rgb;
 const patch=smoothstep(-.1,.32,mx_noise_float(positionWorld.mul(.38)).add(luminance(wear).mul(.7)));
 floor.colorNode=mix(floor.colorNode,wear.mul(vec3(.46,.72,.31)),patch.mul(.9));
 const steel = paintedSteel({paint:0x475a58,rustAmt:.5});
 const slab = (w,h,d,x,y,z,mat=concrete,rotation=0) => {
  const g = new RoundedBoxGeometry(w,h,d,2,Math.min(.06,w/3,h/3,d/3));
  const m = new THREE.Mesh(boxUV(g),mat);m.position.set(x,y,z);m.rotation.y=rotation;
  m.castShadow=m.receiveShadow=true;scene.add(m);return m;
 };
 const tube=(points,r=.035,mat=steel)=>{
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const m=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*5),r,6,false),mat);
  m.castShadow=m.receiveShadow=true;scene.add(m);return m;
 };
 slab(28,.4,36,0,-.25,-2,floor);
 // Tall, curved-looking gallery walls, separated into bays; missing roof admits daylight.
 for(let side of [-1,1]) {
  for(let i=0;i<8;i++) {
   let z=12-i*4;
   slab(.55,12,3.9,side*(12.5-Math.max(0,-z-5)*.10),6,z,turquoise);
   slab(.42,12,.45,side*12.15,6,z+1.9,steel);
   slab(2.2,.32,4,side*11.1,7.4,z,concrete);
   slab(.18,1.1,3.9,side*10.15,8,z,turquoise);
  }
 }
 slab(25,10,.55,0,5,-18,turquoise);
 for(let x=-10;x<=10;x+=4) {
  slab(.4,14,.45,x,7,-16,steel);
  slab(3.3,2.2,.18,x+1.8,10.7,-17,concrete);
 }
 // Roof trusses with irregular missing panels.
 for(let z=-14;z<=10;z+=5) {
  slab(25,.28,.35,0,13.5,z,steel);
  tube([[-12,12,z],[0,14.7,z],[12,12,z]],.09);
  for(let x=-10;x<=10;x+=4) {
   tube([[x,13.4,z],[x+2,14.2,z],[x+4,13.4,z]],.045);
   if(rng()<.76) slab(3.8,.12,4.4,x,14,z+2,concrete,.025);
  }
 }
 // Sweeping stair on the right, with continuous curved rails.
 const railA=[],railB=[];
 for(let i=0;i<31;i++) {
  const t=i/30, z=10-t*22, x=9.1-Math.sin(t*Math.PI)*1.4,y=t*7.2;
  slab(3.7,.24,.84,x,y,z,concrete);
  railA.push([x-1.85,y+1.1,z]);railB.push([x+1.85,y+1.1,z]);
  if(i%3===0) for(let s of [-1,1]) tube([[x+s*1.85,y,z],[x+s*1.85,y+1.1,z]],.028);
 }
 tube(railA,.05);tube(railB,.05);
 // Continuous stair cheek walls: curved solid parapets, not floating treads.
 for(const rail of [railA,railB]) {
  const positions=[],idx=[];
  for(let i=0;i<rail.length;i++){const [x,y,z]=rail[i];positions.push(x-.10,y-.12,z,x+.10,y-.12,z,x-.10,y-1.5,z,x+.10,y-1.5,z);}
  for(let i=0;i<rail.length-1;i++){const a=i*4,b=a+4;idx.push(a,b,a+1,a+1,b,b+1,a+2,b+2,a,a,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(boxUV(g),turquoise);m.castShadow=m.receiveShadow=true;scene.add(m);
 }
 // Rounded exhibit enclosure on the left foreground.
 const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.3,.5,48),concrete);
 plinth.position.set(-10,.2,10);plinth.receiveShadow=true;scene.add(plinth);
 for(let h of [.65,1.25]) {
  const p=[];for(let i=0;i<=24;i++){const a=-1.3+i/24*3.9;p.push([-10+3.4*Math.cos(a),h,10+3.4*Math.sin(a)]);}tube(p,.035);
 }
 for(let i=0;i<15;i++){let a=-1.3+i/14*3.9;tube([[-10+3.4*Math.cos(a),.25,10+3.4*Math.sin(a)],[-10+3.4*Math.cos(a),1.25,10+3.4*Math.sin(a)]],.025);}
 // Original suspended whale sculpture: longitudinal contour, flukes and long flippers.
 const whaleMat = new THREE.MeshStandardNodeMaterial({roughness:.69});
 const n=mx_noise_float(positionLocal.mul(2.8)).mul(.5).add(.5);
 let col=mix(vec3(.028,.065,.077),vec3(.21,.26,.26),smoothstep(-.5,.15,positionLocal.y.negate()));
 col=col.mul(n.mul(.45).add(.7));
 const moss=smoothstep(-.32,.38,mx_noise_float(positionWorld.mul(1.1))).mul(smoothstep(-.25,.72,normalWorldGeometry.y));
 const surface=texture(mossScan,positionWorld.xz.add(positionWorld.xy.mul(.3)).mul(.44)).rgb;
 whaleMat.colorNode=mix(col.mul(luminance(surface).mul(1.8).add(.76)),surface.mul(vec3(.5,.79,.26)),moss);
 const whale=(scale,pos,rot)=>{
  const group=new THREE.Group();group.position.set(...pos);group.rotation.set(...rot);group.scale.setScalar(scale);scene.add(group);
  const profile=[[ -5.7,.2],[-5.4,.66],[-4.3,1.25],[-3,1.42],[-1.5,1.23],[0,.95],[1.6,.63],[3.2,.34],[4.5,.13],[5,.2]];
  const contour=new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3(p[0],p[1],0)));
  const positions=[],indices=[]; const N=96,R=48;
  for(let i=0;i<=N;i++) {
   const cp=contour.getPoint(i/N),x=cp.x,r=cp.y;
   for(let k=0;k<=R;k++){const u=k/R*Math.PI*2;positions.push(x,Math.cos(u)*r*.8+.08*Math.sin(x),Math.sin(u)*r);}
  }
  for(let i=0;i<N;i++)for(let k=0;k<R;k++){let a=i*(R+1)+k,b=a+R+1;indices.push(a,a+1,b,b,a+1,b+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  const body=new THREE.Mesh(geo,whaleMat);body.castShadow=body.receiveShadow=true;group.add(body);
  const grooveMat=new THREE.MeshStandardNodeMaterial({color:0x394e4d,roughness:.85});
  for(let k=0;k<19;k++) {
   const angle=Math.PI*.57+k/18*Math.PI*.86,points=[];
   for(let i=1;i<=42;i++){const cp=contour.getPoint(i/96);points.push(new THREE.Vector3(cp.x,Math.cos(angle)*(cp.y*.8+.012)+.08*Math.sin(cp.x),Math.sin(angle)*(cp.y+.014)));}
   const seam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),42,.014,4,false),grooveMat);group.add(seam);
  }
  // Cross sections taper in thickness and sweep aft toward the tips.
  function appendFoil(sections, side) {
   const verts=[], triangles=[], sides=20;
   for(const [x,y,z,chord,thickness] of sections){
    for(let k=0;k<sides;k++){
     const angle=k/sides*Math.PI*2;
     verts.push(x+chord*Math.cos(angle),y+thickness*Math.sin(angle),side*z);
    }
   }
   for(let row=1;row<sections.length;row++)for(let k=0;k<sides;k++){
    const a=(row-1)*sides+k,b=(row-1)*sides+(k+1)%sides;
    if(side>0) triangles.push(a,b,a+sides,b,b+sides,a+sides);
    else triangles.push(a,a+sides,b,b,a+sides,b+sides);
   }
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
   g.setIndex(triangles);g.computeVertexNormals();
   const fin=new THREE.Mesh(g,whaleMat);fin.castShadow=fin.receiveShadow=true;group.add(fin);
  }
  for(const side of [-1,1]){
   appendFoil([[-2.9,-.3,.65,.58,.22],[-2.65,-.45,1.2,.57,.19],[-2.25,-.68,1.85,.48,.14],[-1.71,-.83,2.45,.38,.1],[-1.2,-.90,2.9,.21,.07],[-.87,-.88,3.2,.015,.01]],side);
   appendFoil([[4.65,.1,0,.4,.14],[4.8,.1,.55,.59,.12],[4.98,.02,1.12,.5,.1],[5.23,-.12,1.68,.39,.072],[5.66,-.28,2.14,.19,.04],[5.96,-.32,2.42,.015,.01]],side);
  }  // Small eyes and jaw seam avoid a featureless body.
  const eyeMat=new THREE.MeshStandardNodeMaterial({color:0x101816,roughness:.23});
  for(let s of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),eyeMat);e.position.set(-4.35,.12,s*.96);group.add(e);}
  group.updateMatrixWorld(true);
  for(let x of [-3,2.4]){let p=new THREE.Vector3(x,.65,0);group.localToWorld(p);tube([[p.x,p.y,p.z],[p.x,13.5,p.z]],.012);}
  return group;
 };
 whale(1.48,[-.3,6.45,-.7],[.05,-.24,.32]);
 whale(.64,[3.2,4.5,-7.6],[.03,-.3,.25]);
 whale(.77,[-10.5,10.6,5],[.05,.4,.03]);
 // Shoals suspended on almost invisible wires.
 const fishMat=new THREE.MeshStandardNodeMaterial({color:0x93a8a7,metalness:.25,roughness:.65});
 const fish=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,5),fishMat,250);
 for(let i=0;i<250;i++) {
  const t=rng(), lane=i%3, x=-12+t*24, y=6+lane*1.5+Math.sin(t*5+lane)*1.3+rng()*.72, z=-12+lane*3+Math.cos(t*4)*2+rng()*2,s=.035+rng()*.075;
  fish.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-.3,.1)),new THREE.Vector3(s*2.7,s*.7,s)));
  if(i%6===0)tube([[x,y,z],[x,13.5,z]],.004);
 }scene.add(fish);
 const ivy={leaves:[],stems:[]};
 for(let i=0;i<260;i++) {
  const side=rng()<.5?-1:1,z=-16+rng()*28;
  hangStrand(new THREE.Vector3(side*(10.1+rng()*1.4),7.9,z),.7+rng()*6.8,rng,ivy,{leafScale:.17,density:1.3});
 }
 for(let i=0;i<70;i++)hangStrand(new THREE.Vector3(-11+rng()*22,13.4,-14+Math.floor(rng()*5)*5),.8+rng()*3,rng,ivy,{leafScale:.14});
 scene.add(buildFoliage(ivy,{bright:1.2,dryRatio:.18}));
 const ids=['fern_02','grass_medium_01','wooden_crate_01','painted_wooden_bench'];
 const models=await Promise.all(ids.map(loadModel)),batch=new InstanceBatch();
 const put=(id,x,z,s=1)=>{const model=models[ids.indexOf(id)];for(const key of Object.keys(model.parts))batch.add(model.parts,key,trs(x,.02,z,rng()*6.28,s));};
 for(let i=0;i<185;i++){let x=(rng()-.5)*23,z=-15+rng()*29;if(Math.abs(x)<3&&z>2)continue;put(i%6?'grass_medium_01':'fern_02',x,z,1.8+rng()*1.5);}
 for(let i=0;i<8;i++)put('wooden_crate_01',-4+rng()*7,-12+rng()*3,.8);
 put('painted_wooden_bench',-6,-9,1.1);
 scene.add(batch.build());
 // Fallen ochre leaves, scattered masonry, small wet floor patches.
 const leafMat=new THREE.MeshStandardNodeMaterial({color:0x8c7430,roughness:.87,side:THREE.DoubleSide});
 const leaves=new THREE.InstancedMesh(new THREE.CircleGeometry(.055,5),leafMat,1800);
 for(let i=0;i<1800;i++)leaves.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3((rng()-.5)*23,.008+rng()*.015,-16+rng()*30),new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,rng()*.3,rng()*6.28)),new THREE.Vector3(1,1.8,1)));
 scene.add(leaves);
 const sun=new THREE.DirectionalLight(0xffe6b8,5);sun.position.set(-4,22,3);sun.target.position.set(2,0,-6);scene.add(sun,sun.target);
 sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-20,right:20,top:20,bottom:-20,near:1,far:70});sun.shadow.bias=-.0003;sun.shadow.normalBias=.04;sun.layers.enable(VOLUME_LAYER);
 scene.add(new THREE.HemisphereLight(0x91b9c5,0x292e1b,.22));
 const fog=createVolumeFog(new THREE.BoxGeometry(26,14,32),{density:.008,steps:10});fog.position.set(0,7,-2);scene.add(fog);
 // Merge static meshes sharing a material after their world transforms are final.
 scene.updateMatrixWorld(true);
 const batches=new Map();
 scene.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o!==fog&&o.material!==whaleMat&&!Array.isArray(o.material)){let list=batches.get(o.material);if(!list)batches.set(o.material,list=[]);list.push(o);}});
 for(const [material,items] of batches){if(items.length<3)continue;const geos=items.map(o=>{const g=o.geometry.clone().applyMatrix4(o.matrixWorld);const h=g.index?g.toNonIndexed():g;for(const key of Object.keys(h.attributes))if(!['position','normal','uv'].includes(key))h.deleteAttribute(key);if(!h.attributes.uv)h.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(h.attributes.position.count*2),2));return h;});const merged=mergeGeometries(geos);if(merged){const m=new THREE.Mesh(merged,material);m.castShadow=m.receiveShadow=true;items.forEach(o=>o.removeFromParent());scene.add(m);}geos.forEach(g=>g.dispose());}
 return {sun,pipelineOptions:{volumes:[fog],volumeIntensity:.65,volumeResolution:.5,bloomThreshold:1.1}};
}




