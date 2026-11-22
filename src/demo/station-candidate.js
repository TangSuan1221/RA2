import * as T from 'three';
const {MeshStandardMaterial,PlaneGeometry}=T;


// The workshop shares a party wall with the white annex. Its open street bay
// uses full-depth shelves so its contents still read from the driver's seat.
function firehouseShop({box,addGeo,prop,materials,texture}){
  const left=439.94,width=10.65,front=1206.25,center=left+width/2;
  for(const [name,file] of [['salvageWindow','salvage-sash'],['salvageTransom','salvage-shopfront']]){
    materials[name]=new MeshStandardMaterial({
      map:texture('evac-art/'+file+'.webp',true),roughness:.47,metalness:.12
    });
  }
  box(center,7.5,front-5.9,width,8.5,11.8,'brick');
  box(center,11.79,front-5.9,width+.14,.18,11.95,'annexRoof');
  for(const edge of [-1,1]){
    box(center+edge*(width/2-.24),1.72,front-.85,.48,3.44,1.7,'brick');
    box(center+edge*width/2,11.93,front-5.9,.10,.26,11.95,'layers');
  }
  box(center,1.67,front-1.12,width,3.34,.19,'shadow');
  box(center,3.32,front+.025,width,.28,.26,'iron');
  addGeo(new PlaneGeometry(width-.8,.48),'salvageTransom',center,3.67,front+.16);
  for(const y of [5.56,9.20]){
    for(let col=0;col<4;col++){
      const x=left+1.68+col*2.42;
      box(x,y,front+.01,1.57,2.4,.17,'iron');
      addGeo(new PlaneGeometry(1.38,2.20),'salvageWindow',x,y,front+.105);
      box(x,y-1.2,front+.12,1.74,.13,.34,'stone');
    }
  }
  for(let i=0;i<3;i++){
    const x=left+1.7+i*3.25;
    prop('painted_wooden_shelves',x,0,front-.36,1,0);
    prop(i===1?'metal_jerrycan':'wooden_crate_01',x+.54,.06,front+.51,.86,i*.27);
  }
  for(let i=0;i<5;i++)
    prop('plastic_crate_01',left-2.65+i*.61,.07,front+.35+(i%2)*.32,.97,.13*i);
}


