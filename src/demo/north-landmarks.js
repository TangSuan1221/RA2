import * as T from 'three';

export function northSurfaces(materials, texture) {
 const stone = new T.MeshPhysicalMaterial({
  map:texture('textures/road_damaged/road_damaged_diff_2k.jpg',true),
  roughness:.54,clearcoat:.75,clearcoatRoughness:.14,
  normalMap:texture('textures/road_damaged/road_damaged_nor_gl_2k.jpg'), normalScale:new T.Vector2(.24,.24)
 });
 stone.onBeforeCompile=shader=>{
  shader.uniforms.mossSoil={value:texture('textures/brown_mud_leaves_01/brown_mud_leaves_01_diff_1k.jpg',true)};
  shader.vertexShader='varying vec3 northPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n northPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='uniform sampler2D mossSoil;varying vec3 northPosition;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    vec2 xy=northPosition.xz;
    vec3 mineral=texture2D(map,xy*.24).rgb;
    vec3 moss=texture2D(mossSoil,xy*.35).rgb;
    float noise=texture2D(mossSoil,xy*.041).g;
    vec2 cell=abs(fract((xy-vec2(1150.,767.))/vec2(4.15,3.825)+.5)-.5);
    float mossCoverage=smoothstep(.35,.56,max(cell.x,cell.y)+noise*.45+sin(xy.x*1.32+xy.y*.62)*.048);
    float moisture=smoothstep(.035,.33,noise)*(.86-.5*mossCoverage);
    float darkCore=1.-smoothstep(8.,42.,length((xy-vec2(1262.,779.))*vec2(.64,1.)));
    diffuseColor.rgb=mix(mineral*mix(.56,.16,darkCore),moss*vec3(.66,1.12,.43),mossCoverage);
    diffuseColor.rgb*=1.-.46*moisture;
  `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(.68,.14,moisture);');
 };
 materials.plazaStone=stone;
 // Rectified samples contain only roof surfaces. Equipment and coping are real meshes.
 for(const [key,file] of [['stationRoof','fire-roof-tar-survey'],['annexRoof','fire-roof-plaster-survey']]){
  materials[key]=new T.MeshStandardMaterial({
   map:texture('evac-art/'+file+'.webp',true),color:key==='stationRoof'?0xaeb1a2:0xcac7bd,roughness:.7
  });
 }
 for(const name of ['main','annex','rear','west']){
  materials['fireElevation'+name]=new T.MeshStandardMaterial({
   map:texture('evac-art/fire-elevation-'+name+'.webp',true),roughness:.86});
 }
 materials.fireDoor=new T.MeshStandardMaterial({color:0x762e25,roughness:.81});
 materials.vestibuleRear=new T.MeshBasicMaterial({color:0x121715});
 materials.drivewayVerge=new T.MeshStandardMaterial({
  map:texture('textures/leafy_grass/leafy_grass_diff_1k.jpg',true),
  alphaMap:texture('evac-art/lane-mask.jpg'),transparent:true,depthWrite:false,
  color:0xa1a88a,roughness:.92
 });
 materials.firePlaster=new T.MeshStandardMaterial({
  color:0xfff9e1,roughness:.92,map:texture('textures/painted_plaster_wall/painted_plaster_wall_diff_2k.jpg',true),
  normalMap:texture('textures/painted_plaster_wall/painted_plaster_wall_nor_gl_2k.jpg'),normalScale:new T.Vector2(.24,.24)
 });
 // World-scale wet deposits and exposed aggregate use gravity and surface orientation.
 // These masks stay continuous across independently batched walls and coping stones.
 for(const [name,source] of [['fortConcrete','layers'],['fortApron','forecourt'],['towerIron','iron'],['firePlaster','firePlaster']]){
  const finish=materials[source].clone();
  finish.onBeforeCompile=shader=>{
   shader.uniforms.depositMap={value:texture('evac-art/surfaces/concrete_moss_diff_1k.webp',true)};
   shader.vertexShader='varying vec3 surfacePoint; varying vec3 surfaceAxis;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n surfacePoint=(modelMatrix*vec4(transformed,1.)).xyz;surfaceAxis=normalize(mat3(modelMatrix)*normal);');
   shader.fragmentShader='uniform sampler2D depositMap; varying vec3 surfacePoint; varying vec3 surfaceAxis;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    vec3 dp=surfacePoint;
    float top=clamp(normalize(surfaceAxis).y,0.,1.);
    vec2 planar=mix(vec2(dp.x+dp.z,dp.y),dp.xz,top);
    vec3 flecks=texture2D(depositMap,planar*.31).rgb;
    float macro=texture2D(depositMap,planar*.048+vec2(.31,.53)).g;
    float drip=texture2D(depositMap,vec2(planar.x*.85,dp.y*.045)).g;
    float tide=(1.-smoothstep(.03,.82+macro*2.4,dp.y))*(1.-top);
    float film=clamp(smoothstep(.09,.26,macro)*(.20+top*.31)+tide*.31,0.,.79);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.037,.013)+flecks*vec3(.26,.34,.18),film);
    float damp=clamp(tide*.51+top*smoothstep(.06,.19,macro)*.65+(1.-top)*smoothstep(.11,.28,drip)*.34,0.,.8);
    diffuseColor.rgb*=1.-damp*.38;
   `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.24,damp);');
  };
  materials[name]=finish;
 }

}

