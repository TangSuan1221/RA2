import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, mix, smoothstep, texture, uv, positionWorld, mx_fractal_noise_float, luminance, normalMap, sin, screenUV, time } from 'three/tsl';
import { loadHDR, loadModel } from '../world/assets.js';
import { archMaterial, paintedSteel } from '../flooded_atrium/materials.js';
import { box, boxUV, merge, meshOf, mulberry, texSet } from '../flooded_atrium/util.js';
import { growWallIvy, hangStrand, buildFoliage } from '../flooded_atrium/foliage.js';
import { makeCookieTexture } from '../interior_dark/flash.js';

export const SHOTS = {
 hero: { position: [2.25,1.65,2.3], lookAt:[0.1,0.9,-1.8], fov:56 },
 beds: { position: [2.2,1.65,2.9], lookAt:[-1,0.9,-1.9], fov:62 },
 top: { mode:'top', yaw:0, pitch:55, distance:14, target:[0,0,-0.5] },
};

function clothMaterial(tint) {
 const m = new THREE.MeshStandardNodeMaterial({side:THREE.DoubleSide,roughness:0.95});
 m.name="hospital-cloth";
 const baseColor=new THREE.Color(tint);
 const p=positionWorld;
 const stain=mx_fractal_noise_float(p.mul(2.7),4,2,0.5).mul(0.5).add(0.5);
 const weave=sin(uv().x.mul(850)).mul(sin(uv().y.mul(850))).mul(0.035).add(1);
 m.colorNode=mix(vec3(baseColor.r,baseColor.g,baseColor.b),vec3(0.19,0.22,0.19),smoothstep(0.58,0.79,stain).mul(0.32)).mul(weave);
 return m;
}