function addEngineCompanyStreet({box,beam,block,canGrow,materials,texture,sizes}){
  materials.factorySash=new MeshStandardMaterial({color:0x526767,roughness:.52});
  materials.factoryPane=new MeshStandardMaterial({color:0x27494b,roughness:.32,metalness:.17});
  materials.curbPaint=new MeshStandardMaterial({color:0x98483d,roughness:.89});
  materials.streetStripe=new MeshStandardMaterial({color:0xb19860,roughness:.92});
  materials.serviceAsphalt=new MeshStandardMaterial({
    map:texture('textures/road_damaged/road_damaged_diff_2k.jpg',true),
    color:0x878781,roughness:.85
  });
  sizes.serviceAsphalt=['road_damaged',4.2];
  // Reclad the two visible faces of the existing three-storey factory at (385,1185).
  for(const [cx,cz,angle,length,bays] of [[394.53,1185,Math.PI/2,25,6],[385,1198.04,0,18,4]]){
    const width=length/bays;
    function panel(u,y,out,w,h,d,mat){
      box(cx+Math.cos(angle)*u+Math.sin(angle)*out,y,
        cz-Math.sin(angle)*u+Math.cos(angle)*out,w,h,d,mat,0,angle);
    }
    panel(0,5.6,0,length+.16,11.2,.36,'firePlaster');
    for(let floor=0;floor<3;floor++){
      const y=2.05+floor*3.7;
      panel(0,y-1.36,.24,length+.18,.28,.33,'layers');
      for(let i=0;i<bays;i++){
        const u=(i+.5)*width-length/2;
        panel(u,y,.23,width-.44,2.36,.15,'factoryPane');
        panel(u,y+.30,.34,width-.43,.065,.085,'factorySash');
        for(const offset of [-.25,0,.25])panel(u+width*offset,y,.34,.07,2.36,.085,'factorySash');
      }
    }
  }
  // Continuous industrial hardstand sits below the driving surface and its markings.
  // The front and rear streets retain their original heights through the intersections.
  box(410,.027,1174,176,.046,130,'apron');
  box(401,.044,1151,153,.031,8,'serviceAsphalt');
  box(399.25,.054,1185,7.6,.038,72,'serviceAsphalt');
  for(const xx of [399.18,399.42])box(xx,.082,1182,.085,.008,54,'streetStripe');
  box(394.98,.095,1185,1.23,.17,36,'forecourt');
  // A paved loading court wraps around the end wall of the factory.
  for(let i=0;i<7;i++)for(let j=0;j<3;j++)
    box(374+i*3.16,.071,1199.76+j*3.16,3.14,.052,3.14,'forecourt');
  for(let i=0;i<12;i++){
    box(395.58,.15,1168.5+i*3,.17,.18,2.97,'stone');
    if(i%5!==2)box(395.68,.205,1168.5+i*3,.035,.07,2.86,'curbPaint');
  }
  // Slab edges recede from the bays into the open driveway, with a flush gutter at the road.
  for(let i=0;i<15;i++){
    const x=404.7+i*3.45;
    for(const [z,d] of [[1206.91,2.25],[1209.59,3.07]])
      box(x,.097,z,3.425,.028,d,'apron');
    box(x,.091,1211.35,3.425,.025,.36,'layers');
  }
  for(const x of [414.25,425.62]){
    for(const offset of [-1.55,1.55])box(x+offset,.119,1208.29,.065,.012,1.24,'trim');
    box(x,.119,1208.92,3.14,.012,.065,'trim');
  }
  // A late-autumn street tree on the opposite pavement. Each fork grows from its parent.
  const trunk=[424.8,0,1230.6];
  function limb(start,length,radius,heading,spread,depth,seed){
    const end=[start[0]+Math.cos(heading)*length*spread,start[1]+length,
      start[2]+Math.sin(heading)*length*spread];
    beam(...start,...end,radius,'bark');
    if(depth===0)return;
    limb(end,length*(.67+.06*Math.sin(seed)),radius*.67,heading+.39*Math.sin(seed),spread*.84,depth-1,seed+3);
    limb(end,length*(.57+.05*Math.cos(seed)),radius*.49,heading+1.23+Math.sin(seed)*.8,
      spread+.45,depth-1,seed+7);
  }
  beam(...trunk,424.7,3.4,1230.58,.32,'bark');
  for(let i=0;i<9;i++)limb([424.7,2.2+i*.14,1230.58],2.08+(i%3)*.24,.14,
    i*2.4,.44+(i%4)*.21,4,i*11+1);
  // Parallel rows beyond the loading court close the distant blocks around the side street.
  for(const [x,z,w,d,floors,finish] of [
    [357,1189,16,18,3,'layers'],[360,1165,21,16,4,'brick'],[379,1160,16,15,3,'wall'],
    [411,1158,14,19,3,'brick'],[436,1144,21,13,4,'layers'],[458,1158,18,14,3,'brick'],
    [410,1127,24,12,3,'brick'],[384,1127,18,13,2,'layers']
  ]){
    if(canGrow(x,z,Math.hypot(w,d)*.5))block(x,z,w,d,floors,finish,false);
  }
}

export function buildStation({box,beam,block,canGrow,materials,texture,sizes,addGeo,prop,lamp,buildings}){
 buildings.push([424.44,1198.65,16.10,15.74]);
 box(424.44,3.47,1197.65,16.04,6.94,13.70,'stationBrick');
 prop('utility_box_01',434,0,1204,.9);lamp(438,1207);
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
 addEngineCompanyStreet({box,beam,block,canGrow,materials,texture,sizes});
 firehouseShop({box,addGeo,prop,materials,texture});
}
