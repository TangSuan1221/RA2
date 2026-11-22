import {BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Shape, CatmullRomCurve3, Vector2, Vector3} from 'three';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as installedThree from 'three';
const checkout=resolve(process.env.RA2_THREE_SOURCE||'../AI相关/three.js');
async function geometryClass(name){
 const file=join(checkout,'src','geometries',name+'.js');
 return existsSync(file)?(await import(pathToFileURL(file).href))[name]:installedThree[name];
}
const [LatheGeometry,ExtrudeGeometry,TubeGeometry]=await Promise.all(['LatheGeometry','ExtrudeGeometry','TubeGeometry'].map(geometryClass));
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';



// Coordinates are measured on concept.png. Each row uses its own pixel-to-metre calibration.
// X and image Y refer to the front view; S is distance along the side-view image.
export const referenceMeshes=new Map();
const rows=[
 {id:'watch-desk',row:0,bottom:356,cx:203,base:336,cs:544,scale:[1.8/380,1.8/380,.82/167]},
 {id:'pump-test-bench',row:358,bottom:723,cx:201,base:712,cs:544,scale:[1.8/351,1.8/351,.80/194]},
 {id:'hose-cart',row:725,bottom:1083,cx:201,base:1068,cs:542,scale:[.80/318,.80/318,.80/318]},
 {id:'south-shutter',row:1085,bottom:1448,cx:200,base:1433,cs:550,scale:[4.80/276,4.50/280,.50/70]}
];
const samples={
 oak:[812,186,870,220],olive:[486,167,578,262],iron:[565,606,577,650],steel:[56,665,113,676],
 red:[74,1106,166,1130],rubber:[333,980,350,1018],cloth:[127,869,140,921],black:[130,85,178,99],
 paper:[291,103,337,113],brass:[114,488,122,499]
};
function placeUnit(g,w,h,d){
 g.computeBoundingBox();const size=g.boundingBox.getSize(new Vector3()),mid=g.boundingBox.getCenter(new Vector3());
 g.translate(-mid.x,-mid.y,-mid.z);g.scale(w/(size.x||1),h/(size.y||1),d/(size.z||1));return g;
}
function shape(type){
 if(type==='box')return new RoundedBoxGeometry(1,1,1,1,.014);
 if(type==='oval')return new SphereGeometry(.5,32,20);
 if(type==='wheel'){
  const pts=[[.15,-.47],[.32,-.49],[.42,-.47],[.48,-.36],[.5,-.22],[.5,.22],[.48,.36],[.42,.47],[.32,.49],[.15,.47],[.15,-.47]];
  return new LatheGeometry(pts.map(p=>new Vector2(...p)),48).rotateZ(Math.PI/2);
 }
 const ring=type.startsWith('ring');
 let g=ring?new TorusGeometry(.39,.095,10,40):new CylinderGeometry(.5,.5,1,48);
 if(ring&&type.endsWith('x'))g.rotateY(Math.PI/2);
 if(ring&&type.endsWith('y'))g.rotateX(Math.PI/2);
 if(!ring&&type.endsWith('x'))g.rotateZ(Math.PI/2);
 if(!ring&&type.endsWith('z'))g.rotateX(Math.PI/2);
 return g;
}
function mapRect(r,u,v){return [r[0]+u*(r[2]-r[0]),r[1]+v*(r[3]-r[1])]}
class Assembly{
 constructor(row){this.r=row;this.parts=[]}
 add(name,mat,type,rect,s0,s1,options={}){
 const [l,t,r,b]=rect,w=r-l,h=b-t,d=s1-s0;
 let g=options.geometry||placeUnit(shape(type),w,h,d);
 g.translate((l+r)/2,-(t+b)/2,-(s0+s1)/2);
 this.mesh(name,mat,g,{rect,s0,s1,...options});
 }
 mesh(name,mat,geometry,opt){
 let g=geometry.index?geometry.toNonIndexed():geometry;
 const pos=g.attributes.position,uv=g.attributes.uv,normal=g.attributes.normal;
 const {row,bottom,cx,base,cs,scale}=this.r;
 const boxSample=opt.sample||samples[mat]||samples.steel;
 const rect=opt.rect,[l,t,r,b]=rect;
 for(let i=0;i<pos.count;i+=3){
  const n=new Vector3();for(let j=0;j<3;j++)n.add(new Vector3().fromBufferAttribute(normal,i+j));n.normalize();
  for(let j=0;j<3;j++){
   const k=i+j,x=pos.getX(k),y=-pos.getY(k),s=-pos.getZ(k);
   const u=(x-l)/(r-l),v=(y-t)/(b-t),depth=(s-opt.s0)/(opt.s1-opt.s0);
   let pixel;
   if(name==='leaf-slat')pixel=[x,y];
   else if(name==='woven-hose'&&Math.abs(n.x)<.96)pixel=mapRect(opt.weave,u,v);
   else if(n.z>=Math.abs(n.x)*.85&&n.z>=Math.abs(n.y)*.85&&opt.front!==false)pixel=opt.front?mapRect(opt.front,u,v):[x,y];
   else if(Math.abs(n.x)>=Math.abs(n.y)&&opt.side)pixel=mapRect(opt.side,depth,v);
   else if(n.y>.45&&opt.top){pixel=mapRect(opt.top,u,1-depth);
    if(name==='worktop'&&((pixel[0]>746&&pixel[0]<880)||(pixel[0]>950&&pixel[0]<1032)))pixel=mapRect([883,89,949,251],u,1-depth);
   }
   else pixel=mapRect(boxSample,Math.min(.998,Math.max(.002,uv.getX(k))),Math.min(.998,Math.max(.002,uv.getY(k))));
   // All crops use the original plate so that hidden faces can share clean material samples.
   uv.setXY(k,pixel[0]/1086,pixel[1]/1448);
   pos.setXYZ(k,(x-cx)*scale[0],(base-y)*scale[1],(cs-s)*scale[2]);
   const nn=new Vector3(normal.getX(k)/scale[0],normal.getY(k)/scale[1],normal.getZ(k)/scale[2]).normalize();normal.setXYZ(k,nn.x,nn.y,nn.z);
  }
 }
 g.computeBoundingBox();const size=g.boundingBox.getSize(new Vector3()),center=g.boundingBox.getCenter(new Vector3());
 const key=this.r.id+'@'+this.parts.length;g.translate(-center.x,-center.y,-center.z);g.scale(1/size.x,1/size.y,1/size.z);g.computeBoundingBox();referenceMeshes.set(key,g);
 this.parts.push({part:name,material:mat,shape:key,angle:0,front:[center.x,center.y,size.x,size.y],right:[center.z,center.y,size.z,size.y],top:[center.x,center.z,size.x,size.z]});
 }
 tube(name,mat,points,radius,opts={}){
 let path=new CatmullRomCurve3(points.map(([x,y,s])=>new Vector3(x,-y,-s)),false,'centripetal');
 const g=new TubeGeometry(path,Math.max(16,points.length*5),radius,10,false);g.computeBoundingBox();let {min,max}=g.boundingBox;
 this.mesh(name,mat,g,{rect:[min.x,-max.y,max.x,-min.y],s0:-max.z,s1:-min.z,...opts});
 }
}
function desk(a){
 const add=(...args)=>a.add(...args);
 add('worktop','oak','box',[13,104,393,135],461,632,{side:[461,104,632,130],front:[15,104,390,134],top:[700,88,1065,253]});
 for(const [l,r] of [[16,134],[271,389]]){
 add('pedestal','olive','box',[l,132,r,311],467,626,{side:[468,130,626,313],front:false});
 for(const [i,top,end] of [[0,140,184],[1,186,232],[2,234,296]]){
 const left=l+10,right=r-12;
 add('drawer-'+i,'olive','box',[left,top,right,end],464,470);
 const x=(l+r)/2;
 a.tube('drawer-pull','steel',[[x-12,top+22,465],[x-12,top+25,460],[x+12,top+25,460],[x+12,top+22,465]],1.5);
 }for(const s of [471,619]){let x=l<100?24:380;add('leveling-foot','iron','cyly',[x-6,308,x+6,334],s-5,s+5);}
 }
 add('back-panel','olive','box',[133,151,273,270],616,623);
 add('pencil-drawer','olive','box',[133,132,273,161],466,614);
 add('radio','black','box',[103,74,198,112],526,604,{side:[531,70,606,103],top:[778,104,874,170]});
 add('antenna','black','cyly',[188,13,193,76],593,596);
 add('hand-mic','black','oval',[70,73,98,111],505,525);
 a.tube('coiled-lead','black',Array.from({length:54},(_,i)=>[78+i*.75,111+Math.sin(i*2)*1.9,510+5*Math.sin(i*Math.PI/53)]),1.2);
 add('clipboard','oak','box',[282,100,353,120],475,537,{top:[956,145,1025,233]});
 add('log','paper','box',[286,99,348,116],478,533,{top:[962,151,1019,229]});
 add('clip','steel','box',[309,95,329,102],528,535);
}
function bench(a){
 const add=(...v)=>a.add(...v);
 add('tabletop','steel','box',[27,580,376,601],449,643,{side:[449,582,643,604],top:[733,455,766,617]});
 for(const x of [42,359])for(const s of [460,633]){
 add('leg','iron','box',[x-9,600,x+9,701],s-8,s+8,{side:s<500?[452,604,470,701]:[626,604,642,701]});
 add('foot','iron','box',[x-14,702,x+13,712],s-12,s+12);
 }
 for(const s of [464,627])add('cross-rail','steel','box',[50,655,351,678],s-6,s+6);
 for(const x of [43,358])add('end-rail','steel','box',[x-7,654,x+7,677],464,629,{side:[468,654,624,678]});
 for(const x of [30,368])a.tube('bench-handle','steel',[[x,581,466],[x,550,474],[x,547,506],[x,547,587],[x,551,616],[x,580,628]],4.4);
 const profile=[[447,0],[447,13],[462,13],[463,17],[473,17],[474,25],[486,28],[490,48],[498,48],[501,52],[511,52],[517,41],[534,38],[546,40],[548,47],[564,47],[570,34],[589,28],[607,27],[609,31],[616,31],[617,17],[634,17],[635,21],[640,21],[641,0]];
 const body=new LatheGeometry(profile.toReversed().map(([depth,radius])=>new Vector2(radius,-depth)),64).rotateX(Math.PI/2).translate(197,-529,0);
 a.mesh('pump-casting','red',body,{rect:[145,477,249,581],s0:447,s1:641,side:[447,477,641,581],top:[829,476,932,598]});
 add('inlet-flange','red','cylz',[151,490,242,570],471,493);
 add('intake-rim','steel','ringz',[174,506,222,553],457,478);
 add('intake-bore','black','cylz',[184,515,213,546],465,475);
 add('top-neck','red','cyly',[182,432,213,490],522,559);
 add('top-flange','red','cyly',[166,450,229,464],513,570);
 for(const x of [157,233])add('mount-foot','red','box',[x-11,569,x+13,582],482,598);
 for(let i=0;i<8;i++){let t=i*Math.PI/4,x=197+40*Math.cos(t),y=531+35*Math.sin(t);add('flange-bolt','steel','cylz',[x-3,y-3,x+3,y+3],469,473);}
 for(const [x,left,right] of [[118,52,148],[273,246,346]]){
 add('manifold','steel','cylx',[left,516,right,544],522,554);
 add('stem-union','steel','cylz',[x-11,516,x+11,543],525,570);
 add('gauge-stem','brass','cyly',[x-6,445,x+6,577],559,573,{side:[499,449,513,578]});
 add('pressure-gauge','steel','cylz',[x-38,373,x+38,450],553,582,{side:[496,373,524,449],top:x===118?[768,470,836,495]:[920,471,994,496]});
 add('gauge-face','paper','cylz',[x-33,378,x+33,446],552,554);
 const v=x===118?67:326;
 add('valve-stem','brass','cyly',[v-5,483,v+5,520],527,537);
 add('valve-wheel','red','ringy',[v-21,474,v+21,485],512,551);
 for(let j=0;j<3;j++){let theta=j*Math.PI/3;a.tube('wheel-spoke','red',[[v-17*Math.cos(theta),480,532-17*Math.sin(theta)],[v+17*Math.cos(theta),480,532+17*Math.sin(theta)]],1.7)}
 }
}
function cart(a){
 const add=(...v)=>a.add(...v);
 for(const x of [64,335])for(const s of [476,611]){
 add('tire','rubber','wheel',[x-21,960,x+21,1066],s-49,s+49,{side:[s-48,966,s+47,1059],sample:[330,980,348,1017]});
 add('hub','steel','cylx',[x-21,985,x+21,1042],s-27,s+27,{side:[s-25,987,s+25,1036]});
 }
 for(const x of [92,305]){
 // Curved triangular side cheek traced in the side elevation; extruded across the axle.
 const outline=new Shape();outline.moveTo(447,-1008);outline.quadraticCurveTo(428,-972,458,-934);outline.lineTo(525,-877);outline.quadraticCurveTo(580,-844,603,-876);outline.lineTo(622,-973);outline.quadraticCurveTo(623,-1005,604,-1020);outline.lineTo(464,-1022);outline.closePath();
 const g=new ExtrudeGeometry(outline,{depth:8,bevelEnabled:true,bevelThickness:1,bevelSize:1,bevelSegments:2,curveSegments:18});
 g.rotateY(Math.PI/2);g.translate(x-4,0,0);g.computeBoundingBox();let {min,max}=g.boundingBox;
 a.mesh('side-cheek','red',g,{rect:[min.x,-max.y,max.x,-min.y],s0:-max.z,s1:-min.z,side:[443,864,622,1020]});
 }
 a.tube('bent-push-handle','steel',[[87,1009,602],[87,860,612],[88,780,635],[103,749,649],[137,743,652],[265,743,652],[292,751,648],[307,782,637],[307,862,613],[307,1009,602]],5.6);
 add('front-tie-bar','steel','cylx',[89,1007,310,1024],441,452);
 for(let i=0;i<7;i++)add('woven-hose','cloth','cylx',[104+i*25,850,129+i*25,1028],451,618,{side:[495,866,514,890],top:[798+i*22,854,814+i*22,1006],weave:[119+i*23,857,136+i*23,1017],sample:[120+i*23,864,133+i*23,1000]});
 a.tube('hose-tail','cloth',[[267,856,527],[276,862,497],[280,883,467],[282,912,449]],10);
 add('outlet-coupling','steel','cylz',[269,914,307,958],429,457);
 add('outlet-lumen','black','oval',[275,933,300,951],426,435);
}
function shutter(a){
 const add=(...v)=>a.add(...v);
 for(const [l,r] of [[38,59],[334,356]]){
 add('fixed-guide','red','box',[l,1140,r,1430],530,579,{side:[536,1155,580,1428]});
 add('anchor-foot','red','box',[l-6,1428,r+6,1434],525,585);
 }
 add('hood','red','box',[34,1100,361,1143],517,587,{side:[518,1098,587,1153],top:[716,1244,1061,1296]});
 for(let i=0;i<32;i++){let t=1144+i*8.13;add('leaf-slat','steel','cylx',[59,t,335,t+8.6],548,559);}
 add('bottom-bar','iron','box',[57,1405,337,1427],544,563);
 for(let i=0;i<36;i++)add('fixed-chain','iron',i%2?'ringx':'ringz',[361,1143+i*5.42,368,1151+i*5.42],521,528);
 add('chain-weight','iron','oval',[359,1331,369,1346],520,529);
}
export function rebuildReferences(plans){
 const builders=[desk,bench,cart,shutter];
 for(const [i,row] of rows.entries()){
 const a=new Assembly(row);builders[i](a);
 const plan=plans.find(p=>p.id===row.id);plan.parts=a.parts;
 const mins=[0,1,2].map(k=>Math.min(...a.parts.map(p=>{const v=k===2?p.right:p.front,j=k===1?1:0;return v[j]-v[j+2]/2})));
 const maxs=[0,1,2].map(k=>Math.max(...a.parts.map(p=>{const v=k===2?p.right:p.front,j=k===1?1:0;return v[j]+v[j+2]/2})));
 plan.size=maxs.map((v,k)=>v-mins[k]);plan.referenceRow=i;
 }

 const get=id=>plans.find(p=>p.id===id);
 const cartBase=get('hose-cart');
 const excluded=new Set(['woven-hose','hose-tail','outlet-coupling','outlet-lumen']);
 for(const id of ['cart-empty','cart-loaded']){
  const state=get(id), extras=state.parts.filter(p=>['brake','load-platform','rack-leg'].includes(p.part)||p.part.startsWith('cargo-'));
  state.parts=[...cartBase.parts.filter(p=>!excluded.has(p.part)),...extras];
  state.size=id==='cart-empty'?cartBase.size:[cartBase.size[0],1.50,Math.max(cartBase.size[2],1.2)];
 }
 const shutterBase=get('south-shutter');
 for(const [id,clear] of [['shutter-half',1.25],['shutter-open',4.50]]){
  const state=get(id);
  state.size=shutterBase.size;state.parts=shutterBase.parts.flatMap(p=>{
   if(!['leaf-slat','bottom-bar'].includes(p.part))return [p];
   if(id==='shutter-open')return [];
   const q=structuredClone(p),next=p.front[1]+clear;
   if(next+p.front[3]/2>4.50)return [];
   q.front[1]=next;q.right[1]=next;return [q];
  });
 }
}

