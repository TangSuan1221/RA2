import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function estate(){
 const g=new T.Group();
 const material=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
 const paint=new T.MeshPhysicalMaterial({color:0x70766b,roughness:.49,metalness:.29,clearcoat:.69,clearcoatRoughness:.20}), trim=material(0x292b29,.74,.14), chrome=material(0x83857e,.5,.46), glass=new T.MeshPhysicalMaterial({color:0x6d827a,roughness:.12,metalness:.08,transparent:true,opacity:.39,depthWrite:false,side:T.FrontSide}), rubber=material(0x222321,.92);
 let seed=72;const noise=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 // Microsurface variation follows the finish: worn clear lacquer, granular tyre rubber,
 // circumferentially brushed rims. The texture is linear material data.
 const side=128,finishData=new Uint8Array(side*side*4);
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const k=4*(y*side+x),grain=noise();
  finishData[k]=finishData[k+1]=finishData[k+2]=Math.round(153+grain*65+14*Math.sin(y*Math.PI/8));
  finishData[k+3]=255;
 }
 const finish=new T.DataTexture(finishData,side,side);
 finish.wrapS=finish.wrapT=T.RepeatWrapping;finish.repeat.set(3,3);
 finish.generateMipmaps=true;finish.minFilter=T.LinearMipmapLinearFilter;finish.magFilter=T.LinearFilter;finish.needsUpdate=true;
 paint.clearcoatRoughnessMap=finish;chrome.roughnessMap=finish;
 rubber.bumpMap=finish;rubber.bumpScale=.0016;
 function surface(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
 }
 paint.map=surface(384,192,(c,w,h)=>{
  c.fillStyle='#e4e4df';c.fillRect(0,0,w,h);
  const dust=c.createLinearGradient(0,h*.35,0,h);dust.addColorStop(0,'rgba(118,106,89,0)');dust.addColorStop(.78,'rgba(120,109,91,.15)');dust.addColorStop(1,'rgba(114,101,80,.62)');
  c.fillStyle=dust;c.fillRect(0,0,w,h);
  for(let i=0;i<4800;i++){const y=h*Math.pow(noise(),.36);c.fillStyle='rgba(94,86,69,'+(noise()*.37)+')';c.fillRect(noise()*w,y,noise()*2.6+.3,noise()*1.2+.3);}
  for(let i=0;i<85;i++){const x=noise()*w,y=noise()*h*.78;c.fillStyle='rgba(102,103,94,.09)';c.fillRect(x,y,.4+noise()*1.2,4+noise()*28);}
 });
 const plate=material(0xc2bda6,.78,.08);
 plate.map=surface(384,128,(c,w,h)=>{
  c.fillStyle='#b5b8a8';c.fillRect(0,0,w,h);c.strokeStyle='#666b61';c.lineWidth=5;c.strokeRect(6,6,w-12,h-12);
  c.textAlign='center';c.fillStyle='#6b4238';c.font='bold 17px Arial';c.fillText('WASHINGTON',192,27);
  c.fillStyle='#283237';c.font='bold 70px monospace';c.fillText('JVR 614',192,94);
  for(let i=0;i<1000;i++){c.fillStyle='rgba(70,61,43,.19)';c.fillRect(noise()*w,h*Math.pow(noise(),.52),1+noise()*4,1+noise()*2);}
  for(const x of [26,358]){c.fillStyle='#4e5049';c.beginPath();c.arc(x,17,4,0,Math.PI*2);c.fill();}
 });
 function put(geo,m,x,y,z){const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o}
 const box=(x,y,z,w,h,l,m,r=.035)=>put(new RoundedBoxGeometry(w,h,l,2,r),m,x,y,z);
 function cabinGlass(rows){
  const corners=rows.map(([y,w,back,front])=>[[-w,y,back],[w,y,back],[w,y,front],[-w,y,front]]);
  const vertices=[];
  for(let row=1;row<corners.length;row++)for(let side=0;side<4;side++){
   const next=(side+1)%4,lo=corners[row-1],hi=corners[row];
   vertices.push(lo[side],hi[side],lo[next],lo[next],hi[side],hi[next]);
  }
  const pane=new T.BufferGeometry();
  pane.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));
  pane.computeVertexNormals();
  put(pane,glass,0,0,0).castShadow=false;
 }
 box(0,.76,0,1.83,.54,4.55,paint,.14);box(0,1.01,1.39,1.76,.16,1.51,paint,.09);
 cabinGlass([[1.01,.84,-1.91,.93],[1.44,.74,-1.78,.61],[1.64,.66,-1.58,.36]]);
 const fabric=material(0x323834,.95);
 box(0,1.06,.66,1.51,.15,.39,trim);
 for(const x of [-.43,.43]){
  box(x,1.20,-.11,.52,.46,.17,fabric,.07);
  box(x,1.48,-.14,.29,.17,.14,fabric,.055);
 }
 box(0,1.21,-1.19,1.37,.34,.23,fabric,.09);
 box(0,1.06,-1.62,1.38,.065,.49,trim);
 const wheel=put(new T.TorusGeometry(.17,.017,8,28),rubber,-.42,1.24,.44);
 wheel.rotation.x=-.32;
 box(0,1.64,-.6,1.39,.085,2.02,paint);for(let side of [-1,1]){
 for(let z of [-1.4,-.63,.14])box(side*.755,1.35,z,.055,.46,.075,trim);
 box(side*.919,.72,0,.045,.075,3.9,trim);box(side*.887,.99,-.45,.055,.06,.22,chrome);box(side*.887,.99,.34,.055,.06,.22,chrome);
 box(side*.97,1.24,.59,.22,.14,.24,paint);box(side*.55,1.72,-.59,.05,.05,1.9,trim);
 for(let z of [-1.43,1.42]){const wheel=put(new T.CylinderGeometry(.37,.37,.215,28),rubber,side*.875,.4,z);wheel.rotation.z=Math.PI/2;const hub=put(new T.CylinderGeometry(.225,.225,.225,20),chrome,side*.88,.4,z);hub.rotation.z=Math.PI/2;for(let i=0;i<6;i++){const a=i*Math.PI/3;box(side*1.0,.4+.14*Math.sin(a),z+.14*Math.cos(a),.013,.055,.05,trim,.008)}}
 box(side*.64,.92,2.24,.44,.16,.085,material(0xe4d5a5,.28,.24));
 box(side*.67,.92,-2.24,.405,.197,.103,trim,.026);
 for(const [out,w,color] of [[.107,.145,0x7a2720],[-.046,.13,0x883823],[-.137,.046,0x9a9885]])
  box(side*(.67+out),.925,-2.297,w,.135,.022,material(color,.32,.18),.008);
 }
 for(let z of [-2.24,2.24])box(0,.6,z,1.79,.16,.15,trim);
 box(0,.78,-2.265,.54,.203,.043,trim,.015);
 const tag=put(new T.PlaneGeometry(.495,.163),plate,0,.78,-2.29);tag.rotation.y=Math.PI;
 box(0,.79,2.24,.42,.15,.11,trim);
 put(new T.PlaneGeometry(.49,.159),plate,0,.705,2.327);
 for(const side of [-1,1]){
  seal([side*.84,1.055,.94],[side*.66,1.635,.36],.037,chrome);
  seal([side*.34,1.065,.94],[side*.10,1.097,.895],.014,rubber);
 }
 function seal(a,b,r,m){
  const A=new T.Vector3(...a),B=new T.Vector3(...b),axis=B.clone().sub(A),o=put(new T.CylinderGeometry(r,r,axis.length(),7),m,...A.clone().lerp(B,.5).toArray());
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
 }
 for(const k of [-1,1]){
  seal([k*.835,1.025,-1.915],[k*.744,1.438,-1.793],.037,trim);
  seal([k*.744,1.438,-1.793],[k*.662,1.623,-1.61],.035,trim);
 }
 seal([-.83,1.028,-1.916],[.83,1.028,-1.916],.032,trim);
 seal([-.66,1.628,-1.605],[.66,1.628,-1.605],.033,trim);
 seal([.12,1.08,-1.915],[-.17,1.23,-1.857],.016,trim);
 seal([-.44,1.20,-1.862],[.06,1.255,-1.853],.017,rubber);
 for(let i=0;i<5;i++)box(0,.845+i*.034,2.27,.56,.012,.021,chrome,.004);
 return g
}
