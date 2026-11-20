import {MeshStandardMaterial} from 'three';

export function addEngineCompanyStreet({box,beam,block,canGrow,materials,texture,sizes}){
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
