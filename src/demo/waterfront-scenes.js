import * as T from 'three';
import {courtSteps,courtTreadHeight} from './pioneer-floor.js';

// The tower cores, glazing and escape stairs are separate so daylight shows
// through the damaged bays instead of reading as a pair of solid boxes.
export function waterfrontScenes({box,beam,prop,addGeo,cylinder,buildings,tree,canGrow,sites}){
  // Place the two middle-distance silhouettes along streets outside the hero parcels.
  // Site and carriageway clearances stay in world metres, including unbuilt POIs.
  function citySilhouette(lots){
    for(const [cx,cz,w,d,floors] of lots){
      const clearance=.5*Math.hypot(w,d)+1;
      if(!canGrow(cx,cz,clearance)||sites.some(p=>Math.hypot(cx-p.x,cz-p.y)<clearance+16))continue;
      buildings.push([cx,cz,w,d]);
      const h=3.25*floors,mat=floors%3?'wall':'brick';
      box(cx,h/2,cz,w,h,d,mat);
      for(let k=1;k<floors;k++){
        const y=k*3.25+.4;
        for(const side of [-1,1]){
          box(cx,y,cz+side*(d/2+.03),w-.72,1.72,.10,'glass');
          box(cx+side*(w/2+.03),y,cz,.10,1.72,d-.72,'glass');
        }
      }
      for(let j=1;j<4;j++){
        const px=cx+w*(j/4-.5),pz=cz+d*(j/4-.5);
        for(const side of [-1,1]){
          box(px,h/2,cz+side*(d/2+.09),.35,h,.20,mat);
          box(cx+side*(w/2+.09),h/2,pz,.20,h,.35,mat);
        }
      }
      box(cx,h+.19,cz,w+.48,.38,d+.48,'layers');
      box(cx+w*.14,h+1.01,cz-d*.12,w*.31,1.65,d*.38,'iron');
      if(cz>1000 && cx>800){
        const uvx=cx-w*.28,uvz=cz+d*.24;
        box(uvx,h+.83,uvz,2.35,.87,2.0,'roof');
        for(const off of [-.66,.63]){
          cylinder(uvx+off,h+1.34,uvz,.47,.48,.16,'iron',10);
          for(let i=-2;i<=2;i++)box(uvx+off,h+1.44,uvz+i*.14,.69,.025,.045,'shadow');
        }
        box(uvx+2.42,h+.65,uvz,2.65,.39,.59,'trim');
        cylinder(cx+w*.28,h+1.15,cz+d*.28,.22,.28,1.65,'iron',8);
      }
    }
  }
  citySilhouette([
    [875,952,10,13,7],[894,946,13,14,9],[915,929,13,11,13],[934,941,12,15,10],
    [949,915,15,15,12],[968,909,12,13,16],[987,924,17,12,8],[908,966,16,12,6],
    [884,1087,12,10,4],[906,1077,14,12,6],[924,1101,11,12,4],[949,1117,16,11,5],
    [937,1080,11,13,8],[956,1069,13,10,6],[866,1096,15,12,3],[906,1048,13,14,7],
    [931,1039,16,12,9],[964,1018,14,13,9],[998,1024,12,13,8],[990,1066,14,12,4],
    [847,998,17,14,6],[862,987,13,15,8],[872,966,12,12,10],[905,985,13,12,9],
    [944,1004,15,13,7],[968,985,17,11,8],[985,978,16,13,11],[1011,989,12,12,7],
    [842,1042,17,11,5],[861,1056,13,12,4],[878,1034,11,15,5],
    [858,941,13,11,6],[895,916,12,10,9],[930,902,15,11,13],
    [263,1075,11,16,8],[281,1071,12,14,10],[301,1063,11,16,11],[320,1058,14,14,8],
    [270,1100,13,14,10],[292,1092,12,12,12],[313,1087,16,11,9],[333,1081,13,15,10],
    [202,1078,12,14,4],[218,1090,11,13,5]
  ]);
  for(const [cx,cz,floors,lean] of [[884,1135,15,.74],[913,1153,14,0]]){
    const w=16,d=13;
    buildings.push([cx,cz,w+lean*floors,d]);
    for(let level=0;level<floors;level++){
      const x=cx+lean*level,y=level*3.25;
      box(x,y+.13,cz,w,.26,d,'layers');
      box(x+1.2,y+1.64,cz-1,5,3.23,4.5,'wall');
      // Sparse remnants are clustered into rooms with gaps at damaged bays.
      if((level+Math.floor(cx))%4!==1){
        const qx=x-3.75, qz=cz+1.4*Math.sin(level*2.58);
        box(qx,y+1.13,qz-1.35,3.68,1.92,.14,'wall');
        box(qx+.7,y+2.17,qz-1.35,1.95,.16,.21,'wood');
        box(qx-.63,y+.96,qz+.24,2.2,.12,.96,'wood',0,.12);
        for(const dx of [-.90,.90])box(qx-.63+dx,y+.57,qz+.22,.14,.74,.68,'iron');
        box(qx-.45,y+1.31,qz+.18,.66,.54,.09,'shadow',0,.14);
        if(level%2===0){
          box(qx+1.50,y+.96,qz+.81,.77,1.64,.56,'iron');
          for(let n=0;n<3;n++)box(qx+1.5,y+.55+n*.40,qz+1.11,.53,.024,.031,'shadow');
        }
      }
      for(const side of [-1,1])for(let col=0;col<6;col++){
        const xx=x-w/2+col*w/5, zz=cz+side*d/2;
        beam(xx,y,zz,xx+lean,y+3.25,zz,.20,'iron');
        if(col===5)continue;
        // A connected impact scar runs diagonally through the curtain wall.
        const scar=Math.abs(col-(lean?1.3:3.1)-1.25*Math.sin(level*.46+side));
        const stress=Math.abs(Math.sin((level+1)*17.33+col*5.71+cx+side));
        const failed=scar<1.0 && level>2 && level<(lean?12:9);
        const mid=xx+w/10;
        if(!failed && stress>.27){
          box(mid,y+1.8,zz,w/5-.23,2.44,.13,'towerGlass');
        }else if(stress>.45){
          const corners=[-.5,-.5,.49,-.5,.49,.36,.08,-.16,-.18,.06];
          const shape=new T.Shape();
          for(let k=0;k<corners.length;k+=2){
            const px=corners[k]*(w/5-.24),py=corners[k+1]*2.44;
            if(k===0)shape.moveTo(px,py);else shape.lineTo(px,py);
          }
          shape.closePath();
          addGeo(new T.ShapeGeometry(shape),'towerGlass',mid,y+1.8,zz,0,side<0?Math.PI:0);
        }
        if(!failed || stress>.76)box(mid,y+.46,zz,w/5-.16,.48,.19,stress>.8?'brick':'iron');
        if(failed && stress>.71){
          beam(xx+.12,y+2.96,zz,mid+.70,y+.48,zz+.23*side,.08,'iron');
          prop('nettle_plant',mid,y+.27,zz-.23*side,2.75+stress,level);
        }
      }
      for(const side of [-1,1])for(let j=1;j<4;j++){
        const xx=x+side*w/2,zz=cz-d/2+j*d/4;
        beam(xx,y,zz,xx+lean,y+3.25,zz,.17,'iron');
        const stress=Math.sin(j*3.17+level*.66+cx*.61+side);
        if(stress<.62)box(xx,y+1.6,zz-d/8,.12,2.75,d/4-.18,'towerGlass');
        else if(stress>.87){
          box(xx,y+.42,zz-d/8,.15,.5,d/4-.21,'brick');
          beam(xx,y+.62,zz-d/4,xx+.28*side,y+2.6,zz-.28,.08,'iron');
        }
      }
      const ex=x-w/2-.94,dir=level%2?1:-1;
      box(ex,y+.17,cz+dir*2.8,2.1,.22,1.57,'iron');
      for(let i=0;i<13;i++)box(ex,y+(i+1)*.25,cz+dir*(2.5-i*.4),1.55,.10,.43,'iron');
      beam(ex+.83,y+1.2,cz+dir*2.5,ex+.83,y+4.2,cz-dir*2.3,.075,'iron');
      if(level%3===1)prop('shrub_03',x-4,y+.29,cz+4,1.8,level);
      if(level%3!==0){
        const corner=x-4+(level*3.1)%8,front=cz+d/2;
        prop('nettle_plant',corner,y+.26,front-.30,2.8,level*.7);
        prop('fern_02',corner+.68,y+.20,front-.21,2.7,level);
        box(corner,y-.15,front+.08,.18+(level%4)*.18,.55+(level%3)*.39,.09,'wood');
      }
    }
  }
  // Saplings rooted on broken perimeter slabs silhouette against the glazed offices.
  for(const [x,z,lev,side] of [[884,1135,5,-1],[884,1135,8,-1],[884,1135,11,1],[913,1153,4,-1],[913,1153,7,-1],[913,1153,10,-1]]){
    const edge=x+(x===884?lev*.74:0)+side*7.45,base=lev*3.25+.27;
    for(let trail=0;trail<5;trail++){
      const rootZ=z-3+trail*.7;
      const len=2.5+2.3*(.5+.5*Math.sin(lev*8.7+trail*4.1));
      let ax=edge+side*.60,ay=base+.18,az=rootZ;
      for(let k=1;k<=7;k++){
        const t=k/7,bx=edge+side*(.67+.16*Math.sin(t*4+lev)),by=base-len*t,bz=rootZ+.26*Math.sin(4*t+trail);
        beam(ax,ay,az,bx,by,bz,.046,'bark');
        // Photographic cutouts follow the dropping stem and taper at its tip.
        const g=new T.PlaneGeometry((1.15-t*.50),1.07-t*.31);
        addGeo(g,'canopy',bx+.02*side,by+.13,bz,.15*Math.sin(k),side*Math.PI/2,.32*Math.sin(trail+k));
        ax=bx;ay=by;az=bz;
      }
    }
    for(let k=0;k<3;k++){
      const zz=z-3+k*1.37;
      prop('shrub_03',edge,base,zz,4.8+k*.57,k+.7*lev);
      prop('fern_02',edge+.5*side,base,zz+.41,3.4,k);
    }
  }
  for(const [x,z,h] of [[879,1125,8],[900,1138,6],[918,1141,7],[923,1160,7],[884,1122,9],[910,1127,6],[927,1129,8],[846,1112,8],[873,1113,7],[935,1111,9]]){
    if(canGrow(x,z,2.1))tree(x,z,h);
  }
  // A damaged high-level service crossing joins the nearest exposed floor edges.
  const start=[896.8,22.98,1141.44],end=[905.1,22.98,1146.54];
  for(const side of [-.68,.68]){
    beam(start[0],start[1],start[2]+side,end[0],end[1],end[2]+side,.20,'iron');
    beam(start[0],start[1]+1.05,start[2]+side,end[0],end[1]+1.05,end[2]+side,.072,'iron');
  }
  for(let k=0;k<=12;k++){
    const f=k/12,x=start[0]+(end[0]-start[0])*f,z=start[2]+(end[2]-start[2])*f;
    if(k!==4&&k!==8)box(x,23.11,z,.83,.13,1.56,'wood',0,-.55);
    if(k%3===0)for(const side of [-.68,.68])box(x,23.5,z+side,.06,1.07,.06,'iron');
  }
  for(let x=852;x<883;x+=3){
    const t=(x-852)/31, y=21.8+t*2.8;
    box(x,y,1138.6,2.96,.57,2.05,'layers',0,0,.091);
    for(const z of [1137.7,1139.5])beam(x-1.5,y+.31,z,x+1.5,y+.60,z,.12,'iron');
  }
  for(const x of [854,867])box(x,10.8,1138.6,.86,21.6,1.1,'layers');
  for(let i=0;i<24;i++){
    const x=876+(i*17)%46,z=1129+(i*11)%31;
    const h=1.2+(i%5)*.63;
    box(x,.20,z,2.7,.35,1.34,'layers',.13,1.1*i,.09);
    prop(i%3?'shrub_03':'fern_02',x,.20,z,h*1.8,i);
  }

  // Service hut and bridge at the far end of the two intersecting greenhouse bays.
  box(639.7,4.61,251.45,9.25,3.65,.32,'brick');
  for(const side of [-1,1])box(639.7+side*4.55,4.61,253.34,.26,3.65,3.86,'brick');
  box(639.7,6.52,253.34,9.70,.22,4.46,'roof');
  box(639.7,2.85,253.38,9.41,.27,4.30,'layers');
  box(639.7,6.04,255.24,9.33,.74,.26,'brick');
  for(const x of [635.2,637.35,640.3,643.0,644.24])box(x,4.4,255.26,.25,3.12,.29,'brick');
  for(const x of [636.25,638.81]){
    box(x,3.31,255.25,1.89,.89,.29,'brick');
    box(x,4.69,255.07,1.79,1.86,.10,'glazing');
    box(x,4.69,255.21,.065,1.91,.08,'iron');
  }
  box(642.96,4.35,254.36,.10,2.71,1.69,'doors',0,-.36);
  for(const x of [635.7,637.6,640.4,643.9])prop('nettle_plant',x,6.63,254.73,1.65,x);
  for(let x=626;x<641;x+=2){
    box(x,2.66,254.95,2.05,.24,1.52,'wood');
    box(x,3.16,255.63,.075,.98,.08,'iron');
    box(x,3.65,255.63,2.08,.07,.07,'iron');
  }
  for(let i=0;i<60;i++){
    const a=i*2.39996,r=2.5+((i*7)%101)/101*8.6;
    const x=631+Math.cos(a)*r,z=265+Math.sin(a)*r;
    if(x>640.75&&x<643.2)continue;
    prop(i%4?'fern_02':'shrub_03',x,.04,z,1.8+(i%7)*.42,a);
  }
  for(const x of [620,624])for(let z=254;z<=278;z+=3){
    beam(x,5.4,z,x,5.4,z+3,.25,'iron');
    if(z%2===0)beam(x,2.2,z,x,5.4,z,.12,'iron');
  }
  for(let k=0;k<19;k++){
    const x=619+(k*7)%30,z=251-((k*11)%7);
    prop('shrub_03',x,.02,z,5.8+(k%5)*.86,k*1.9);
  }
  for(const [x,z,h] of [[620,251,8],[623,249,10],[630,248,9],[636,248,8],[649,245,9],[658,245,10],[615,263,8]])tree(x,z,h);
  for(let k=0;k<28;k++){
    const x=627+(k*7.3)%12,z=251+(k*3.17)%20;
    prop(k%3?'fern_02':'nettle_plant',x,.08,z,4.2+(k%6)*.78,k);
  }
  for(const x of [622,626,630,634,638]){
    for(let i=0;i<10;i++){
      const u=Math.PI*i/10,v=Math.PI*(i+1)/10;
      beam(x,1+11*Math.sin(u),263+11*Math.cos(u),
        x,1+11*Math.sin(v),263+11*Math.cos(v),.09,'iron');
    }
  }

  // Keep shop depths inside the gallery strip; dark recesses frame the light court.
  for(const [x,z,depth] of [[425.72,1335,8.8],[425.72,1326.0,8.6],[437.72,1333.4,10.3],[437.72,1321.7,11.1]]){
    const side=x<430?1:-1,front=x+side*1.06;
    box(x-side*.85,-1.49,z,.23,3.11,depth,'brick');
    box(x,-.39,z,2.46,.36,depth,'wood');
    box(x,.08,z,2.5,.48,depth+.25,'layers');
    box(front,-2.60,z,.23,1.66,depth,'wood');
    box(front+side*.22,-1.73,z,.62,.19,depth+.19,'iron');
    for(const fraction of [-.48,-.16,.20,.49]){
      box(front,-1.05,z+fraction*depth,.19,1.31,.14,'iron');
    }
    if(x<430){
      box(front,-1.1,z+.24*depth,.075,1.09,depth*.42,'glass');
      box(front,-2.75,z-.24*depth,.12,1.21,depth*.41,'doors');
    }else{
      box(x,-1.63,z+.22*depth,1.33,.21,depth*.38,'wood');
      prop('wooden_crate_01',x,-1.52,z+.2*depth,1.7,z);
    }
  }
  // Two foreground galleries frame the descent and one overhead street closes the sky.
  for(const [x,d,w] of [[425.9,12,2.7],[437.4,15,3.3]]){
    box(x,-.18,1333,w,.53,d,'layers');
    for(let zz=1328;zz<1340;zz+=3.15){
      box(x+(x<430?1.1:-1.25),-1.88,zz,.34,3.48,.36,'stone');
      prop('fern_02',x+(x<430?1.30:-1.59),-3.57,zz,1.4,zz);
    }
  }
  box(431.65,1.55,1334.2,13.6,.64,3.2,'layers');
  for(const z of [1332.65,1335.75]){
    box(431.65,1.12,z,13.61,.29,.24,'iron');
    beam(424.9,2.64,z,438.4,2.64,z,.08,'iron');
    for(let x=425;x<438;x+=1.85)box(x,2.24,z,.075,.79,.075,'iron');
  }
  for(let k=0;k<26;k++){
    const x=k%2?427.1:435.9,z=1301+(k*3.35)%32;
    prop(k%3?'fern_02':'nettle_plant',x+(k%3)*.21,-3.61,z,1.9+(k%5)*.54,k);
  }
  box(courtSteps.x,courtTreadHeight(courtSteps.count-1)-.105,1345.64,courtSteps.width,.21,4.09,'layers');
  for(let k=0;k<courtSteps.count;k++){
    const z=courtSteps.z+k*courtSteps.run,y=courtTreadHeight(k);
    box(courtSteps.x,y-.104,z,courtSteps.width,.208,courtSteps.run+.006,'layers');
    box(courtSteps.x,y-.038,z-courtSteps.run/2+.045,courtSteps.width,.074,.09,'iron');
    for(const x of [428.50,432.0]){
      if(k%3===0||k===courtSteps.count-1)box(x,y+.48,z,.072,.96,.072,'iron');
      if(k>0)beam(x,courtTreadHeight(k-1)+.96,z-courtSteps.run,x,y+.96,z,.073,'iron');
    }
  }

  // The low pontoon, inclined gangway and tied skiff are separate silhouettes.
  box(215.6,.30,912.25,15.6,.69,26.5,'dockDeck');
  for(let i=0;i<21;i++){
    const z=900+i*1.23;
    box(215.6,.656,z,15.52,.012,.039,'shadow');
    if(i%4===0){
      cylinder(207.9,-.25,z,.26,.35,2.6,'wood');
      box(208.05,.85,z,.39,.48,.42,'iron');
    }
  }
  box(207.78,.28,912.25,.32,.55,26.45,'wood');
  box(204,.28,908.5,4.3,.42,10.4,'dockDeck');
  box(208.2,.57,908.2,4.85,.18,1.9,'dockDeck',0,0,.105);
  for(let i=0;i<9;i++)box(206.15+i*.49,.48+i*.052,908.2,.07,.13,1.92,'trim');
  for(const z of [903.5,913.5])cylinder(202.2,.64,z,.19,.21,1.8,'wood');
  const hull=new T.Shape();
  hull.moveTo(0,2.5);hull.bezierCurveTo(-.8,1.9,-1,0,-.7,-2.05);hull.lineTo(.7,-2.05);hull.bezierCurveTo(1,0,.8,1.9,0,2.5);
  addGeo(new T.ExtrudeGeometry(hull,{depth:.36,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.13,bevelThickness:.12}),'iron',200.7,.0,908.5,-Math.PI/2);
  addGeo(new T.ShapeGeometry(hull).scale(.84,.89,1),'shadow',200.7,.50,908.5,-Math.PI/2);
  for(const z of [907.5,909.1])box(200.7,.56,z,1.48,.10,.26,'wood');
  beam(200.7,.46,906.4,202.2,.88,903.5,.04,'wood');
  // Open loading shed and a row of market canvas roofs running away from the viewer.
  for(const z of [899,905,911,917,923]){
    for(const x of [224,232])box(x,4.6,z,.31,9.20,.30,'iron');
    beam(224,8.75,z,228,10.3,z,.21,'iron');
    beam(228,10.3,z,232,8.75,z,.21,'iron');
    if(z!==923){
      box(226,9.54,z+3,4.40,.15,6.04,'roof',0,0,.37);
      box(230,9.54,z+3,4.40,.15,6.04,'roof',0,0,-.37);
      box(232,3.53,z+3,.17,6.8,5.92,'wood');
      for(let col=0;col<4;col++){
        box(224.05,7.17,z+.75+col*1.50,.11,2.62,1.36,(col+z)%5?'glass':'shadow');
        box(224.02,5.78,z+.75+col*1.50,.16,.16,1.52,'iron');
      }
      box(231.9,7.82,z+3,.18,2.10,5.95,'iron');
      box(221.7,3.51,z+3,4.74,.09,5.71,'trim',0,0,.21);
      prop('wooden_crate_01',222,.75,z+2.4,.87,z);
    }
  }
  // Street-end gable and the screen of tall metal-framed windows sit above the canopies.
  box(228,4.73,899.05,7.85,1.37,.22,'wood');
  box(228,8.55,899.05,7.85,.48,.23,'iron');
  for(let k=0;k<5;k++){
    const x=224.80+k*1.58;
    if(k!==3)box(x,6.91,899.04,1.42,2.77,.115,'glass');
    box(x-.77,6.92,898.96,.12,2.99,.18,'iron');
    box(x,7.20,898.96,1.50,.09,.19,'iron');
  }
  for(let j=0;j<4;j++){
    const z=904+j*5.6;
    box(218,.99,z,4.15,.14,2.33,'wood');
    for(const dx of [-1.8,1.8])for(const dz of [-.9,.9])box(218+dx,.85,z+dz,.11,.42,.11,'iron');
    prop('plastic_crate_01',218.2,1.06,z,1,1+j);
    prop('wooden_crate_01',216.65,.67,z+1.12,.76,j);
    box(214.9,2.6,z,.12,3.85,.13,'wood');
    for(let i=0;i<5;i++){
      const droop=.1*Math.sin(i*Math.PI/4);
      box(218.2,4.40-droop,z-2.23+i*1.1,6.75,.075,1.15,j%3===1?'roof':'trim',0,0,.16);
      if(i<4)box(215.0,3.81-droop,z-1.7+i*1.1,.09,.36,1.07,j%3===1?'roof':'trim',0,0,.14);
    }
    // Reclaimed produce trays sit on the front lip beneath the awning.
    for(let bin=0;bin<3;bin++){
      const bx=216.85+bin*.88,bz=z-.65;
      box(bx,1.13,bz,.75,.09,.62,'wood');
      for(const side of [-1,1]){
        box(bx+side*.35,1.27,bz,.055,.23,.64,'wood');
        box(bx,1.27,bz+side*.30,.72,.23,.043,'wood');
      }
    }
    for(const bz of [z-2.03,z+2.03]){
      box(215.02,2.20,bz,.13,3.1,.13,'wood');
      beam(215.02,2.80,bz,215.95,3.84,bz,.08,'wood');
    }
    box(215.12,3.32,z-.8,.1,.65,1.12,'wood');
    prop('metal_jerrycan',216.9,1.07,z,.89,j+1);
    prop('barrel_03',219.4,.67,z+2.1,1.02,j+.5);
    prop('shrub_03',224.25,.68,z+2.6,1.55,j+.16);
  }
  for(let i=0;i<6;i++){
    const z=902+i*4;
    cylinder(209.4,3.2,z,.085,.12,5.4,'iron');
    if(i<5)beam(209.4,5.72,z,209.4,5.64,z+4,.035,'shadow');
  }
  // Small harbor derricks across the slip frame the open water behind the market.
  const inlet=new T.Shape();
  for(const [i,[x,z]] of [[45,937],[209,937],[224,951],[218,971],[228,998],[220,1038],[45,1038]].entries()){
    if(i===0)inlet.moveTo(x-140,986-z);else inlet.lineTo(x-140,986-z);
  }
  inlet.closePath();
  addGeo(new T.ShapeGeometry(inlet),'water',140,.13,986,-Math.PI/2);
  for(const [ax,az,bx,bz] of [[209,937,224,951],[224,951,218,971],[218,971,228,998],[228,998,220,1038]]){
    beam(ax,.43,az,bx,.43,bz,.76,'stone',1.25);
  }
  for(const [x,z] of [[224,965],[226,980],[227,1006]]){
    box(x,1.67,z,4.9,3.2,7.45,'iron');
    box(x,3.34,z,5.22,.18,7.76,'roof',0,0,.04);
    box(x-2.49,1.5,z,.11,2.6,2.8,'doors');
  }
  for(const [x,z,h] of [[197,956,13],[202,968,16]]){
    box(x,.56,z,4.7,.86,4.25,'layers');
    for(const side of [-1,1]){
      beam(x+side*1.7,.92,z-.9,x+side*.54,h,z,.22,'iron');
      beam(x+side*1.7,.92,z+1,x+side*.54,h,z,.22,'iron');
      beam(x+side*.54,h,z,x-6.4+side*.32,h+3.3,z+4.6,.19,'iron');
    }
    beam(x-6.4,h+3.3,z+4.6,x-6.4,3.2,z+4.6,.055,'iron');
    for(let y=2;y<h;y+=2)beam(x-1.18,y,z,x+1.18,y+1.8,z,.105,'iron');
  }
}