export function northLandmarks({box,beam,block,windows,prop,tree,canGrow,addGeo}) {
 // Retaining walls follow the local inlet. Its one road crossing remains a bridge.
 for(const [ax,az,bx,bz] of [[340,520,340,663],[340,663,404,663],[404,663,404,652],[404,652,372,652],[372,652,372,520]]) {
  beam(ax,-.39,az,bx,-.39,bz,1.42,'fortConcrete',.76);
  beam(ax,.24,az,bx,.24,bz,.16,'fortApron',.88);
 }
 for(const z of [581.6,598.4]){
  box(355.7,.44,z,32.9,.69,.5,'fortConcrete');
  box(355.7,.86,z,32.9,.13,.58,'iron');
 }
 // A continuous poured apron spans the compound. Inset beds break up its broad surface.
 box(440,.003,593,126,.042,100,'fortApron');
 for(const [x,z,w,d] of [[403,601,11,4],[469,587,15,4],[465,622,23,4],[401,622,17,3],[445,561.8,23,2.2]]){
  box(x,.16,z,w,.15,d,'soil');
  for(let n=0;n<Math.ceil(w*3.8);n++){
   const nx=x+((n*.61803)%1-.5)*w,nz=z+((n*.41421)%1-.5)*d,h=.45+(n*1.37%1)*.97;
   for(const a of [0.38,1.93])addGeo(new T.PlaneGeometry(h*1.48,h),'canopy',nx,h*.48+.22,nz,-.18,a+n*.68,.16*Math.sin(n));
  }
  for(let i=0;i<Math.floor(w/2);i++){
   const dx=x-w/2+.9+i*1.9;
   prop(i%3?'weed_plant_02':'shrub_03',dx,.23,z+Math.sin(i*2.4)*d*.23,i%3?1.3:1.75,i*.91);
  }
 }
 tree(409,601,9);tree(430,566,9);tree(492,557,12);
 // Fort: service roofs, two maintenance annexes and a gatehouse overlook the quay.
 for(const [x,z,w,d] of [[423,580,18,11]]){
  block(x,z,w,d,1,'brick',false);
  box(x,3.84,z,w+.4,.28,d+.4,'iron');
 }
 box(481,1.75,570,5,3.5,7,'fortConcrete');
 for(const [x,z] of [[452,566],[471,566],[419,580],[424,582]]){
  box(x,Math.abs(z-566)<1?4.05:4.03,z,2.1,.55,1.2,'iron');
 }
 for(const [x,z,w,d] of [[439,587,77,45],[401,587,15,61],[466,613,45,15]]){
  box(x,.058,z,w,.025,d,'fortApron');
 }
 for(let i=0;i<8;i++){
  const x=394+i*12;
  for(let j=0;j<2;j++)if(canGrow(x,634+j*2,1.5))prop('shrub_03',x,.03,634+j*2,1.7+(i%3)*.3,i*.77);
 }
 for(let i=0;i<13;i++)tree(486+i%4*8,530-Math.floor(i/4)*8,9+i%5);
  block(398,424,45,19,1,'wall',false);block(445.5,424,49,22,2,'iron',false);
 for(let j=0;j<14;j++){
  const a=j*Math.PI/14,b=(j+1)*Math.PI/14;
  const z0=424+Math.cos(a)*9.7,z1=424+Math.cos(b)*9.7;
  const y0=3.76+Math.sin(a)*3.85,y1=3.76+Math.sin(b)*3.85;
  box(398,(y0+y1)/2,(z0+z1)/2,45.5,.22,Math.hypot(z1-z0,y1-y0),'roof',-Math.atan((y1-y0)/(z1-z0)));
 }
 for(const z of [574,605])box(372,2.04,z,.85,4.08,.85,'fortConcrete');
 beam(372,3.8,574,372,3.8,605,.35,'iron');
 const promenade=[[370,590],[378,597],[387,605],[398,614],[411,621],[428,628],[450,632],[474,632],[489,625],[497,610],[500,590],[500,572]];
 for(let i=1;i<promenade.length;i++){
  const [ax,az]=promenade[i-1],[bx,bz]=promenade[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  box((ax+bx)/2,.041,(az+bz)/2,4.6,.037,len+.19,'fortConcrete',0,Math.atan2(dx,dz));
  const nx=dz/len,nz=-dx/len;
  for(const side of [-1,1])beam(ax+side*2.38*nx,.132,az+side*2.38*nz,bx+side*2.38*nx,.132,bz+side*2.38*nz,.19,'fortApron',.12);
 }
 // Narrow steel balustrade above the outward face of the fort bank.
 for(let x=375;x<505;x+=6)box(x,3.11,652,5.95,.16,1.52,'layers');
 for(let i=0;i<32;i++){
  const x=380+(i*43)%119,z=623+(i*13)%17;
  if(canGrow(x,z,1.8))prop('weed_plant_02',x,.02,z,1.35+(i%4)*.21,i*.49);
 }
 // A single long side elevation continues the near house to its rear gable.
 box(273.72,2.18,1798.8,8.8,4.36,8.72,'shingle');
 box(273.72,4.42,1800.85,9.3,.2,5.25,'roof',-.24);
 box(273.72,4.42,1796.75,9.3,.2,5.25,'roof',.24);
 for(const xx of [271.1,275.05])windows(xx,2.03,1803.26,1.31,1.54);
 prop('barrel_03',277.59,.14,1806.36,1.08,.62);
 // Attached return of the existing house. The east-facing sash frames the driveway.
 box(274.15,2.04,1803.62,5.8,4.08,4.5,'shingle');
 box(274.15,4.16,1803.62,6.2,.23,4.96,'roof',-.13);
 box(277.10,2.18,1804.55,.14,1.79,1.02,'trim');
 box(277.19,2.18,1804.55,.055,1.56,.81,'homeGlass');
 box(277.24,1.30,1804.55,.24,.12,1.14,'wood');
 box(277.26,1.88,1805.76,.09,3.76,.09,'trim');
 beam(277.26,.18,1805.76,277.66,.18,1805.76,.09,'trim');
 prop('painted_wooden_chair_01',277.81,.04,1804.05,.79,1.45);
 for(let k=0;k<19;k++){
  const x=222+Math.sin(k*5.16)*1.05,z=1793+k*1.88;
  if(z<1805||z>1815)prop('shrub_03',x,.04,z,.91+.62*Math.abs(Math.sin(k*1.7)),k*1.9);
 }
 // Home lot: low, utilitarian neighbours terminate the view across the garden fence.
 
 box(224,1.9,1824,11,3.8,8,'wall');box(224,3.89,1824,11.5,.23,8.4,'iron');
 box(228,1.8,1810,9,3.6,8,'wall');box(232.57,1.45,1810,.16,2.9,3.5,'doors');
 for(const side of [-1,1])box(228,3.96,1810+side*2.08,9.5,.18,4.32,'roof',side*.16);
 box(232.58,2.24,1807.25,.15,1.16,1.34,'wood');
 box(232.67,2.24,1807.25,.07,1.02,1.20,'glass');
 for(let i=0;i<8;i++){let x=281.5+i*.59;box(x,.97,1813.55,.54,1.94+(i%3)*.07,.13,'wood',0,0,i%2*.016);}
 box(283.6,1.45,1813.47,4.7,.1,.13,'wood');
 // Soft shoulders and raised planting beds frame a single ordinary car.
 for(const side of [-1,1])for(let k=0;k<10;k++){
  const x=245+k*4.5,z=1810+side*(2.85+.13*Math.sin(k*4.5));
  addGeo(new T.PlaneGeometry(6.1,2.45),'drivewayVerge',x,.151,z,-Math.PI/2,0,.032*Math.cos(k*2.7));
  for(let j=0;j<7;j++){
   const px=x+Math.sin(k*2.71+j*1.4)*2.1,pz=z+Math.cos(k*.94+j*2.1)*.68,h=.14+.25*Math.abs(Math.sin(k*3.3+j));
   for(const yaw of [.28,1.84])addGeo(new T.PlaneGeometry(h*1.75,h),'canopy',px,.14+h*.45,pz,-.27,yaw+j*.74,0);
  }
 }
 // Tower: the lower visitor building surrounds an open central entrance and structural piers.
 for(let i=0;i<28;i++){
  const a=i*Math.PI*2/28;

  const x=1220+Math.cos(a)*22,z=816+Math.sin(a)*22;
  const yaw=Math.PI/2-a;
  const gap=(i>=23&&i<=25)||(i>=9&&i<=11)||[7,14].includes(i);
  box(x,16.7,z,5.08,10.9,.68,i%5===0?'roof':'towerIron',0,yaw);
  const nx=Math.cos(a),nz=Math.sin(a);
  for(const y of [14.2,19.5,23.1]){
   if((i+Math.floor(y))%7===0)continue;
   box(x+nx*.40,y,z+nz*.40,4.28,2.5,.14,i%5===0?'doors':'glass',0,yaw);
   box(x+nx*.51,y,z+nz*.51,.12,2.64,.13,'towerIron',0,yaw);
   box(x+nx*.48,y-1.33,z+nz*.48,4.48,.14,.28,'layers',0,yaw);
  }
  if(gap)continue;
  box(x,5.7,z,4.95,11.4,.55,'towerIron',0,yaw);
  if(i%4!==0)box(x,8.45,z,4.3,2.75,.64,'glass',0,yaw);
  if(i%3===0)box(x,11.3,z,4.95,2.7,.74,'roof',0,yaw);
  if(i%3!==0){
   const outward=.46;
   box(x+Math.cos(a)*outward,5.7,z+Math.sin(a)*outward,2.4,3.8,.1,'doors',0,yaw);
  }
  box(x,5.1,z,.6,10.2,.75,'layers',0,yaw);
 }
 // Eight metres of side returns block the sightline through the drum.
 // Keep the west and south approaches open behind the entrance vestibule.
 const portalAngle=-Math.PI*2/14*2;
 const nx=Math.cos(portalAngle),nz=Math.sin(portalAngle),tx=-nz,tz=nx;
 const portalYaw=Math.PI/2-portalAngle;
 function portalPiece(u,y,depth,w,h,d,material){
  box(1220+nx*(22-depth)+tx*u,y,816+nz*(22-depth)+tz*u,w,h,d,material,0,portalYaw);
 }
 for(const side of [-1,1]){
  portalPiece(side*7.05,5.2,3.6,.68,10.4,8,'towerIron');
  portalPiece(side*6.51,5.3,1.1,.46,10.6,2.5,'layers');
 }
 portalPiece(0,10.9,3.6,14.5,1.25,8.5,'towerIron');
 portalPiece(0,4.85,8.05,14.3,9.7,.58,'vestibuleRear');
 portalPiece(0,.045,4,13.72,.09,8.2,'towerIron');
 for(const side of [-1,1])portalPiece(side*5.65,4.81,6.7,.43,9.62,.55,'towerIron');
 portalPiece(0,1.55,7.66,3.6,3.1,.17,'towerIron');
 box(1208,10.25,831,17.2,2.25,4,'towerIron',0,.74);
 function noise(seed){
  const n=Math.sin(seed*127.1+311.7)*43758.5453;
  return n-Math.floor(n);
 }
 function slab(corners,x,y,z,tilt){
  const points=[];
  for(const [u,v] of corners)points.push(u,y+tilt*u,v);
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(corners.flat(),2));
  geo.setIndex([0,2,1]);geo.computeVertexNormals();
  addGeo(geo,'plazaStone',x,0,z);
 }
 for(let k=0;k<34;k++)for(let j=0;j<26;j++){
  const seed=101*k+j,x=1150+k*4.15,z=767+j*3.825;
  const pocket=Math.sin(x*.21+z*.13)+Math.cos(z*.32-x*.061)+noise(seed)*.55;
  const uplift=.17+.16*noise(seed+21),width=2.028,depth=1.855;
  if(pocket>1.1){
   const split=.065+.15*noise(seed+51);
   slab([[-width,-depth],[width,-depth],[width,depth]],x+split,uplift,z-split,.037);
   slab([[-width,-depth],[width,depth],[-width,depth]],x-split,.115,z+split,-.023);
  }else{
   box(x,.15+noise(seed)*.085,z,4.09,.065,3.775,'plazaStone',.009*Math.sin(j),.008*(noise(seed)-.5),.018*Math.sin(k+j));
  }
  if(pocket>1.25){
   for(let q=0;q<3;q++){
    const offset=(noise(seed+19*q)-.5)*3.1;
    prop('weed_plant_02',x+offset,.22,z+offset*.87,.62+noise(seed+q)*1.23,noise(seed-q)*6);
   }
  }
 }
 function wreck(x,z,yaw,k){
  const seed=111+k*71,r=n=>noise(seed+n);
  if(r(2)<.2){prop('covered_car',x,.025,z,.84+r(3)*.25,yaw);return;}
  const w=1.68+r(3)*.43,l=3.8+r(4)*1.38,h=.8+r(5)*.35;
  const body=['iron','doors','layers','red','iron','roof','doors'][Math.floor(r(6)*7)];
  function part(u,y,v,width,height,depth,mat,tilt=0){
   box(x+u*Math.cos(yaw)+v*Math.sin(yaw),y,z-u*Math.sin(yaw)+v*Math.cos(yaw),width,height,depth,mat,tilt,yaw,(r(10)-.5)*.054);
  }
  const cab=l*(.43+.24*r(7)),offset=(r(8)-.66)*.62;
  part(0,.55,0,w,.54,l,body);
  part(0,h,offset,w*.87,.5,cab,'glass');
  part(0,h+.28,offset,w*.81,.07,cab*.82,body);
  part(0,h-.06,offset+cab*.47,w*.84,.41,.36,'glass',-.33);
  part(0,.72,l*.47,w*.87,.16,.17,'iron');
  for(const side of [-1,1])for(const f of [-l*.3,l*.305])part(side*w*.457,.29,f,.25,.52,.64,'shadow');
 }
 for(let row=0;row<2;row++)for(let k=0;k<22;k++){
  const key=44*row+k,t=1186+k*4.48+noise(key+17)*1.04;
  if(noise(key+72)<.12)continue;
  const lateral=(noise(key+11)-.5)*2.4;
  const x=row?1290+lateral:t,z=row?t-422:763+lateral;
  const yaw=(row?1.7:.24)+(noise(key+58)-.5)*.66+(noise(key+31)<.4?Math.PI:0);
  if(canGrow(x,z,2.2))wreck(x,z,yaw,key);
 }
 for(let k=0;k<=20;k++){
  const x=1190+k*4.75,z=769+k*4.75;
  for(const [px,pz] of [[x,769],[1285,z]])box(px,1.14,pz,.1,2.28,.1,'iron');
  if(k<20)for(const y of [.22,1.8]){
   if(Math.abs(x+2.37-1220)>4)box(x+2.37,y,769,4.75,.06,.07,'iron');if(Math.abs(z+2.37-816)>4)box(1285,y,z+2.37,.07,.06,4.75,'iron');
  }
 }
}