export async function build({scene,renderer,camera}) {
 const rng=mulberry(3124);
 scene.background=new THREE.Color(0x627677);
 scene.environment=await loadHDR('hdri/kloofendal_overcast_1k.hdr');
 scene.environmentIntensity=0.15;
 scene.add(new THREE.HemisphereLight(0xb7cbd0,0x444b3c,.25));
 renderer.toneMappingExposure=1.05;
 camera.near=0.05; camera.far=90; camera.updateProjectionMatrix();
 const wall=archMaterial('worn_mossy_plasterwall',{tint:0x9da6a0,scale:0.38,dark:0.8,moss:0.16,streak:0.65});
 wall.name='hospital-wall';
 const plasterTex=texSet('worn_mossy_plasterwall');
 const wp=positionWorld;
 const damp=mx_fractal_noise_float(wp.mul(vec3(1.9,.18,1.9)),3,2,.5).mul(.5).add(.5);
 const aging=texture(plasterTex.map,uv().mul(.28)).rgb;
 const bottom=smoothstep(1.0,.05,wp.y);
 wall.colorNode=mix(vec3(.20,.245,.225),vec3(.08,.105,.085),smoothstep(.52,.77,damp).mul(.4).add(bottom.mul(.32))).mul(aging.mul(.4).add(.72));
 wall.roughnessNode=float(.93);
 const concrete=archMaterial('concrete_wall_008',{res:'2k',tint:0xb2b4ac,scale:0.42,dark:0.9,moss:0.05,streak:0.2});
 const steel=new THREE.MeshStandardNodeMaterial({color:0x9aada7,roughness:.76,metalness:.15});
 const steelNoise=mx_fractal_noise_float(positionWorld.mul(7),3,2,.5).mul(.5).add(.5);
 steel.colorNode=mix(vec3(.25,.30,.28),vec3(.11,.09,.06),smoothstep(.64,.78,steelNoise));
 const bark=archMaterial('bark_platanus',{scale:.7,tint:0xa5a79b,dark:.9,moss:.3,streak:.2});
 const darkMetal=paintedSteel({paint:0x252e2e,rustAmt:0.45});
 const bedBlue=new THREE.MeshStandardNodeMaterial({color:0x729398,roughness:.73});
 bedBlue.colorNode=mix(vec3(.22,.34,.36),vec3(.09,.11,.09),smoothstep(.60,.75,steelNoise).mul(.65));
 const linen=clothMaterial(0xb0c5c6), curtain=clothMaterial(0x819fa3), oldLinen=clothMaterial(0xaaa998);
 const lists=new Map();
 const add=(mat,g)=>{if(!lists.has(mat))lists.set(mat,[]);lists.get(mat).push(g);};
 const b=(mat,w,h,d,x,y,z,opt={})=>add(mat,box(w,h,d,x,y,z,{bevel:Math.min(w,h,d)*0.08,...opt}));
 const tube=(mat,points,r=.025)=>add(mat,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(4,points.length*5),r,7,false));
 // Deep walls, with an actual open garden doorway and broken glazing.
 b(wall,12,4.2,.35,0,2.1,-6);
 b(wall,.4,4.2,14,-6,2.1,1);
 b(wall,.4,4.2,14,6,2.1,1);
 // opening occupies the left part of back wall; remove the solid back panel and rebuild around it.
 lists.get(wall).shift();
 b(wall,1.0,4.2,.35,-5.5,2.1,-6);
 b(wall,6.3,4.2,.35,2.85,2.1,-6);
 b(wall,4.7,.65,.35,-2.65,3.875,-6);
 for(const x of [-5,-3.45,-1.1])b(darkMetal,.065,3.55,.10,x,1.78,-5.78);
 for(const y of [.22,3.5])b(darkMetal,4.7,.065,.10,-2.65,y,-5.78);
 b(darkMetal,1.55,.7,.1,-4.23,.55,-5.78);
 // Side exit adds a sliver of darkness and connects the ward to the corridor.
 b(concrete,1.0,3.2,.2,5.3,1.6,-4.8);
 b(darkMetal,.09,2.7,.17,4.75,1.35,-4.64);
 // Worn vinyl floor with nonuniform damp patches, seam lines and scanned micro-normal.
 const T=texSet('concrete_wall_008','2k');
 const floor=new THREE.MeshStandardNodeMaterial();
 const p=positionWorld, n=mx_fractal_noise_float(p.mul(.75),4,2,.5).mul(.5).add(.5);
 floor.colorNode=mix(vec3(.13,.16,.15),vec3(.06,.075,.065),smoothstep(.50,.73,n)).mul(texture(T.map,p.xz.mul(.36)).rgb.mul(1.4).add(.38));
 floor.normalNode=normalMap(texture(T.normalMap,p.xz.mul(.4)),vec2(.3,.3));
 floor.roughnessNode=mix(float(.94),float(.67),smoothstep(.5,.72,n));
 b(floor,12,.18,14,0,-.1,1);
 for(let x=-5;x<6;x+=1.2)b(darkMetal,.008,.002,13,x,.002,.5);
 for(let z=-5;z<8;z+=1.2)b(darkMetal,11.8,.002,.008,0,.002,z);
 for(const x of [-5.75,5.75])b(steel,.06,.13,13.5,x,.18,.8);
 // Ceiling only in human-height views, retained as a shadow caster.
 const roof=meshOf(box(12.4,.25,14,0,4.25,1),concrete);roof.layers.set(3);scene.add(roof);camera.layers.enable(3);
 // Hospital beds: separate rounded polymer end panels, metal chassis, casters, control panels, bent guardrails.
 function bed(x,z,yaw=0,fold=0) {
  const group=new THREE.Group(), own=new Map();
  const g=(mat,geo)=>{if(!own.has(mat))own.set(mat,[]);own.get(mat).push(geo);};
  const rb=(mat,w,h,d,px,py,pz,r=.04)=>g(mat,box(w,h,d,px,py,pz,{bevel:r}));
  rb(darkMetal,1.02,.13,2.15,0,.43,0);
  rb(linen,.96,.19,2.02,0,.65,0,.08);
  rb(bedBlue,1.0,.095,1.95,0,.535,0,.035);
  for(const end of [-1,1]) {
   rb(steel,1.08,.52,.10,0,.91,end*1.06,.07);
   rb(bedBlue,.79,.29,.024,0,.92,end*1.12,.025);
   // Inset handle housings and control strip.
   for(const xx of [-.39,.39])rb(darkMetal,.16,.055,.015,xx,1.075,end*1.12,.025);
   if(end===1){rb(steel,.34,.12,.018,.06,.91,1.137,.01);for(let k=0;k<5;k++)rb(darkMetal,.024,.022,.008,-.05+k*.05,.92,1.15,.004);}
   for(const xx of [-.4,.4]) {
    rb(steel,.045,.33,.045,xx,.24,end*.81,.012);
    const wheel=new THREE.CylinderGeometry(.078,.078,.045,16);wheel.rotateZ(Math.PI/2);wheel.translate(xx,.09,end*.81);g(darkMetal,wheel);
   }
  }
  for(const side of [-1,1]) {
   const rail=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(side*.53,.58,-.63),new THREE.Vector3(side*.53,.94,-.54),new THREE.Vector3(side*.53,.96,.49),new THREE.Vector3(side*.53,.57,.60)]),28,.025,8,false);g(steel,rail);
   for(const zz of [-.35,0,.35])rb(steel,.025,.26,.025,side*.53,.77,zz,.009);
  }
  // Linen is a continuous wrinkled surface, sagging past the mattress edge.
  const sheet=new THREE.PlaneGeometry(1.14,1.85,36,54);sheet.rotateX(-Math.PI/2);
  const a=sheet.attributes.position;
  for(let i=0;i<a.count;i++){
   const xx=a.getX(i),zz=a.getZ(i),edge=Math.max(0,Math.abs(xx)-.45);
   const crease=Math.sin(zz*19+xx*7)*.009+Math.sin(xx*31+zz*8)*.009
    +Math.exp(-Math.pow((zz-.48)*8,2))*.07*Math.sin(xx*13+1)
    +Math.exp(-Math.pow((xx+.22)*10,2))*Math.sin(zz*15)*.024;
   a.setY(i,.755-edge*1.65+crease+Math.exp(-Math.pow((zz+.48)*7,2))*(.04+fold));
  }
  sheet.computeVertexNormals();g(linen,sheet);
  rb(oldLinen,.63,.10,.39,.04,.79,-.69,.045);
  for(const [mat,geos]of own)group.add(meshOf(boxUV(merge(geos)),mat));
  group.position.set(x,0,z);group.rotation.y=yaw;scene.add(group);
 }
 bed(-.75,-.3,-.13,.03);bed(-.35,-3.1,.08,.06);
 // Privacy curtains: independent corrugated cloth panels in bent steel frames.
 function screen(x,z,angle) {
  const root=new THREE.Group();
  const g=new THREE.PlaneGeometry(1.75,1.63,64,18);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const xx=p.getX(i),yy=p.getY(i);p.setZ(i,Math.sin(xx*39)*(.035+.015*(.8-yy))+Math.sin(yy*4+xx*6)*.025);p.setY(i,yy+Math.sin(xx*12)*.018);}
  g.computeVertexNormals();const m=meshOf(g,curtain);m.position.y=1.2;root.add(m);
  for(const xx of [-.92,.92]){const st=meshOf(box(.028,2.2,.028,xx,1.1,0,{bevel:.01}),steel);root.add(st);root.add(meshOf(box(.5,.035,.05,xx,.08,0,{bevel:.01}),steel));}
  root.add(meshOf(box(1.86,.03,.03,0,2.16,0,{bevel:.01}),steel));
  root.position.set(x,0,z);root.rotation.y=angle;scene.add(root);
 }
 screen(.4,-4.9,.05);screen(2.15,-4.6,-.2);
 // Medical service outlets and battered wall protection rail.
 b(steel,4.8,.12,.08,2.0,1.28,-5.75);
 for(const x of [1.0,1.42,2.3]) { b(steel,.14,.16,.035,x,1.62,-5.75); b(darkMetal,.045,.035,.012,x,1.64,-5.72); }
 b(steel,.12,.18,.03,4.8,1.25,-5.74);
 // Scanned props are normalized to measured dimensions before placement.
 async function prop(id,x,z,height,rot=0){const a=await loadModel(id);const o=a.scene.clone(true);
 if(id==='metal_trash_can') { for(const child of [...o.children])if(!child.name.includes('rust'))o.remove(child); }
 if(id==='fern_02'||id==='shrub_02') { for(const child of [...o.children].slice(1))o.remove(child); }const bounds=new THREE.Box3().setFromObject(o),sz=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());const k=height/sz.y;o.position.set(-center.x*k,-bounds.min.y*k,-center.z*k);o.scale.setScalar(k);const root=new THREE.Group();root.add(o);root.position.set(x,0,z);root.rotation.y=rot;scene.add(root);return root;}
 await prop('wheelchair_01',-3.8,-2.3,1.05,.6);
 await prop('metal_trash_can',1.0,-.8,.9,.1);
 await prop('drawer_cabinet',1.9,-1.9,1.10,-.15);
 await prop('modern_arm_chair_01',2.9,-4.0,1.0,Math.PI*.9);
 await prop('painted_wooden_chair_02',3.8,-2.9,.96,-.4);
 // Broken ceiling plaster accumulates along bed casters and wall bases.
 const rubble=[];
 for(let i=0;i<210;i++){const x=-4.5+rng()*8,z=-4.8+rng()*9;if(x>2.4&&z>0&&rng()<.8)continue;const s=.03+rng()*.14;const sh=new THREE.Shape();let start=true;const count=4+Math.floor(rng()*4);
 for(let k=0;k<count;k++){const a=k/count*Math.PI*2,rr=s*(.5+rng()*.6);const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;if(start){sh.moveTo(xx,yy);start=false;}else sh.lineTo(xx,yy);}sh.closePath();
 const chip=new THREE.ExtrudeGeometry(sh,{depth:.007+rng()*.009,bevelEnabled:false});chip.rotateX(-Math.PI/2);chip.rotateY(rng()*6.28);chip.translate(x,.012,z);rubble.push(chip);}
 add(concrete,merge(rubble));
 // Fallen ceiling grid, loose conduits and a displaced fluorescent fixture.
 tube(darkMetal,[[-4.8,3.95,-2.7],[-3.9,3.4,-2.7],[-3.6,2.9,-2.3],[-3.7,1.8,-2]],.014);
 b(steel,1.25,.07,.22,1.3,3.92,-1.8,{rz:.05});
 b(oldLinen,1.0,.012,.12,1.3,3.87,-1.8);
 // Outside garden and intruding ivy are real geometry, visible through the broken opening.
 b(concrete,12,.25,9,-2,-.2,-10.5);
 const ivy={leaves:[],stems:[]};
 growWallIvy({origin:new THREE.Vector3(-4.95,0,-5.60),uDir:new THREE.Vector3(1,0,0),normal:new THREE.Vector3(0,0,1),width:1.3,height:3.6},{seeds:[[.15,.05],[.6,.05],[1,.1]],rng,steps:130,density:()=>.8},ivy);
 for(let i=0;i<17;i++)hangStrand(new THREE.Vector3(-4.8+rng()*3.5,3.5,-5.65),.3+rng()*2.0,rng,ivy,{leafScale:.08,density:.8});
 scene.add(buildFoliage(ivy,{sway:.004}));
 for(let i=0;i<12;i++){await prop(i%2?'fern_02':'shrub_02',-4.4+rng()*3.6,-6.3-rng()*3, .8+rng()*1.0,rng()*6.28);}
 // Two trunks and layered scanned foliage give the garden true parallax through the opening.
 for(const [xx,zz] of [[-3.1,-8.2],[-5.7,-10.4]]) {
  const trunk=new THREE.CylinderGeometry(.14,.21,4.7,10);trunk.translate(xx,2.2,zz);add(bark,trunk);
  await prop('shrub_02',xx,zz,3.6,.7);
 }
 for(let i=0;i<4;i++){await prop('shrub_02',-5+rng()*5,-9-rng()*4,2.8+rng()*1.5,rng()*6.28);}
 b(wall,28,7,.4,-5,3,-21);
 for(let x=-18;x<4;x+=1.5){b(darkMetal,.9,1.5,.03,x,3.8,-20.75);b(steel,1.1,.1,.12,x,2.98,-20.70);}
 
 for(const[mat,geos]of lists)scene.add(meshOf(boxUV(merge(geos)),mat));
 const sun=new THREE.DirectionalLight(0xc9e0e5,2.5);sun.position.set(-2,12,-10);sun.target.position.set(-1,0,0);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.camera.layers.enable(3);scene.add(sun,sun.target);
 const bounce=new THREE.SpotLight(0xbbd7cf,24,16,.7,1,1.5);bounce.position.set(-3,2.3,-6.7);bounce.target.position.set(-1,.7,-1);scene.add(bounce,bounce.target);
 const flash=new THREE.SpotLight(0xdde7df,18,12,.43,.7,1.4);flash.map=makeCookieTexture();flash.position.set(1.9,1.6,2.2);flash.target.position.set(-1.0,.82,-.3);scene.add(flash,flash.target);
 return {sun,update(){const top=camera.position.y>4;camera.layers[top?'disable':'enable'](3);renderer.toneMappingExposure=top?1.5:1.05;},pipelineOptions:{bloomThreshold:1.2,postLDR:out=>{
  const c=out.rgb;const l=luminance(c);return vec4(mix(vec3(l),c,.82).mul(vec3(.96,1,.99)),out.a);
 }}};
}
