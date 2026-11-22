import {placed} from '../world/placements/read.js';
import {cellarWater,cellarSilt,greenhouseGlass,greenhouseLeaves,oxidizedTowerGlass,tidalTimber} from './waterfront-materials.js';
import {southDistrict} from './south-district.js';
import {northLandmarks,northSurfaces} from './north-landmarks.js';
import {waterfrontScenes} from './waterfront-scenes.js';
import {corridorSidewalks} from './corridor-sidewalks.js';
import {cellarWater as standingWater} from './waterfront-materials.js';
import {addVerges} from './verges.js';
import {addCityBlocks} from './city-blocks.js';
import {buildStation as candidateStation} from './station-candidate.js';
const released = import.meta.glob('./released/station.js',{eager:true});
import {pioneerFloor} from './pioneer-floor.js';
import {edges as drivableLayout} from './network.js';
import {weatheredWindows} from './windows.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Reflector} from 'three/addons/objects/Reflector.js';

const base='/assets/';
const sizes={stationBrick:['red_brick_03',2.4],bayFloor:['garage_floor',1.9,'2k.webp'],apron:['damaged_concrete_floor',4.5,'2k.webp'],forecourt:['brushed_concrete',5],layers:['concrete_layers_02',3.6],brick:['red_brick_03',3],wall:['worn_mossy_plasterwall',4],wood:['weathered_planks',3],roof:['worn_corrugated_iron',3],iron:['rusty_painted_metal',2],stone:['concrete_moss',4],bark:['bark_platanus',2],doors:['wood_peeling_paint_weathered',3],soil:['brown_mud_leaves_01',3]};
const hue={stationBrick:0xffd5bd,bayFloor:0xffffff,apron:0xffffff,forecourt:0xc3bcb0,layers:0xaebab4,brick:0xb9a395,wall:0xb5b6ab,wood:0xa6a897,roof:0x777b76,iron:0x898078,stone:0x9b9e91,bark:0xa69b80,doors:0x8d9983,soil:0xb0ae93,glass:0x475752,shadow:0x202822,trim:0x8a8b78,red:0x953e31,leaf:0x556143,light:0xe0b26c};

