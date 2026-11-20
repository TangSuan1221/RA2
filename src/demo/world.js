import {tunnelOcclusion} from './tunnel-lighting.js';
import {pioneerBounds,pioneerFloor} from './pioneer-floor.js';
import {surfaceWeather} from './surface-weather.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {boatTurn,edges,layout,roadWidth,railHeight,offset} from './network.js';
export function world(scene){
 const load=new T.TextureLoader();
 function surf(id,res,size){
  const map=load.load('/assets/textures/'+id+'/'+id+'_diff_'+res+'.jpg'), normalMap=load.load('/assets/textures/'+id+'/'+id+'_nor_gl_'+res+'.jpg');
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(1/size,1/size);t.anisotropy=4}
  map.colorSpace=T.SRGBColorSpace;return new T.MeshStandardMaterial({map,normalMap,normalScale:new T.Vector2(.55,.55),roughness:.78,color:0xaaaa91});
 }
 function quad(a,b,width,y,geos,endY=y){
  const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=-dz/l*width/2,nz=dx/l*width/2;
  const pts=[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts.flatMap((p,i)=>[p[0],(i===1||i===2?endY:y)+((y>=0&&y<=.16)?pioneerFloor(p[0],p[1]):0),p[1]]),3));g.setAttribute('uv',new T.Float32BufferAttribute(pts.flat(),2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();geos.push(g)
 }
 function mesh(geo,mat){const o=new T.Mesh(geo,mat);o.receiveShadow=true;scene.add(o);return o}
 const ground=surf('brown_mud_leaves_01','1k',5),asphalt=surf('asphalt_02','2k',6);
 const setWet=surfaceWeather(asphalt,ground);tunnelOcclusion(asphalt);
 const {left,right,north,south}=pioneerBounds,gs=[];
 const oldFloor=new T.PlaneGeometry(right-left,south-north,right-left,south-north).rotateX(-Math.PI/2).translate((left+right)/2,0,(north+south)/2);
 const fp=oldFloor.attributes.position,fu=oldFloor.attributes.uv;
 for(let i=0;i<fp.count;i++){const x=fp.getX(i),z=fp.getZ(i);fp.setY(i,pioneerFloor(x,z)-.04);fu.setXY(i,x,z);}
 oldFloor.computeVertexNormals();
 const flagstone=surf('concrete_tiles','2k',3.6);flagstone.color.set(0xa1a49b);flagstone.roughness=.77;flagstone.envMapIntensity=.28;
 const dampness=load.load('/assets/textures/brown_mud_leaves_01/brown_mud_leaves_01_diff_1k.jpg');dampness.wrapS=dampness.wrapT=T.RepeatWrapping;
 flagstone.onBeforeCompile=shader=>{
  shader.uniforms.dampness={value:dampness};shader.vertexShader='varying vec3 vOldStreet;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvOldStreet=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='uniform sampler2D dampness;varying vec3 vOldStreet;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
  #include <map_fragment>
  vec2 uvw=vOldStreet.xz;vec3 soil=texture2D(dampness,uvw*.14).rgb;
  float macro=texture2D(dampness,uvw*.029).g;
  float shade=(1.-smoothstep(.4,5.8,min(abs(uvw.x-426.),abs(uvw.x-438.))))*smoothstep(1299.,1304.,uvw.y)*(1.-smoothstep(1328.,1333.,uvw.y));
  float wetPatch=smoothstep(.26,.38,macro+.26*soil.g)*smoothstep(.1,2.2,-vOldStreet.y);
  diffuseColor.rgb=mix(diffuseColor.rgb,soil*vec3(.34,.37,.25),clamp(shade*.69+wetPatch*.30,0.,.78));
  float awning=1.-smoothstep(.5,4.7,abs(mod(uvw.y-1301.7+4.75,9.5)-4.75));diffuseColor.rgb*=(1.-.51*shade)*(1.-.45*wetPatch)*(1.-.42*awning);
  `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.37,wetPatch);');
 };mesh(oldFloor,flagstone); for(const [x,z,w,h] of [[230,520,110,95],[372,520,1828,95],[150,615,190,48],[372,615,1828,37],[404,652,1796,11],[150,663,2050,230],[224,893,1976,33],[150,926,2050,25],[100,951,2100,north-951],[100,south,2100,2220-south],[100,north,left-100,south-north],[right,north,2200-right,south-north],[0,-50,2200,490]])quad([x+w/2,z],[x+w/2,z+h],w,-.04,gs);
 mesh(mergeGeometries(gs),ground);
 const oceanShape=new T.Shape();oceanShape.moveTo(-4000,-4000);oceanShape.lineTo(4000,-4000);oceanShape.lineTo(4000,4000);oceanShape.lineTo(-4000,4000);oceanShape.closePath();
 const dry=new T.Path();dry.moveTo(left-1000,1000-north);dry.lineTo(right-1000,1000-north);dry.lineTo(right-1000,1000-south);dry.lineTo(left-1000,1000-south);dry.closePath();oceanShape.holes.push(dry);
 const water=mesh(new T.ShapeGeometry(oceanShape),new T.MeshStandardMaterial({color:0x48656b,metalness:.48,roughness:.27}));water.material.color.set(0x1e353a);water.material.metalness=.14;water.material.roughness=.46;water.material.envMapIntensity=.40;water.material.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 seaXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nseaXZ=position.xy;');shader.fragmentShader='varying vec2 seaXZ;\nfloat quayHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*4375.54);}\nfloat quayNoise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);return mix(mix(quayHash(i),quayHash(i+vec2(1.,0.)),f.x),mix(quayHash(i+vec2(0.,1.)),quayHash(i+1.),f.x),f.y);}\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nvec2 warp=vec2(quayNoise(seaXZ*.38),quayNoise(seaXZ*.29+13.));float wave=quayNoise(seaXZ*vec2(2.9,.62)+warp*2.)-.5;normal=normalize(normal+vec3(wave*.13,(quayNoise(seaXZ*.83+warp)-.5)*.09,0.));')};water.rotation.x=-Math.PI/2;water.position.set(1000,-.45,1000);
 const pavement=[],stripes=[],shoulder=[],rail=[];
 const leaves=[],debris=new T.Group(),flood=new T.Group();
 scene.add(debris,flood);
 const steel=new T.MeshStandardMaterial({color:0x555e59,metalness:.45,roughness:.65});
 const chalk=new T.MeshStandardMaterial({color:0x8c805d,roughness:.9});
 const [buoyX,buoyZ]=layout.nodes[boatTurn];
 const buoy=mesh(new T.ConeGeometry(.6,1.65,12),new T.MeshStandardMaterial({color:0xbb5b39,roughness:.65}));
 buoy.position.set(buoyX,.3,buoyZ-2.8);
 const structures=[],sleepers=[];
 for(const e of edges){
  if(e.state==='closed'||e.state==='boat')continue;
  const w=roadWidth(e),dx=(e.B[0]-e.A[0])/e.length,dz=(e.B[1]-e.A[1])/e.length;
  const point=(along,across)=>[e.A[0]+dx*along+dz*across,e.A[1]+dz*along-dx*across];
  if(e.state==='bridge'){
   const span=e.length/2;
   for(const [hinge,sign] of [[e.A,1],[e.B,-1]]){
    const leaf=new T.Group();
    leaf.position.set(hinge[0],0,hinge[1]);
    leaf.rotation.order='YXZ';
    leaf.rotation.y=Math.atan2(dx*sign,dz*sign);
    const slab=new T.Mesh(new T.BoxGeometry(w+1.4,.85,span),steel);
    slab.position.set(0,-.37,span/2);leaf.add(slab);
    const surface=[];quad([0,0],[0,span],w,.08,surface);
    leaf.add(new T.Mesh(surface[0],asphalt));
    for(const side of [-1,1]){
     const guard=new T.Mesh(new T.BoxGeometry(.38,.75,span),steel);
     guard.position.set(side*w/2,.7,span/2);leaf.add(guard);
    }
    scene.add(leaf);leaves.push(leaf);
   }
   continue;
  }
  if(e.state==='clear'){
   const [x,z]=point(e.length/2,0);
   debris.position.set(x,0,z);debris.rotation.y=Math.atan2(dx,dz);
   for(const [along,tilt] of [[-1,.06],[1,-.08]]){
    const barrier=new T.Mesh(new T.BoxGeometry(w,1.3,1.1),chalk);
    barrier.position.set(0,.65,along);barrier.rotation.y=tilt;debris.add(barrier);
   }
  }
  if(e.state==='tide'){
   const surface=[];quad(e.A,e.B,w+12,.32,surface);
   const wet=new T.MeshStandardMaterial({color:0x528083,metalness:.4,roughness:.19,transparent:true,opacity:.87});
   flood.add(new T.Mesh(surface[0],wet));
  }
  if(e.state==='rail'){
   const ramp=Math.min(64,e.length/3),breaks=[0,ramp,e.length-ramp,e.length];
   for(let i=1;i<breaks.length;i++){
    const s=breaks[i-1],t=breaks[i],h=railHeight(e,s),k=railHeight(e,t);
    quad(point(s,0),point(t,0),w+.38,h+.09,shoulder,k+.09);
    for(const side of [-1,1]){
     quad(point(s,side*.32),point(t,side*.32),.065,h+.135,rail,k+.135);
     const a=point(s,side*(w/2+.14)),b=point(t,side*(w/2+.14));
     const tail=new T.Vector3(a[0],h-.16,a[1]),head=new T.Vector3(b[0],k-.16,b[1]),direction=head.clone().sub(tail),mid=tail.addScaledVector(direction,.5);
     const girder=new T.BoxGeometry(.18,.48,direction.length());
     girder.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),direction.normalize()));
     structures.push(girder.translate(mid.x,mid.y,mid.z));
    }
   }
   for(let s=.8;s<e.length;s+=1.5){
    const y=railHeight(e,s);
    quad(point(s,-.53),point(s,.53),.16,y+.115,sleepers);
   }
   for(let s=13;s<e.length-9;s+=17){
    const [x,z]=point(s,0),h=railHeight(e,s);
    if(edges.some(other=>other!==e&&other.state!=='closed'&&offset(x,z,other).d<roadWidth(other)/2+1))continue;
    structures.push(new T.BoxGeometry(.65,h,.75).rotateY(Math.atan2(dx,dz)).translate(x,h/2-.28,z));
   }
   continue;
  }  if(e.state==='tunnel'&&e.a.includes('/tunnel/')&&e.b.includes('/tunnel/')){
   // The open forebay is enclosed by the district's wide approach arch.
   const closedLength=e.length-12,midpoint=12+closedLength/2;
   const [x,z]=point(midpoint,0),angle=Math.atan2(dx,dz);
   for(const side of [-1,1]){
    const [wx,wz]=point(midpoint,side*(w/2+.3));
    structures.push(new T.BoxGeometry(.6,6,closedLength).rotateY(angle).translate(wx,3,wz));
   }
   structures.push(new T.BoxGeometry(w+1.2,.5,closedLength).rotateY(angle).translate(x,6.25,z));
  }
  const oldStreet=e.a==='430,1330'||e.b==='430,1330';
  const step=oldStreet?2:e.length;
  for(let s=0;s<e.length;s+=step){
   const a=point(s,0),b=point(Math.min(s+step,e.length),0);
   const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
   if(oldStreet&&mx>left&&mx<right&&mz>north&&mz<south)continue;
   quad(a,b,w,.08,pavement);quad(a,b,w+1.8,.035,shoulder);
  }
  if(w>=12 && e.b!=="275,1810")for(let s=6;s<e.length-5;s+=14)quad([e.A[0]+dx*s,e.A[1]+dz*s],[e.A[0]+dx*(s+4),e.A[1]+dz*(s+4)],.14,.10,stripes);
  if(e.A[1]===440&&e.B[1]===520)for(const side of [-1,1])quad([e.A[0]+side*w/2,440],[e.B[0]+side*w/2,520],.5,1,rail);
  if(e.gap===1.6||e.gap===3){
   for(const k of [-1,1]){const len=(w-e.gap)/2;const o=mesh(new T.BoxGeometry(len,1,1.15),new T.MeshStandardMaterial({color:0x807761}));const m=(e.gap/2+len/2)*k;o.position.set((e.A[0]+e.B[0])/2-dz*m,.5,(e.A[1]+e.B[1])/2+dx*m);o.rotation.y=Math.atan2(dx,dz)}
  }
 }
 mesh(mergeGeometries(pavement),asphalt);mesh(mergeGeometries(shoulder),ground);mesh(mergeGeometries(stripes),chalk);mesh(mergeGeometries(rail),chalk);
 if(structures.length){const structureMaterial=new T.MeshStandardMaterial({color:0x77796c,roughness:.95});tunnelOcclusion(structureMaterial);mesh(mergeGeometries(structures),structureMaterial)}
 if(sleepers.length)mesh(mergeGeometries(sleepers),new T.MeshStandardMaterial({color:0x594832,roughness:.96}));
 function syncState(state){
  for(const leaf of leaves)leaf.rotation.x=state.bridge?-Math.PI*.38:0;
  debris.visible=!state.clear;
  flood.visible=!!state.tide;
 }
 syncState({});
 return {setWet,asphalt,water,syncState}
}





