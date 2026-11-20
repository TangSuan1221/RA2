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
 const stationX=x=>432.5+(x-432.5)*.70;
 function stationBox(x,y,z,w,h,d,mat,...rotation){
  if(x>444||z>1206.6||y<.10)return box(x,y,z,w,h,d,mat,...rotation);
  box(stationX(x),y*1.72,z,w*.70,h*1.72,d,mat,...rotation);
 }
 function stationBeam(x,y,z,x2,y2,z2,width,mat){
  beam(stationX(x),y*1.72,z,stationX(x2),y2*1.72,z2,width,mat);
 }
 // Side walls enclose the upper floor after restoring the survey aspect ratio.
 stationBox(421,5.95,1198,22.94,3.77,13.83,'stationBrick');
 // The small third apparatus bay sits back at the west end of the front.
 stationBox(406.55,1.75,1199.9,5.75,3.5,9.5,'brick');
 stationBox(406.55,1.51,1204.72,4.21,3.01,.15,'shadow');
 stationBox(406.55,3.44,1204.85,5.65,.31,.43,'red');
 for(const x of [404.19,408.89])stationBox(x,1.74,1204.83,.33,3.48,.31,'brick');
 // Firehouse row: a low painted workshop between the brick station and the corner shop.
 stationBox(437.55,1.95,1199,10.95,3.9,12,'firePlaster');
 stationBox(439.4,1.68,1205.17,3.8,3.33,.18,'iron');
 block(449.55,1198,13.05,14,2,'brick',false);
 block(420,1185,13,11,4,'brick',false);
 block(385,1185,18,25,3,'wall',false);
 for(const [x,z] of [[414,1195],[418,1195],[414,1199],[418,1199]])stationBeam(x,7.7,z,x,15.3,z,.13,'red');
 for(let j=0;j<3;j++){
  const y=7.9+j*2.3;stationBeam(414,y,1199,418,y+2.3,1199,.09,'red');stationBeam(418,y,1199,414,y+2.3,1199,.09,'red');
  stationBeam(414,y,1195,414,y+2.3,1199,.09,'red');
 }
 // Twin apparatus doors are set back behind a continuous street-facing masonry frame.
 // The recessed shutters remain on the original wall. The projecting cheeks reveal the depth.
 stationBox(420.98,6.42,1205.55,22.97,2.74,.55,'stationBrick');
 stationBox(420.98,7.67,1205.7,23.21,.24,.75,'fortConcrete');
 stationBox(420.98,7.91,1205.64,23.5,.19,.88,'iron');
 for(const x of [409.75,420.79,432.17]){
   stationBox(x,4.05,1205.88,.55,7.35,.40,'stationBrick');
   stationBox(x,4.95,1205.96,.68,.22,.51,'stone');
 }
 stationBox(431.61,1.18,1206.12,.89,2.34,.08,'shadow');
 stationBox(431.60,1.13,1206.17,.71,2.14,.045,'doors');
 stationBox(420.98,7.42,1205.72,23.13,.18,.71,'stationBrick');
 for(const [x,width] of [[410.87,2.72],[420.84,2.48],[430.94,3.10]]){
  stationBox(x,2.5,1205.55,width,5,.61,'stationBrick');
  stationBox(x,.3,1205.62,width+.08,.60,.69,'fortConcrete');
 }
 for(const bay of [415.94,425.72]){
  stationBox(bay,4.88,1205.55,7.56,.42,.70,'stationBrick');
  stationBox(bay,4.62,1205.49,7.25,.14,.63,'fortConcrete');
  for(const side of [-1,1])stationBox(bay+side*3.58,2.31,1205.48,.19,4.61,.53,'stationBrick');
  stationBox(bay,2.28,1205.405,7.10,4.52,.055,'fireDoor');
  for(let f=0;f<5;f++)stationBox(bay,.41+f*.85,1205.448,7.04,.032,.037,'iron');
  for(let j=0;j<4;j++)stationBox(bay-2.55+j*1.70,3.16,1205.462,1.52,.52,.043,'glass');
  for(const u of [-3.52,3.52])stationBox(bay+u,.086,1207.1,.055,.015,2.64,'trim');
  for(const u of [-2.02,0,2.02]){
   const wx=bay+u;
   stationBox(wx,6.16,1205.84,1.50,1.95,.11,'shadow');
   stationBox(wx,6.15,1205.9,1.28,1.80,.035,'glass');
   stationBox(wx,6.34,1205.94,1.28,.065,.08,'iron');
   stationBox(wx,5.14,1205.96,1.70,.17,.39,'fortConcrete');
   stationBox(wx,7.17,1205.88,1.76,.18,.21,'stationBrick');
  }
 }
 for(let k=0;k<3;k++){
  const z=1193.8+k*4.2;
  stationBox(432.57,5.89,z,.16,2.18,1.82,'shadow');
  stationBox(432.69,5.93,z,.095,1.94,1.58,'glass');
  stationBox(432.75,4.80,z,.42,.18,1.98,'stone');
 }
 // Projecting loading door head, pedestrian entrance and sill break up the annex front.
 stationBox(434.03,1.25,1205.14,1.15,2.48,.21,'shadow');
 stationBox(434.02,1.20,1205.27,.95,2.31,.10,'doors');
 for(let k=0;k<13;k++)stationBox(439.4,.26+k*.235,1205.3,3.66,.043,.085,'trim');
 stationBox(439.4,3.40,1205.32,4.18,.26,.36,'firePlaster');
 // Each recess has its own depth. UVs share a continuous frontal survey.
 function elevationPanel(name,x,y,z,w,h,u0,v0,u1,v1,rotation=0){
  const g=new T.PlaneGeometry(w,h);
  const uv=g.attributes.uv;
  for(let k=0;k<uv.count;k++)uv.setXY(k,u0+uv.getX(k)*(u1-u0),v0+uv.getY(k)*(v1-v0));
  g.scale(rotation?1:.70,1.72,1);
  addGeo(g,'fireElevation'+name,stationX(x),y*1.72,z,0,rotation);
 }
 function mainPatch(l,t,r,b,z){
  const sx=23.0/146,sy=7.95/125;
  elevationPanel('main',409.48+((l+r)/2-59)*sx,(241-(t+b)/2)*sy,z,(r-l)*sx,(b-t)*sy,
   (l-59)/146,(241-b)/125,(r-59)/146,(241-t)/125);
 }
 for(const [a,b] of [[59,79],[122,142],[184,205]])mainPatch(a,179,b,241,1206.53);
 mainPatch(79,179,122,188,1206.53);mainPatch(142,179,184,188,1206.53);
 mainPatch(79,188,122,241,1206.22);mainPatch(142,188,184,241,1206.22);
 mainPatch(59,116,205,144,1206.52);mainPatch(59,172,205,179,1206.52);
 for(const [l,r] of [[59,78],[123,140],[186,205]])mainPatch(l,144,r,172,1206.52);
 mainPatch(78,144,123,172,1206.18);mainPatch(140,144,186,172,1206.18);
 for(const px of [79,122,142,184]){
  const x=409.48+(px-59)*23/146;
  stationBox(x,1.68,1206.35,.11,3.37,.34,'stationBrick');
 }
 elevationPanel('west',406.58,1.83,1205.12,5.67,3.66,0,0,1,1);
 const annexPatch=(a,b,z)=>elevationPanel('annex',432.48+(a+b)*.5*10.65,1.97,z,
  (b-a)*10.65,3.94,a,0,b,1);
 annexPatch(0,.50,1205.67);annexPatch(.50,.94,1205.44);annexPatch(.94,1,1205.67);
 elevationPanel('rear',432.63,3.89,1198,13.78,7.78,0,0,1,1,Math.PI/2);
 for(const [x,z,k] of [[435.5,1206.4,'plastic_crate_01'],[443,1205.8,'cardboard_box_01'],[446,1205.8,'metal_trash_can']])prop(k,x,.03,z,1.1,.13);
 stationBox(431,.062,1209.7,56,.035,4.6,'apron');
 stationBox(421,.062,1206.5,22.8,.035,1.8,'bayFloor');
 for(const [x,z,w,d,h] of [[421,1198,22.85,13.85,7.65],[438,1199,9.8,11.8,3.95],[450,1198,13.25,13.85,7.65]]){
  const roofBox=x===450?box:stationBox;
  // The membrane sits above the structural cap and inside its brick parapet.
  roofBox(x,h+.15,z,w-.18,.10,d-.18,x===438?'annexRoof':x===421?'stationRoof':'roof');
  if(x===450)for(let u=-w/2+1.1;u<w/2-.5;u+=2.4)
   roofBox(x+u,h+.207,z,.038,.014,d-.40,'iron');
  for(const side of [-1,1]){
   roofBox(x,h+.21,z+side*d/2,w,.45,.23,'brick');
   roofBox(x+side*w/2,h+.21,z,.23,.45,d,'brick');
  }
  if(x===421){
   for(const [dx,dz] of [[2.5,-3.7],[5.2,-4.85],[6.25,.85]]){
    roofBox(x+dx,h+.27,z+dz,1.67,.13,1.12,'iron');
    roofBox(x+dx,h+.35,z+dz,1.43,.07,.91,'roof');
   }
  }else{
   roofBox(x+w*.27,h+.34,z-d*.28,1.38,.24,1.50,'iron');
   roofBox(x+w*.27,h+.52,z-d*.28,1.14,.15,1.24,'trim');
  }
 }
 for(const [x,z,w,d,h] of [[439,1187.12,17,12,3]])block(x,z,w,d,h,'brick',false);
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