const atlasCache=new Map();
const loader=new T.TextureLoader();
const v3=(x,y,z)=>new T.Vector3(x,y,z);
const sec=180;
function texture(path,srgb=false){
  let t=atlasCache.get(path);
  if(!t){t=loader.load(base+path);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;if(srgb)t.colorSpace=T.SRGBColorSpace;atlasCache.set(path,t);}
  return t;
}
function material(name){
 const d=sizes[name],options={color:hue[name],roughness:name==='glass'?.19:.84,metalness:name==='glass'?.24:0};
 if(d){
  const prefix='textures/'+d[0]+'/'+d[0]+'_',file=d[2]||'1k.jpg';
  const arm=texture(prefix+'arm_'+file);
  Object.assign(options,{map:texture(prefix+'diff_'+file,true),normalMap:texture(prefix+'nor_gl_'+file),
   normalScale:new T.Vector2(.54,.54),aoMap:arm,aoMapIntensity:.65,
   roughnessMap:arm,roughness:1,metalnessMap:arm,metalness:1});
 }
 if(name==='light'){options.emissive=0xe0a969;options.emissiveIntensity=.05;}
 return new T.MeshStandardMaterial(options);
}
function roadDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],k=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-k*dx,z-a[1]-k*dz);
}
function hashSeed(){let state=6163;return()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);}
export async function buildEnvironment(scene,layout){
 const random=hashSeed(),group=new T.Group();group.name='Seattle reference environments';scene.add(group);
 const materials=Object.fromEntries(Object.keys(hue).map(n=>[n,material(n)])), batches=new Map(), tiles=new Map(), props=new Map(), owned=new Set(), buildings=[], interact=layout.sites||[];
 weatheredWindows(materials.glass);northSurfaces(materials,texture);
 materials.crosswalk=new T.MeshStandardMaterial({color:0xd4cdbb,roughness:.91,roughnessMap:texture('textures/cracked_concrete/cracked_concrete_arm_2k.jpg')});
 materials.shingle=new T.MeshStandardMaterial({color:0xe5ddce,map:texture('evac-art/home-cedar.webp',true),roughness:.92});
 materials.canopy=new T.MeshStandardMaterial({map:texture('evac-art/ash-branch.webp',true),color:0x8b916e,alphaTest:.31,roughness:.8,side:T.DoubleSide});
 
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;
 const contact=contactCanvas.getContext('2d'),shade=contact.createRadialGradient(32,32,3,32,32,32);shade.addColorStop(0,'rgba(32,27,19,.53)');shade.addColorStop(.48,'rgba(35,30,22,.34)');shade.addColorStop(1,'rgba(35,30,22,0)');contact.fillStyle=shade;contact.fillRect(0,0,64,64);
 const contactTexture=new T.CanvasTexture(contactCanvas);contactTexture.colorSpace=T.SRGBColorSpace;owned.add(contactTexture);
 materials.shadowPatch=new T.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false});
 materials.water=new T.MeshStandardMaterial({color:0x253d3f,roughness:.22,metalness:.42,normalMap:texture('textures/road_damaged/road_damaged_nor_gl_2k.jpg'),normalScale:new T.Vector2(.28,.18)});
 materials.glazing=new T.MeshStandardMaterial({color:0x58716b,metalness:.18,roughness:.28,transparent:true,opacity:.29,side:T.DoubleSide,depthWrite:false});
 // Weathering changes at the height of splashing rain. Vertical bleeds follow gravity.
 for(const key of ['shingle','brick','stationBrick','wall','roof','wood','iron','stone','doors']){
  const m=materials[key];
  m.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 vRainWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader='varying vec3 vRainWorld;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    vec3 rp=vRainWorld;float t=rp.x*.83+rp.z*.61;
    float streak=.5+.5*sin(t*11.+sin(t*3.2)*2.+sin(t*.87+rp.y*.09));
    float clouds=.5+.5*sin(rp.x*.74+rp.z*.86+sin(rp.x*.29+rp.z*.31)*2.+rp.y*.24);
    float rainMark=smoothstep(.61,.96,streak)*smoothstep(.17,.90,clouds);
    float baseDamp=(1.-smoothstep(.04,1.8+.8*clouds,rp.y))*(.42+.58*clouds);
    diffuseColor.rgb*=1.-.23*rainMark-.18*clouds-.23*baseDamp;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.65,.81,.52),baseDamp*.78);
   `);
  };
 }
 const propsLod=[];
 const roadList=drivableLayout.filter(e=>e.state!=='closed').map(e=>[e.A,e.B,({L1:14,L2:8,L3:4,L4:2,L5:3}[e.grade]||3)]);
 const canGrow=(x,z,pad=3)=>z<438||z>523? x>104&&!roadList.some(([a,b,s])=>roadDistance(x,z,a,b)<s+pad)&&!buildings.some(b=>Math.abs(x-b[0])<b[2]/2+pad&&Math.abs(z-b[1])<b[3]/2+pad):false;
 function tile(x,z){let ix=Math.floor(x/sec),iz=Math.floor(z/sec),key=ix+','+iz,t=tiles.get(key);if(!t){t=new T.Group();t.userData.center=v3((ix+.5)*sec,0,(iz+.5)*sec);tiles.set(key,t);group.add(t);}return t;}
 function addGeo(g,mat,x,y,z,rx=0,ry=0,rz=0){
  let uv=g.attributes.uv,n=g.attributes.normal,p=g.attributes.position;
  if(mat==='glass'){
   const seed=Math.sin(x*31.7+y*8.91+z*47.3)*7919;
   g.setAttribute('roomSeed',new T.Float32BufferAttribute(new Float32Array(p.count).fill(seed-Math.floor(seed)),1));
  }
  if((sizes[mat]||mat==='shingle')&&uv){let s=mat==='shingle'?2.65:sizes[mat][1];for(let i=0;i<uv.count;i++){let a=Math.abs(n.getX(i)),b=Math.abs(n.getY(i)),c=Math.abs(n.getZ(i));uv.setXY(i,(a>c&&a>b?p.getZ(i):p.getX(i))/s,(b>=a&&b>=c?p.getZ(i):p.getY(i))/s);}}
  g.applyMatrix4(new T.Matrix4().compose(v3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),v3(1,1,1)));
  const host=tile(x,z),k=host.id+':'+mat;if(!batches.has(k))batches.set(k,{host,mat,list:[]});batches.get(k).list.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();
 }
 function box(x,y,z,w,h,d,m='stone',rx=0,ry=0,rz=0){addGeo(new T.BoxGeometry(w,h,d),m,x,y,z,rx,ry,rz);}
 function cylinder(x,y,z,top,baseR,h,m,n=12){addGeo(new T.CylinderGeometry(top,baseR,h,n),m,x,y,z);}
 function beam(x1,y1,z1,x2,y2,z2,w,m='iron',d=w){
  const a=v3(x1,y1,z1),b=v3(x2,y2,z2),mid=a.clone().add(b).multiplyScalar(.5);
  let e=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(v3(0,1,0),b.sub(a).normalize()));box(mid.x,mid.y,mid.z,w,Math.hypot(x2-x1,y2-y1,z2-z1),d,m,e.x,e.y,e.z);
 }
 function prop(id,x,y,z,scale=1,angle=0){
  if((id==='shrub_03'||id==='fern_02')&&x>402&&x<448&&z>1205.5&&z<1222)return;
  const cx=Math.floor(x/24),cz=Math.floor(z/24),k=id+':'+cx+','+cz;if(!props.has(k))props.set(k,{id,host:tile(x,z),cx:cx*24+12,cz:cz*24+12,items:[]});props.get(k).items.push([x,y,z,scale,angle]);
 }
 function sign(x,y,z,text,w,h,color='#c4bfa0'){
  const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,96);ctx.strokeStyle='#555649';ctx.lineWidth=5;ctx.strokeRect(7,7,498,82);
  ctx.fillStyle='#394137';ctx.font='bold 50px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,49,476);
  for(let i=0;i<380;i++){ctx.fillStyle=random()>.5?'rgba(34,38,29,.2)':'rgba(214,209,176,.3)';ctx.fillRect(random()*512,random()*96,1+random()*6,1+random()*2);}
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;owned.add(tex);const m=new T.MeshStandardMaterial({map:tex,roughness:.85,side:T.DoubleSide});owned.add(m);let mesh=new T.Mesh(new T.PlaneGeometry(w,h),m);mesh.position.set(x,y,z);tile(x,z).add(mesh);
 }
 function windows(x,y,z,w,h,orient=0){
  const dx=Math.cos(orient),dz=-Math.sin(orient);function panel(u,v,a,b,c,m,offset){box(x+u*dx+Math.sin(orient)*offset,y+v,z+u*dz+Math.cos(orient)*offset,a,b,c,m,0,orient);}
  panel(0,0,w+.19,h+.20,.18,'trim',0);panel(0,0,w,h,.20,'glass',.03);panel(0,0,.07,h,.25,'wood',.04);panel(0,.13,w,.07,.25,'wood',.04);panel(0,-h/2-.14,w+.45,.17,.34,'stone',.08);
  if(random()<.37){const curtain=w*(.14+random()*.23);panel(-w/2+curtain*.5,0,curtain,h*.96,.012,'trim',.135);}
  if(random()<.18)panel(0,.22,w*.96,.36,.26,'wood',.13);
 }
 function block(x,z,w,d,f,mat='brick',features=true){
  buildings.push([x,z,w,d]);let h=f*3.7;box(x,h*.5,z,w,h,d,mat);box(x,h+.16,z,w+.55,.34,d+.55,'stone');box(x,.43,z,w+.23,.78,d+.23,'stone');
  for(let side=0;side<4;side++){
   const angle=side*Math.PI/2,span=side%2?d:w,normal=side%2?w/2:d/2,a=Math.sin(angle),b=Math.cos(angle),ox=x+a*(normal+.10),oz=z+b*(normal+.10);
   for(let floor=0;floor<f;floor++){let count=Math.max(1,Math.floor(span/3.6));for(let col=0;col<count;col++){let u=(col+.5)*span/count-span/2;windows(ox+b*u,2.3+3.7*floor,oz-a*u,Math.min(1.7,span/count*.53),1.85,angle);}}
  }
  if(features){box(x+w*.20,h+.7,z-d*.09,1.5,1.05,1.8,'iron');cylinder(x-w*.24,h+1.05,z, .22,.26,2.1,'iron');}
 }
 function lamp(x,z,h=7){
  cylinder(x,h/2,z,.09,.17,h,'iron');beam(x,h-.5,z,x+1.2,h,z,.1);box(x+1.22,h,z,.75,.14,.38,'iron');box(x+1.22,h-.09,z,.60,.035,.32,'light');
 }
 function tree(x,z,h){
  // Keep the engine apron and its overhead clearance free of volunteer trees.
  if(x>402&&x<455&&z>1204&&z<1233){z=1170-(z-1204);x-=12;}
  cylinder(x,h*.23,z,h*.014,h*.028,h*.46,'bark',7);
  for(let j=0;j<10;j++){
   let a=j*2.40+random()*.4,r=h*(.12+random()*.17),tx=x+Math.sin(a)*r,tz=z+Math.cos(a)*r,top=h*(.54+random()*.26);
   beam(x,h*(.25+random()*.16),z,tx,top,tz,h*.017,'bark');
   for(let k=0;k<8;k++){
    let ph=k*2.4+random(),spread=h*(.04+random()*.12),px=tx+Math.sin(ph)*spread,pz=tz+Math.cos(ph)*spread,py=top+h*(random()*.21-.03),w=h*(.26+random()*.14);
    addGeo(new T.PlaneGeometry(w,w*1.09),'canopy',px,py,pz,(random()-.5)*1.2,ph,(random()-.5)*1.15);
   }
  }
 }
 function home(x,z,f=1){
  block(x,z,8.6,10.4,f,'shingle',false);const eave=f*3.7+.15,slope=.53;
  for(let s of [-1,1])box(x+s*2.17,eave+1.2,z,5.37,.25,11.7,'roof',0,0,-s*slope);
  const gable=new T.Shape();gable.moveTo(-4.3,0);gable.lineTo(4.3,0);gable.lineTo(0,2.48);gable.closePath();
  for(const side of [-1,1])addGeo(new T.ShapeGeometry(gable),'shingle',x,eave,z+side*5.21,0,side<0?Math.PI:0);
  box(x+2.3,eave+1.8,z-2,.67,2.3,.65,'brick');box(x,2.32,z+5.29,1.14,2.45,.16,'doors');
  box(x,.23,z+6.25,4,.45,2.1,'wood');box(x,3.12,z+6.22,4.3,.22,2.15,'roof',.1);
  for(let s of [-1,1])box(x+s*1.75,1.7,z+7.05,.14,3.0,.14,'wood');
  for(let k=0;k<3;k++)box(x,.09+k*.1,z+8.3-k*.37,1.65,.18+k*.16,.40,'stone');
  prop('barrel_03',x-2.9,.03,z+5.7,1.0);if(x%3!==0)prop('painted_wooden_chair_01',x+.95,.47,z+6.15,.93,(x%5-2)*.19);
 }
 // C3: an inhabited-looking siding house, car lane and allotments, based on ref 08.
 home(282.4,1798.8);home(301,1794,2);home(294,1825);

 for(let i=0;i<10;i++){let xx=248+i*2.1;box(xx,.84,1802,.14,1.7,.14,'wood');if(i<9)for(let yy of [.45,1.20])box(xx+1.05,yy,1802,2.1,.15,.10,'wood');}
 for(let i=0;i<4;i++){box(261,.12,1793+i*1.65,8,.26,1.22,'soil');for(let j=0;j<8;j++)prop('fern_02',257.7+j,.2,1793+i*1.65,.48,random()*6);}
 // The opening shot looks west down a gravel lane; framing and wet wheel ruts come from ref 08.
 const laneMap=texture('evac-art/garden-lane.jpg',true);const laneMat=new T.MeshPhysicalMaterial({clearcoat:1,clearcoatRoughness:.055,clearcoatMap:texture('evac-art/wheel-ruts.jpg'),roughnessMap:texture('evac-art/lane-roughness.jpg'),envMapIntensity:1.5,map:laneMap,alphaMap:texture('evac-art/lane-mask.jpg'),transparent:true,depthWrite:false,roughness:.68,color:0xbcb4a4});
 const gravel=texture('evac-art/home-gravel.webp',true);
 laneMat.clearcoat=.52;laneMat.envMapIntensity=.91;
 laneMat.onBeforeCompile=shader=>{
  shader.uniforms.nativeGravel={value:gravel};
  shader.fragmentShader='uniform sampler2D nativeGravel;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
   #include <map_fragment>
   vec2 meterUv=vMapUv*vec2(53.8,3.45);
   vec3 chips=texture2D(nativeGravel,meterUv*1.25+vec2(.13,.32)).rgb;
   float crown=texture2D(nativeGravel,meterUv*.44).g;
   float brokenWater=smoothstep(.028,.17,crown+.28*chips.g);
   float detail=clamp(dot(chips,vec3(.30,.58,.12))*5.,.39,1.62);
   diffuseColor.rgb*=detail;
   float verge=smoothstep(.22,.50,abs(vMapUv.y-.5))+(.40*(1.-smoothstep(.02,.10,abs(vMapUv.y-.50))));
   diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.53,.95,.37),verge*.69);
  `)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.84,brokenWater*.64);')
    .replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat*=1.-brokenWater*.9;');
 };
 materials.homeGlass=new T.MeshPhysicalMaterial({map:texture('evac-art/home-window-glass.webp',true),roughness:.37,clearcoat:.28});
 owned.add(laneMat);const lane=new T.Mesh(new T.PlaneGeometry(53.8,3.45),laneMat);lane.rotation.x=-Math.PI/2;lane.position.set(263.3,.145,1810);lane.receiveShadow=true;tile(258,1810).add(lane);
 // Plank fences are irregular in height; keep both mouths of the driving lane clear.
 function palings(x0,x1,z,broken=false){
  for(let x=x0;x<x1;x+=.76){if(broken&&random()<.13)continue;let h=1.45+.27*random();box(x,h/2,z,.68,h,.13,'wood',0,0,(random()-.5)*.065);}
  for(let x=x0;x<=x1;x+=3.1)box(x,1,z+.1,.18,2.05,.2,'wood');
 }
 palings(248.9,274,1817.0,true);palings(247.5,260.5,1807.0,true);palings(249,281,1825.2,false);
 for(let bed=0;bed<3;bed++){
  const x=274+bed*2.62,z=1813.55+bed*.19;
  box(x,.29,z,2.33,.28,1.08,'soil');
  for(const side of [-1,1]){
   box(x,.29,z+side*.60,2.55,.48,.095,'wood');
   box(x+side*1.23,.29,z,.10,.48,1.29,'wood');
  }
  for(let i=0;i<5;i++){
   const xx=x-.97+i*.45,zz=z+Math.sin(i*2.7)*.21;
   prop('fern_02',xx,.42,zz,2.05+i%2*.6,i*.84+bed);
   if(i%2===0)beam(xx,.37,z+.39,xx+.08,1.52,z+.25,.036,'wood');
  }
  beam(x-1.1,1.08,z+.36,x+1.05,.97,z+.36,.027,'wood');
 }
 for(let i=0;i<9;i++){let x=249.2+i*3.1;let z=1812.62;box(x,.19,z,2.8,.36,1.55,'wood');box(x,.39,z,2.57,.09,1.35,'soil');for(let k=0;k<5;k++)prop('fern_02',x-1+random()*2,.43,z-.55+random()*1.1,.75+random()*.8,random()*6);}
 for(let x of [251,258,266,274,278]){prop('shrub_03',x,.1,1804.2,2.6+random()*2,random()*6);prop('fern_02',x,.05,1815.7,1.4+random(),random()*6);}
 const shedX=266.4,shedZ=1822.9;
 box(shedX,2.14,shedZ,14.5,4.28,8.3,'firePlaster');
 for(const side of [-1,1])
  box(shedX,4.62,shedZ+side*2.12,15.16,.18,4.56,'roof',side*.16);
 for(let bay=0;bay<4;bay++){
  const xx=shedX-5.5+bay*3.45;
  box(xx,2.42,shedZ-4.23,1.98,1.34,.16,'wood');
  box(xx,2.42,shedZ-4.33,1.82,1.17,.09,'glass');
  box(xx,2.42,shedZ-4.40,.065,1.17,.07,'wood');
  box(xx-1.52,2.16,shedZ-4.19,.11,4.24,.14,'trim');
 }
 block(215,1818,10,7,1,'wall');sign(215,3.05,1821.68,'NORTHSIDE CARE',6.6,.63);
 // Suburban depth: door, gutter, downspout, edge beams and patched windows at real scales.
 for(let [x,z] of [[282.4,1798.8]]){
  box(x,3.9,z+5.26,8.6,.10,.14,'trim');cylinder(x+3.94,2.05,z+5.37,.07,.07,3.7,'trim');
  box(x-1.35,1.3,z+5.44,1.05,.90,.10,'doors');prop('barrel_03',x+3.3,0,z+5.85,.86,-.3);
  for(let k=0;k<4;k++)box(x+2.35+k*.18,.81,z+5.56,.045,1.52,.06,'iron',0,0,-.09+random()*.2);
 }
 for(let x of [209,247,309]){cylinder(x,4.3,1819,.10,.17,8.6,'bark');box(x,7.83,1819,.19,.18,1.8,'wood');}
 for(let z of [1818.5,1819.1]){for(let [a,b] of [[209,247],[247,309]]){beam(a,7.93,z,(a+b)*.5,7.5,z,.035,'iron');beam((a+b)*.5,7.5,z,b,7.93,z,.035,'iron');}}
 for(let [x,z,h] of [[205,1806,13],[219,1794,10],[228,1828,11],[259,1835,12],[274,1786,10],[291,1819,9],[199,1822,12],[217,1775,15]])tree(x,z,h);
 // C2: old brick firehouse, an apparatus floor with twin shuttered bays, working tower.
 // C1 garrison: keep gates open to the depot and the hike out.
 block(464,566,34,13,1);block(408,574,15,12,1);
 block(484,565,6,8,1,'wall');sign(464,2.9,572.72,'FORT LAWTON',11,1.12);
 for(let a of [[373,535,509,535],[510,535,510,652],[510,652,372,652],[372,652,372,607],[372,573,372,535]])beam(a[0],1.55,a[1],a[2],1.55,a[3],3,'stone',1.4);
 

 for(let u=0;u<16;u++){let xx=391+(u%8)*13,zz=539+Math.floor(u/8)*98;if(canGrow(xx,zz,5))tree(xx,zz,7+random()*6);}
 
 for(let k=0;k<7;k++){let xx=433+k*5.1;box(xx,.10,579,.13,.04,5,'trim');}
 for(let i=0;i<4;i++){box(409+i*3.6,.04,569,.11,.05,6,'trim');}
 // Observation tower with tapered tripod, lens-shaped saucer, and ruined forecourt (ref 09).
 for(let i=0;i<3;i++){let a=(i*2*Math.PI)/3;let xx=Math.cos(a),zz=Math.sin(a);beam(1220+xx*19,.2,816+zz*19,1220+xx*3,83,816+zz*3,2.4,'stone');beam(1220+xx*3,83,816+zz*3,1220+xx*10,116,816+zz*10,1.65,'stone');}
 cylinder(1220,58,816,1.7,2.8,116,'iron',12);cylinder(1220,117,816,15.6,9,5,'stone',36);cylinder(1220,120.5,816,14.5,15.6,2.3,'glass',36);cylinder(1220,122.8,816,3.6,17.0,2.6,'stone',36);cylinder(1220,129,816,.14,.68,12,'iron',10);
 for(let i=0;i<34;i++){let s=i%2===0?1:-1;let xx=1133+random()*175,zz=816+s*(41+random()*38);if(canGrow(xx,zz,3))prop('covered_car',xx,0,zz,.96,random()*.65);}
 // The tower plaza is a fragmented pad with planted islands and twin parking rows.
 for(let i=0;i<9;i++)for(let j=0;j<7;j++){
  const xx=1152+i*16,zz=768+j*16;
  if((i+j)%5!==0)box(xx,.002,zz,15.65,.08,15.68,'stone');
 }
 for(let i=0;i<30;i++){
  const xx=1148+(i%15)*9,zz=i<15?768:866;if(canGrow(xx,zz,3)){prop('covered_car',xx,.02,zz,.86+(i%3)*.05,.95+(i%5)*.12);}
 }
 northLandmarks({box,beam,block,windows,prop,tree,canGrow,addGeo});
 const preview = window.parent !== window && new URL(document.referrer || location.href).pathname.endsWith('/review.html') && new URLSearchParams(location.search).get('candidate')==='station';
 (preview ? candidateStation : released['./released/station.js']?.buildStation)?.({box,beam,block,canGrow,materials,texture,sizes,addGeo,prop,lamp,buildings});
 // Conservatory: thin ribbed steel half domes with missing grey-blue glazing.
 materials.greenhouseGlass=greenhouseGlass();
 materials.towerGlass=oxidizedTowerGlass();materials.dockDeck=tidalTimber(texture);sizes.dockDeck=sizes.wood;
 const broadleaves=greenhouseLeaves();tile(632,264).add(broadleaves);owned.add(broadleaves.material);
 const silt=cellarSilt(texture);tile(432,1319).add(silt);owned.add(silt.material);
 const runoff=cellarWater();tile(432,1319).add(runoff);owned.add(runoff);
 function dome(x,z,r){
  function rib(ax,ay,az,bx,by,bz,w,m){
   // Leave the overlapping domes open where the elevated visitor walk joins them.
   if(Math.min(ax,bx)<643.3&&Math.max(ax,bx)>640.7&&Math.min(ay,by)<5.55&&Math.max(az,bz)>250&&Math.min(az,bz)<278)return;
   beam(ax,ay,az,bx,by,bz,w,m);
  }
  for(let row=0;row<10;row++){let a=row*Math.PI/10;
   for(let j=0;j<14;j++){let t0=j*Math.PI/14,t1=(j+1)*Math.PI/14;rib(x+r*Math.cos(t0)*Math.cos(a),.4+r*Math.sin(t0),z+r*Math.cos(t0)*Math.sin(a),x+r*Math.cos(t1)*Math.cos(a),.4+r*Math.sin(t1),z+r*Math.cos(t1)*Math.sin(a),.16,'iron');}}
  for(let j=1;j<=5;j++){let th=j*Math.PI/12;for(let k=0;k<24;k++){let a=k*Math.PI/12,b=(k+1)*Math.PI/12;rib(x+r*Math.cos(th)*Math.cos(a),.4+r*Math.sin(th),z+r*Math.cos(th)*Math.sin(a),x+r*Math.cos(th)*Math.cos(b),.4+r*Math.sin(th),z+r*Math.cos(th)*Math.sin(b),.12,'iron');}}
  for(let j=0;j<15;j++){let a=random()*6.28,rr=random()*r*.78;prop('fern_02',x+Math.cos(a)*rr,0,z+Math.sin(a)*rr,1.7+random()*2.4,a);}
 }
 buildings.push([631,267,31,30],[654,262,27,26]);
 dome(631,267,15);dome(654,262,13);
 for(let [x,z,r] of [[631,267,15],[654,262,13]]){
  for(let i=0;i<16;i++)for(let j=0;j<5;j++){
   if(random()<.2)continue;
   const th=(j+.5)*Math.PI/10,ph=(i+.5)*Math.PI/8;
   const paneX=x-r*Math.cos(ph)*Math.sin(th),paneY=.4+r*Math.cos(th),paneZ=z+r*Math.sin(ph)*Math.sin(th);
   if(Math.abs(paneX-642)<3.8&&paneY<7.1&&paneZ>248&&paneZ<281)continue;
   addGeo(new T.SphereGeometry(r-.13,3,2,i*Math.PI/8,Math.PI/8,j*Math.PI/10,Math.PI/10),'greenhouseGlass',x,.4,z);
  }
  for(let k=0;k<22;k++){let a=random()*6.28,rr=random()*r*.8;prop('shrub_03',x+rr*Math.cos(a),0,z+rr*Math.sin(a),2+random()*4,a);}
 }
 for(let z=251;z<277;z+=4){box(642,2.75,z,1.7,.3,4,'wood');for(let side of [-1,1]){box(642+side*.8,3.33,z,.08,1.2,.08,'iron');box(642+side*.8,3.87,z,.08,.1,4,'iron');}}
 // Pioneer Square: the intact upper pavement sits over the old shop thresholds.
 block(419,1313,13.7,35,2,'brick');block(445.5,1313,13,34,2,'brick');
 const cellar=-3.65;
 for(let k=0;k<5;k++){
  const z=1304.5+k*5.15;
  box(435.25,cellar+.035,z,.48,.06,.65,'iron');
  for(let j=0;j<5;j++)box(435.25,cellar+.071,z-.235+j*.112,.39,.025,.043,'shadow');
 }
 for(let i=0;i<25;i++){
  const z=1302+random()*25,x=i%2?426.3+random()*.5:436.8+random()*.6;
  box(x,pioneerFloor(x,z)+.045,z,.08+random()*.3,.07,.09+random()*.23,i%4?'brick':'stone',.11,random()*6);
  if(i%3===0)prop('fern_02',x,pioneerFloor(x,z)+.05,z,.55+random()*.45,random()*6);
 }
 for(let k=0;k<3;k++){
  const x=428.1+k*.22;beam(x,-.29,1329,x+.09,-.64,1319,.026,'shadow');beam(x+.09,-.64,1319,x,-.28,1310,.026,'shadow');
 }
 for(const [x,z,length,mat] of [[425.48,1314,35,'brick'],[438.95,1311.7,31,'layers']]){
  box(x,cellar/2,z,.66,-cellar,length,mat);
  for(let zz=z-length/2+1;zz<z+length/2;zz+=3.6)box(x+(x<432?.40:-.40),-1.77,zz,.23,3.76,.42,mat);
 }
 // Shopfronts face east towards the public passage. Bars divide fogged transoms.
 for(const [i,zz] of [1302.8,1309.3,1315.8,1322.3,1328].entries()){
  const x=425.98;
  box(x,-1.72,zz,.17,2.6,4.6,'doors');
  for(let k=0;k<3;k++){const wz=zz-1.35+k*1.34;box(x+.12,-1.46,wz,.1,1.64,1.22,k===1?'shadow':'glass');box(x+.21,-1.25,wz,.10,.065,1.22,'trim');}
  box(x+.18,-2.4,zz,.23,.16,4.63,'wood');box(x+.45,-3.52,zz,.8,.20,4.78,'stone');
  if(i%2===0)box(x+.24,-1.08,zz+.88,.10,.33,1.78,'wood',.15);
 }
 sign(427.85,-.93,1329.7,'HOTEL',2.83,.73,'#a49c7b');
 for(const [x,z,w,d] of [[419,1313,13.7,35],[445.5,1313,13,34]])box(x,-1.83,z,w,3.66,d,'brick');
 // Short bridge decks, old storefront canopy and a continuous raised sidewalk.
 box(427.2,.08,1314,3.2,.50,36,'stone');box(437.85,.08,1312,2.3,.50,34,'stone');
 for(const zz of [1301.7,1328.2]){
  box(432.35,.20,zz,13.6,.43,3.35,'layers');
  for(const side of [-1,1]){
   box(432.35,-.23,zz+side*1.49,13.6,.45,.22,'iron');
   box(432.35,.95,zz+side*1.52,13.6,.08,.09,'iron');
   for(let xx=426;xx<439;xx+=2)box(xx,.58,zz+side*1.52,.06,.77,.06,'iron');
  }
  for(let k=0;k<12;k++)box(426.4+k*.96,.425,zz,.54,.014,.79,'glass');
 }
 // An eastern gutter collects the runoff. Its coping separates it from the ramp.
 box(437.28,-3.51,1314,1.85,.16,26,'water');box(436.21,-3.45,1314,.22,.39,26,'stone');
 for(let zz=1303;zz<1327;zz+=4.1){box(438.46,-1.48,zz,.16,.18,4.14,'iron');cylinder(438.55,-2.03,zz,.072,.072,2.95,'iron');}
 // An upper-storey exit and daylight stair mark the far end of the covered walk.
 for(let k=0;k<20;k++){
  const z=1303-k*.85,y=pioneerFloor(432.3,z);
  box(432.3,y+.10,z,2.05,.21,.87,'layers');
  if(k%3===0)box(431.23,y+.62,z,.075,1.05,.075,'iron');
 }
 beam(431.23,-2.54,1303,431.23,.74,1286.9,.08);
 // The service stair exits inside a dark shop portal beside the exposed public stair.
 for(let k=0;k<8;k++){
  const z=1303.0-k*1.9,y=pioneerFloor(432.3,z);
  for(const x of [430.99,433.62])box(x,y+1.37,z,.24,2.75,2.20,'brick');
  box(432.3,y+2.73,z,2.87,.24,2.28,'layers',.185);
 }
 box(432.3,-.81,1304.05,2.92,.56,.46,'wood');
 box(430.05,-1.56,1297.8,.45,3.0,10.8,'brick');
 for(const x of [429.4,438.1]){box(x,1.5,1286,1.35,3,2.7,'brick');box(x,3.09,1286,1.63,.24,2.9,'layers');}
 for(let k=0;k<5;k++)prop('shrub_03',426+k*2.55,.02,1283.4,2.7+random()*1.1,random()*6);
 // Near returns enclose the south stair. The cut rises to the surrounding street.
 box(423.3,-1.72,1341.6,.64,3.76,23.2,'brick');box(423.3,.28,1341.6,.88,.24,23.3,'layers');
 box(437.8,-1.73,1338.25,.85,3.76,14.8,'layers');box(437.8,.31,1338.25,1.05,.22,14.9,'stone');
 for(let z=1332;z<1352;z+=4.8){box(423.68,-1.5,z,.20,3.51,.40,'stone');}
 for(let z=1332;z<1345;z+=2.1){box(437.8,.83,z,.08,.96,.08,'iron');}box(437.8,1.27,1338.3,.09,.09,14.9,'iron');
 for(let k=0;k<6;k++){const z=1335.8+k*1.55;prop('nettle_plant',424.0,pioneerFloor(424.0,z),z,1.8+random()*1.5,random()*6);}
 // A flagged upper landing opens to the light, with steps visible beyond the gutter.
 for(let k=0;k<17;k++){
  const z=1310.2-k*.46,y=cellar+k*.205;
  box(436.75,y+.07,z,2.0,.20,.49,'layers');box(436.72,y+.179,z+.223,1.99,.02,.055,'trim');
  if(k%3===0)box(437.8,y+.54,z,.055,.96,.06,'iron');
 }
 beam(437.8,cellar+1,1310.2,437.8,cellar+4.28,1302.84,.065);
 box(436.8,-.085,1300.42,2.39,.28,4.46,'layers');
 // Southwest steps climb beside the inclined accessible route.
 for(let k=0;k<18;k++){
  const z=1338.6+k*.83,y=pioneerFloor(426.3,z);
  box(426.3,y+.08,z,1.53,.21,.84,'layers');box(426.3,y+.195,z-.394,1.49,.018,.05,'trim');
  if(k%3===0)box(425.5,y+.56,z,.08,1.05,.08,'iron');
 }
 beam(425.5,-2.55,1339,425.5,.22,1353,.09);
 for(let [x,z,id,s] of [[426.9,1316,'wooden_crate_01',.75],[426.9,1321,'metal_trash_can',.86],[437.85,1312,'fern_02',1.3],[437.3,1326,'weed_plant_02',1.7]])prop(id,x,pioneerFloor(x,z)+.09,z,s,.31); // Office slabs with exposed dark curtain-wall bays and cross-braced window strips.
 waterfrontScenes({box,beam,prop,addGeo,cylinder,buildings,tree,canGrow,sites:interact});
 // Shore and apron tie the floating boarding point to the fixed market landing.
 box(133,.07,884,196,.09,43,'water');box(123,.07,914,162,.09,18,'water');box(123,.07,932,162,.09,18,'water');
 const quayWaterShader=Reflector.ReflectorShader;
 const quayWater=new Reflector(new T.PlaneGeometry(58,32),{
  textureWidth:512,textureHeight:288,clipBias:.003,color:0x40524e,
  shader:{...quayWaterShader,fragmentShader:quayWaterShader.fragmentShader.replace(
   'vec4 base = texture2DProj( tDiffuse, vUv );',
   'vec4 q=vUv; vec2 p=q.xy/q.w; q.xy+=q.w*vec2(.0017*sin(p.y*436.+sin(p.x*44.)),.0012*sin(p.x*297.+p.y*74.));vec4 base=texture2DProj(tDiffuse,q);'
  ).replace('blendOverlay( base.rgb, color )','mix(vec3(.008,.027,.029),base.rgb,.30+.014*sin(p.y*367.+p.x*37.+3.*sin(p.x*79.+p.y*31.)))')}
 });
 quayWater.rotation.x=-Math.PI/2;quayWater.position.set(179,.145,910);
 const reflectQuay=quayWater.onBeforeRender;
 quayWater.onBeforeRender=function(renderer,scene,camera,...args){
  if(scene.overrideMaterial||Math.hypot(camera.position.x-194,camera.position.z-910)>85)return;
  reflectQuay.call(this,renderer,scene,camera,...args);
 };
 tile(179,910).add(quayWater);owned.add(quayWater.getRenderTarget());owned.add(quayWater.material);
 box(227.8,.31,912.25,9.2,.67,26.5,'wood');
 box(234.6,.19,912,4.7,.30,3.2,'wood',0,0,-.06);
 // N05, drop field and N06 exhibit identifiable source-specific silhouettes.
 block(748,341,11,7,1);for(let i=0;i<3;i++){let a=i*Math.PI*2/3;beam(745+Math.cos(a)*2.5,0,336+Math.sin(a)*2.5,745,27,336,.19,'iron');}
 for(let k=0;k<6;k++)beam(743+k*.22,2+k*3.6,336,747-k*.22,5.6+k*3.6,336,.1,'iron');
 // The access lane climbs between the old retaining walls to the transmitter plinth.
 box(745.8,.21,350.6,9.5,.42,12,'stone',.035);
 for(const xx of [740.8,751.2]){
  box(xx,.73,349,.38,1.45,9,'stone');
  for(const zz of [345.4,349,352.7])box(xx,1.45,zz,.51,.21,.58,'stone');
 }
 box(745,.4,336,7,.8,6,'stone');box(748,1.6,344.76,1.62,2.54,.16,'doors');box(748,2.95,344.9,1.98,.14,.63,'iron');sign(748,3.42,344.82,'KLG RADIO',3.8,.54);
 for(const xx of [735,739,743]){cylinder(xx,3.85,352,.105,.145,7.7,'wood');box(xx,7.4,352,.2,.16,1.35,'wood');}
 for(const xx of [735,739])for(const dz of [-.5,.5]){beam(xx,7.45,352+dz,xx+2,7.2,352+dz,.03,'iron');beam(xx+2,7.2,352+dz,xx+4,7.45,352+dz,.03,'iron');}
 prop('utility_box_01',752,0,346,.91);prop('wooden_crate_01',744,.2,346,.72);
 prop('wooden_crate_01',1664,0,179,1.5);
 block(1664,1254,13,8,1,'wall');sign(1664,3.42,1258.62,'CITY LIGHT',6,.53);
 const powerYard=tile(1664,1258),lamps=[],bulbs=new T.MeshStandardMaterial({color:0x807c69,emissive:0xffb357,emissiveIntensity:0});
 owned.add(bulbs);
 for(const [x,y,z] of [[1667,2.43,1258.42],[1650,4.65,1262],[1664.45,2.44,1268.42]]){
  box(x,y+.14,z,.68,.17,.62,'iron');
  const lens=new T.Mesh(new T.SphereGeometry(.19,10,6),bulbs);lens.scale.set(1.35,.8,1);lens.position.set(x,y,z);powerYard.add(lens);
  const lamp=new T.PointLight(0xffc287,0,14,2);lamp.position.set(x,y-.19,z+.36);powerYard.add(lamp);lamps.push(lamp);
 }
 cylinder(1649.45,2.33,1262,.083,.12,4.66,'iron');beam(1649.45,4.68,1262,1650,4.68,1262,.1,'iron');
 box(1667,1.12,1258.15,1.12,2.23,.2,'doors');
 box(1667,.12,1258.69,1.6,.24,.88,'stone');
 // Rough asphalt and irregular shallow puddles share the lamps' physical highlights.
 box(1658,.033,1263,31,.065,7.5,'stone');
 const wet=new T.MeshPhysicalMaterial({color:0x4a5451,alphaMap:texture('evac-art/yard-water-mask.jpg'),roughnessMap:texture('evac-art/yard-water-rough.jpg'),depthWrite:false,roughness:.74,metalness:.12,clearcoat:.65,clearcoatRoughness:.13,transparent:true,opacity:.76,
  normalMap:texture('textures/road_damaged/road_damaged_nor_gl_2k.jpg'),normalScale:new T.Vector2(.065,.065)});
 owned.add(wet);
 for(const [x,z,w,d] of [[1667,1261.1,3.05,2.25],[1664.8,1264.2,2.1,.75],[1651.2,1263.25,3.2,1.35],[1654,1265.3,1.43,.65]]){
  const puddle=new T.Mesh(new T.PlaneGeometry(w*2.4,d*2.4),wet);puddle.rotation.x=-Math.PI/2;puddle.position.set(x,.074,z);powerYard.add(puddle);
 }
 for(const xx of [1641,1649,1657]){
  for(const zz of [1251,1259]){cylinder(xx,3.65,zz,.16,.2,7.3,'iron');for(let j=0;j<3;j++)cylinder(xx,6.5+j*.24,zz,.34,.31,.11,'trim');}
  beam(xx,7.35,1251,xx,7.35,1259,.17,'iron');
  if(xx<1657)for(const zz of [1251,1255,1259]){beam(xx,7.4,zz,xx+4,7.03,zz,.048,'iron');beam(xx+4,7.03,zz,xx+8,7.4,zz,.048,'iron');}
 }
 for(const [key,model,x,z,scale] of [['utility','utility_box_01',1660,1259.2,1.14],['barrel','barrel_03',1670,1259.3,.92]]){
   const t=placed('world',key,{x,y:0,z,yaw:0});
   prop(model,t.x,t.y,t.z,scale,t.yaw*Math.PI/180);
 }
 for(let ax of [1645,1653]){box(ax,1.8,1258,4,3.6,4,'iron');for(let k=0;k<5;k++)box(ax-1.75+k*.86,2.0,1260.2,.16,2.6,.42,'iron');for(let k=-1;k<2;k++){cylinder(ax+k*.92,4.1,1258,.18,.24,1.6,'trim');for(let j=0;j<4;j++)cylinder(ax+k*.92,3.9+j*.24,1258,.41,.4,.1,'trim');}}
 // The five-metre service passage shares two junctions with the surface road.
 // Its walls and roof belong to world.js; surface-mounted detail preserves clearance.
 for(let zz=1310;zz<=1545;zz+=12){
  box(780.25,.13,zz,.45,.08,11.95,'water');
  if(zz>1322)box(775.57,3.7,zz,.09,.12,11.95,'iron');
  box(780.43,2.8,zz,.09,.12,11.95,'iron');
  if(zz>1310&&(zz-1310)%24===0)box(775.65,4.04,zz,.20,.21,.62,'light');
 } // T3 shop fronts, shares reference 19; avoid repeated service points on roads.
 Object.assign(sizes,{drainWall:['concrete_layers_02',3.7],flaking:['wood_peeling_paint_weathered',2.3],shopCream:['worn_mossy_plasterwall',3.1],mossWall:['concrete_moss',2.6]});
 southDistrict({box,beam,cylinder,prop,sign,tree,materials,texture,addGeo,buildings,canGrow,tile,owned});
 const merchants=[['FRESH PRODUCE','wall'],['CLINIC','wall'],['PARTS & SUPPLY','brick'],['HARDWARE','brick'],['OUTFITTER','wood']];
 let selected=interact.filter(s=>s.typ==='T3'&&['食品','诊所','零件','五金店','猎具店'].includes(s.name));
 for(let i=0;i<selected.length;i++){let s=selected[i],j=['食品','诊所','零件','五金店','猎具店'].indexOf(s.name),x=s.x,z=s.y-8;
  if(x>370&&x<507&&z>530&&z<644){
   const service=j===0?[416,585.5]:j===1?[464,572.7]:[403,580.1];
   sign(service[0],2.6,service[1],merchants[j][0],3.05,.42);
   prop(j===0?'plastic_crate_01':'wooden_crate_01',x,.12,z,.76,.35);
   continue;
  }
  if(!canGrow(x,z,6))continue;block(x,z,10,7,1,merchants[j][1]);sign(x,3.4,z+3.72,merchants[j][0],8.9,.85);box(x,2.85,z+4.15,10.3,.18,1.4,'roof',-.13);}
 // Reference 21 street: curb furniture, damp debris and human scale on the south tower approach.
 for(let k=0;k<7;k++){lamp(885+k*51,1268);if(k%2===0)prop('covered_car',912+k*44,0,1266,1,Math.PI/2+.1*random());}
 for(let p of [[982,1269],[979,1273],[987,1271],[268,1805],[423,1209],[449,558],[745,347]])prop('trashbag',p[0],.02,p[1],.7+random()*.5,random()*6);
 for(let k=0;k<96;k++){let x=966+random()*32,z=1266+random()*11;box(x,.045,z,.1+random()*.34,.018,.08+random()*.23,random()>.55?'trim':'wood',0,random()*6);}
 const corridorFootprints=[];
 // Tall shells enclose the horde street. Windows face the playable strip.
 for(const side of [-1,1])for(let i=0;i<13;i++){
  const x=820+i*22+(side>0?6:0),z=1268+side*(19+random()*8),f=(i<5?7:4)+Math.floor(random()*5),h=f*3.6;
  if(!canGrow(x,z,11))continue;
  corridorFootprints.push([x,z,18,13]);
  box(x,h/2,z,18,h,13,i%3?'brick':'wall');box(x,h+.13,z,18.7,.35,13.7,'stone');
  for(let j=0;j<f;j++)for(let k=0;k<5;k++){
   let xx=x-6.8+k*3.35,zz=z-side*6.62;
   box(xx,2.0+j*3.6,zz,1.66,2.05,.14,'glass');box(xx,1.03+j*3.6,zz-side*.14,1.92,.11,.34,'stone');
  }
  box(x,2.65,z-side*7.05,15,.14,1.6,'roof',side*.12);
  if(i>=3&&i<=9){
   const a=side>0?Math.PI:0,face=z-side*6.85;
   for(let j=0;j<Math.min(f,4);j++)for(let k=0;k<5;k++){
    const xx=x-6.8+k*3.35+(side>0?-1.5:1.5),part=j===0&&k===2?'door_centered_small_01':(i+k)%2?'window_centered_double_01':'window_centered_large_02';
    prop('modular_urban_apartments_facade:'+part,xx,.16+j*3.6,face,1,a);
   }
   prop('exterior_aircon_unit',x+4,3.2,face-side*.16,.9,a);
  }
 }
 // Street-edge ecology: broad forests are only on the reference 01 topology, not on missing POI plots.
 const reserve=[[150,930,100],[720,1060,105]];
 function allowed(x,z,pad){return !(x>=90&&x<=390&&z>=435&&z<=629)&&canGrow(x,z,pad)&&!reserve.some(p=>Math.hypot(x-p[0],z-p[1])<p[2]);}
 for(let i=0;i<245;i++){let x=120+random()*1795,z=130+random()*1750;if(allowed(x,z,7))tree(x,z,6+random()*10);}
 for(let b of buildings){let [x,z,w,d]=b;if(pioneerFloor(x,z)<0)continue;for(let j=0;j<12;j++){let a=random()*6.28,xx=x+(w/2+1.1)*Math.cos(a)*1.29,zz=z+(d/2+1.25)*Math.sin(a)*1.29;if(!allowed(xx,zz,0))continue;prop(j%3?'fern_02':'shrub_03',xx,.03,zz,.7+random()*1.7,a);}}
 // Damp verges accumulate shade-tolerant plants and windblown leaves along fence feet.
 for(let i=0;i<70;i++){const x=248+random()*34,side=i%2?1:-1,z=1810+side*(3.28+random()*2.8);
  const growth=['grass_medium_01','weed_plant_02','nettle_plant'][i%3];
  prop(growth,x,.14,z,1.6+random()*2.8,random()*6);
 }
 for(let i=0;i<35;i++){const x=247+random()*33,z=1810+(random()-.5)*6.9;
  if(Math.abs(Math.abs(z-1810)-1.0)<.42)continue;
  prop('grass_medium_01',x,.147,z,.6+random()*1.1,random()*6);
 }
 for(const [id,x,z,s,a] of [['metal_trash_can',276.8,1802.9,1.35,.2],['metal_jerrycan',270.8,1802.9,1.12,.5],['wooden_crate_01',251.3,1816.0,.76,.14],['old_tyre',252.1,1816.0,.9,.28],['plastic_monobloc_chair_01',278.06,1803.16,.95,1.29]])prop(id,x,.14,z,s,a);
 addGeo(new T.PlaneGeometry(1.13,.87),'shadowPatch',278.06,.158,1803.16,-Math.PI/2);
 group.userData.infillCount=addCityBlocks({box,prop,canGrow,sites:interact,occupied:[...buildings,...corridorFootprints]});
 corridorSidewalks({box,tree,prop,sign,frontages:corridorFootprints});
 for(const basin of [
  {name:'Rain pooled along the curb',x:962,y:.114,z:1286,width:3.4,length:51,yaw:Math.PI/2},
  {name:'Runoff at the tunnel mouth',x:773.7,y:.128,z:1318,width:2.2,length:27}
 ]){
  const water=standingWater(basin);
  tile(basin.x,basin.z).add(water);owned.add(water.getRenderTarget());owned.add(water.material);
 }
 const updateVerges=addVerges(group);
 const coarse=new Map();
 for(let p of props.values()){if(!coarse.has(p.id))coarse.set(p.id,[]);coarse.get(p.id).push(p);}
 const mapLoader=new GLTFLoader(),assetRequests=new Map();
 async function loadProps(id,clusters){
    const [source,part]=id.split(':');
  if(!assetRequests.has(source))assetRequests.set(source,mapLoader.loadAsync(base+'models/'+source+'/'+source+'.gltf'));
  const data=await assetRequests.get(source);data.scene.updateMatrixWorld(true);
  const leafy=['fern_02','shrub_03','grass_medium_01','weed_plant_02','nettle_plant'].includes(id), exemplar=part?data.scene.getObjectByName(part):leafy?data.scene.children[0]:data.scene;
  exemplar.traverse(mesh=>{if(!mesh.isMesh)return;
   const m=mesh.material.clone();m.roughness=leafy?.83:.79;
   if(leafy){m.alphaMap=texture('models/'+id+'/textures/'+id+'_alpha_1k.jpg');m.alphaTest=.42;m.transparent=false;m.side=T.DoubleSide;m.color.set(0x9ca981);}
   owned.add(m);owned.add(mesh.geometry);
   const local=mesh.matrixWorld.clone();if(leafy||part){local.elements[12]-=exemplar.position.x;local.elements[13]-=exemplar.position.y;local.elements[14]-=exemplar.position.z;}
   for(let cluster of clusters){const im=new T.InstancedMesh(mesh.geometry,m,cluster.items.length);
    for(let [i,it] of cluster.items.entries()){const [x,y,z,s,a]=it,mat=new T.Matrix4().compose(v3(x,y,z),new T.Quaternion().setFromAxisAngle(v3(0,1,0),a),v3(s,s,s));im.setMatrixAt(i,mat.multiply(local));}
    im.castShadow=!leafy;im.receiveShadow=true;im.computeBoundingSphere();cluster.host.add(im);const range=['grass_medium_01','weed_plant_02','nettle_plant'].includes(id)?26:leafy?45:id==='covered_car'?150:90;propsLod.push({mesh:im,x:cluster.cx,z:cluster.cz,r:range+17});
   }
  });
 }
 for(let {host,mat,list} of batches.values()){let geo=mergeGeometries(list);for(let g of list)g.dispose();const mesh=new T.Mesh(geo,materials[mat]);mesh.castShadow=true;mesh.receiveShadow=true;host.add(mesh);}
 await Promise.all([...coarse].map(([id,cs])=>loadProps(id,cs)));
 return {group,update(position){if(!position)return;updateVerges(position);for(const p of propsLod)p.mesh.visible=position.y<100&&(position.x-p.x)**2+(position.z-p.z)**2<p.r*p.r;for(let t of tiles.values()){let p=t.userData.center;t.visible=Math.hypot(position.x-p.x,position.z-p.z)<(position.y>100?1800:535);}},setPower(on){bulbs.emissiveIntensity=on?4:0;for(const lamp of lamps)lamp.intensity=on?108:0;},dispose(){scene.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(let m of Object.values(materials))m.dispose();for(let obj of owned)obj.dispose();}};
}














