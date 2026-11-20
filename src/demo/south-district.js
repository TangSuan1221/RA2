import {Reflector} from 'three/addons/objects/Reflector.js';
import {tunnelOcclusion} from './tunnel-lighting.js';
import * as T from 'three';

export const southernViews = {
  'radio-gate': [[748.8,1.7,354.8],[747.7,1.8,339]],
  'radio-roof': [[741.8,6.2,344.3],[773,3.7,322.5]],
  'store-2': [[474,2.15,1263],[474,2.0,1253]],
  'store-3': [[488,2.15,1263],[488,2.0,1253]],
  'store-4': [[502,2.15,1263],[502,2.0,1253]],
  'store-5': [[516,2.15,1263],[516,2.0,1253]],
  'store-6': [[530,2.15,1263],[530,2.0,1253]],
};

export function southDistrict({box,beam,cylinder,prop,sign,tree,materials,texture,addGeo,buildings,canGrow,tile,owned}) {
  const aged=(name,tint,roughness=.86)=>{
    const material=new T.MeshStandardMaterial({color:tint,roughness,map:texture('textures/'+name+'/'+name+'_diff_1k.jpg',true),normalMap:texture('textures/'+name+'/'+name+'_nor_gl_1k.jpg'),normalScale:new T.Vector2(.6,.6)});
    return material;
  };
  materials.drainWall=aged('concrete_layers_02',0x827d6b);
  materials.flaking=aged('wood_peeling_paint_weathered',0x9a5f53);
  materials.shopCream=aged('worn_mossy_plasterwall',0xe4dac4);
  materials.mossWall=aged('concrete_moss',0x788068);
  materials.gutterWater=new T.MeshPhysicalMaterial({color:0x141a13,clearcoat:.3,clearcoatRoughness:.22,specularIntensity:.29,envMapIntensity:.18,roughness:.33,metalness:.07,normalMap:texture('textures/road_damaged/road_damaged_nor_gl_2k.jpg'),normalScale:new T.Vector2(.04,.07)});
  materials.canopyCloth=new T.MeshStandardMaterial({color:0xd8c4a1,roughness:.93});
  const shopFinish=(key,file)=>{
    materials[key]=new T.MeshStandardMaterial({map:texture('evac-art/store-finishes/'+file+'.webp',true),roughness:.86});
  };
  shopFinish('foodSign','food-painted-sign');
  shopFinish('stripedCanvas','food-awning-cloth');
  shopFinish('enamelPlate','clinic-enamel');
  shopFinish('outfitterSign','hunting-painted-sign');
  shopFinish('garageCladding','garage-ribbed-metal');
  shopFinish('patchedCanvas','timber-shop-canvas');
  shopFinish('stationPlate','station-number');
  materials.storeGlass=new T.MeshPhysicalMaterial({color:0x414936,roughness:.35,clearcoat:.26,metalness:.06,transparent:true,opacity:.34,depthWrite:false});

  for(const material of [materials.drainWall,materials.mossWall,materials.gutterWater])tunnelOcclusion(material);
  // Retaining walls frame the crooked lane and screen the horizon behind the transmitter.
  for(const [x,z,h,l] of [[740.4,348,3.5,20],[753.4,348,3.1,17],[736.8,339,2.1,11]]){
    box(x,h*.5,z,.48,h,l,'layers');
    box(x,h+.07,z,.65,.17,l+.15,'stone');
    for(let d=-l/2+.4;d<l/2;d+=3.5)box(x,h*.47,z+d,.59,h*.94,.085,'stone');
  }
  for(const x of [740.6,753.3]){box(x,1.46,355.4,.51,2.9,.58,'brick');box(x,2.98,355.4,.61,.16,.72,'layers');}
  box(741.1,.94,353.7,.11,1.88,3.05,'flaking',0,.18);
  for(const [x,z] of [[739.3,336],[754.5,337],[735,329],[739,323]])tree(x,z,8+(x%3));
  prop('metal_trash_can',742.4,.08,351.8,.98,.3);
  prop('trashbag',742.75,.08,351.5,.85,.7);
  for(let i=0;i<6;i++)prop('weed_plant_02',752.7,.04,345.7+i*1.35,.6+(i%3)*.18,i);

  // Operational buildings on the far side of the communications hill make a low city horizon.
  for(let i=0;i<12;i++){
    const x=786+(i%4)*15.3+Math.sin(i)*2,z=305+Math.floor(i/4)*12;
    if(!canGrow(x,z,7))continue;
    const w=9+i%3,d=6.8+i%4,h=4.7+(i*7%9);
    buildings.push([x,z,w,d]);
    box(x,h*.5,z,w,h,d,i%3===0?'brick':'layers');box(x,h+.1,z,w+.36,.23,d+.38,'stone');
    box(x+.9,h+.59,z+.8,2.55,.88,1.62,'iron');
    for(let floor=0;floor<Math.floor(h/2.6);floor++)for(let col=0;col<4;col++){
      box(x-w*.36+col*w*.24,1.82+floor*2.58,z+d*.5+.06,1.46,1.52,.13,'glass');
      box(x-w*.5-.04,1.82+floor*2.58,z-d*.32+col*d*.21,.10,1.54,.95,'glass');
    }
  }
  for(let i=0;i<4;i++){
    const x=750+i*8,z=337-i*3.4;
    cylinder(x,4.3,z,.07,.105,8.6,'iron');
    beam(x-1.8,7.45,z,x+1.8,7.45,z,.048,'iron');
    for(const side of [-1,1])beam(x+side*1.22,7.42,z-.69,x+side*1.22,7.42,z+.69,.034,'iron');
  }
  // The substation has an operations building, a detached gatehouse and fenced switchgear.
  box(1665,1.35,1266.8,3.28,2.7,2.68,'layers');
  box(1665,2.8,1266.8,3.65,.26,3.05,'roof',.035);
  box(1664.45,1.13,1268.19,1.03,2.18,.13,'doors');
  box(1665.84,1.65,1268.19,.68,.57,.13,'glass');
  for(const x of [1640,1644,1648,1652,1656,1660]){
    cylinder(x,1.5,1265,.06,.09,3,'iron');
    if(x===1660)continue;
    for(const y of [.24,1.4,2.62])beam(x,y,1265,x+4,y,1265,.035,'iron');
    for(let j=0;j<8;j++){
      beam(x+.5*j,.25,1265,x+.5*j+.49,1.24,1265,.019,'iron');
      beam(x+.5*j,1.25,1265,x+.5*j+.49,.26,1265,.019,'iron');
    }
  }
  for(let i=0;i<10;i++)prop('fern_02',1641+i*2.1,.05,1265.55,1+(i%4)*.2,i*.4);
  for(const [x,z] of [[1635,1246],[1632,1249],[1671,1243],[1638,1241]])tree(x,z,8+(x%6));

  // The freight viaduct is seen end-on beyond the northern fence of the switchyard.
  const deckAngle=Math.atan2(55,55);
  const deckPoint=(distance,lateral)=>[1674-Math.sin(deckAngle)*distance+Math.cos(deckAngle)*lateral,1251-Math.cos(deckAngle)*distance-Math.sin(deckAngle)*lateral];
  for(let section=0;section<8;section++){
    const [x,z]=deckPoint(section*9.4,0);
    box(x,7.05,z,8.45,1.05,9.45,'layers',0,deckAngle);
    for(const side of [-1,1]){
      const [px,pz]=deckPoint(section*9.4,side*4.13);
      box(px,7.93,pz,.34,.85,9.46,'stone',0,deckAngle);
    }
    if(section%2===0){
      box(x,3.33,z,1.42,6.66,1.72,'layers',0,deckAngle);
      box(x,6.32,z,6.8,.65,1.95,'layers',0,deckAngle);
      prop('shrub_03',x+3.5,0,z,3.2,section*.88);
    }
  }
  for(let i=0;i<15;i++){
    const x=1620+i*3.2,z=1227+(i%3)*1.2;
    tree(x,z,6.1+(i%4)*1.2);
    prop('shrub_03',x,0,z+3,2.1+(i%3)*.35,i);
  }
  // Two portal openings share a central pier; the western bay is a watercourse.
  const road=778,canal=772.6,start=1320;
  box(canal,.12,1327,4.5,.055,34.7,'gutterWater');
  const waterShader=Reflector.ReflectorShader;
  const waterProfile=new T.Shape();
  const bankAt=z=>Math.min(778,760+.6*(z-1280))-3.29;
  waterProfile.moveTo(bankAt(1294)-canal,1327-1294);
  waterProfile.lineTo(bankAt(1310)-canal,1327-1310);
  waterProfile.lineTo(bankAt(1344.25)-canal,1327-1344.25);
  waterProfile.lineTo(bankAt(1344.25)-4.32-canal,1327-1344.25);
  waterProfile.lineTo(bankAt(1310)-4.32-canal,1327-1310);
  waterProfile.lineTo(bankAt(1294)-4.32-canal,1327-1294);waterProfile.closePath();
  const reflector=new Reflector(new T.ShapeGeometry(waterProfile),{
    textureWidth:384,textureHeight:192,clipBias:.004,color:0x343d33,
    shader:{...waterShader,fragmentShader:waterShader.fragmentShader.replace(
      'vec4 base = texture2DProj( tDiffuse, vUv );',
      'vec4 waterUV=vUv; waterUV.x+=sin(vUv.y*936.0+sin(vUv.y*137.0))*0.0013*waterUV.w; vec4 base=texture2DProj(tDiffuse,waterUV);'
    ).replace('blendOverlay( base.rgb, color )','mix(vec3(.016,.021,.014),base.rgb,.46)')}
  });
  reflector.rotation.x=-Math.PI/2;reflector.position.set(canal,.154,1327);
  // Update the planar image only when the player can inspect the passage at close range.
  const reflect=reflector.onBeforeRender;
  reflector.onBeforeRender=function(renderer,scene,camera,...args){
    if(scene.overrideMaterial||Math.hypot(camera.position.x-canal,camera.position.z-1321)>68)return;
    if(this.userData.at===renderer.info.render.frame)return;
    this.userData.at=renderer.info.render.frame;reflect.call(this,renderer,scene,camera,...args);
  };
  tile(canal,1321).add(reflector);owned.add(reflector.getRenderTarget());owned.add(reflector.material);
    box(774.97,.25,1326.97,.56,.41,34.13,'layers');
  // The approach watercourse follows the curve on the outside of the turning lane.
  // Its bank becomes the straight centre divider only after the two roads separate.
  for(let z=1296;z<1310;z+=1){
    const laneX=760+.6*(z+.5-1280);
    box(laneX-5.45,.13,z+.5,4.15,.045,1.19,'gutterWater',0,.54);
    box(laneX-3.04,.21,z+.5,.34,.28,1.19,'layers',0,.54);
  }
  // Cast-iron catch basin on the driving side of the divider near its nose.
  const grateZ=1312.62,grateX=bankAt(grateZ)+.71;
  box(grateX,.146,grateZ,.78,.034,1.08,'shadow');
  for(let j=0;j<10;j++){
    const d=(j-4.5)*.10;
    box(grateX,.18,grateZ+d,.76,.032,.041,'iron');
  }
  for(const x of [770.03,780.72])box(x,2.82,1320,.54,5.66,31,'drainWall');
  for(const x of [770.08,775.02,780.72]){
    box(x,2.75,start+2.0,.61,5.5,1.1,'layers');
    box(x,.86,start+1.38,.70,1.72,.22,'mossWall');
  }
  // The soffit is one solid extruded vault, cut to an ellipse. Independent crown
  // stones describe the inside profile all the way from one springing to the other.
  function portal(cx,z,span,spring,rise,cap,depth,finish){
    const radius=span/2,shape=new T.Shape();
    shape.moveTo(-radius-.26,cap);shape.lineTo(-radius-.26,spring);shape.lineTo(-radius,spring);
    for(let k=0;k<=32;k++){
      const a=Math.PI*(1-k/32);shape.lineTo(radius*Math.cos(a),spring+rise*Math.sin(a));
    }
    shape.lineTo(radius+.26,spring);shape.lineTo(radius+.26,cap);shape.closePath();
    const bake=(shape,thickness,material,zz)=>addGeo(new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:1}),material,cx,0,zz);
    bake(shape,depth,finish,z);
    for(let k=0;k<19;k++){
      const a=Math.PI*k/19+.003,b=Math.PI*(k+1)/19-.003,stone=new T.Shape();
      stone.moveTo(radius*Math.cos(a),spring+rise*Math.sin(a));
      stone.lineTo(radius*Math.cos(b),spring+rise*Math.sin(b));
      stone.lineTo((radius+.24)*Math.cos(b),spring+(rise+.29)*Math.sin(b));
      stone.lineTo((radius+.24)*Math.cos(a),spring+(rise+.29)*Math.sin(a));stone.closePath();
      bake(stone,.16,k%6===2?'mossWall':'layers',z-.15);
    }
  }
  // This broad leading arch begins beyond the bend in the playable approach.
  // The two downstream arches each have their own opening and central support.
  // Earth and the old wing wall continue behind the canal arch, closing the
  // open edge between the curved approach and the rectangular headwall.
  box(766.18,3.07,1318.1,7.37,6.14,28.2,'mossWall');
  for(let i=0;i<7;i++){
    box(768.40,-.12+i*.78,1304.04,.32+i*.31,.83,.46,'stone');
    prop('shrub_03',768.8+i*.78,5.8,1310.6,1.1+i%3*.37,i*.91);
  }
  box(780.72,2.76,1297.8,.54,5.52,13.2,'drainWall');
  for(let z=1292;z<1305;z++){
    const outer=760+.6*(z+.5-1280)-8.05;
    box(outer,2.71,z+.5,.48,5.42,1.22,'drainWall',0,.54);
  }
  portal(775.35,1294.5,10.77,3.58,1.73,6.25,7.25,'drainWall');
  portal(775.35,1304.6,10.77,3.48,1.62,6.10,1.55,'drainWall');
  portal(775.35,1305.96,10.77,3.48,1.62,6.12,1.57,'drainWall');
  portal(775.35,1307.7,10.77,3.38,1.45,6.27,5.85,'drainWall');
  for(const x of [770.08,775.02,780.72])box(x,2.56,1322.1,.59,5.12,.84,'mossWall');
  // Raised earth behind the twin culverts screens the bright sky through the
  // roof break. Its irregular crest still admits a narrow strip of daylight.
  box(775.25,6.36,1322.52,12.34,2.89,1.15,'mossWall');
  for(let j=0;j<15;j++){
    const x=769.42+j*.82;
    box(x,7.79+.095*Math.sin(j*1.77),1322.47,.87,.19+.11*(j%3),1.22,'stone',.02*Math.cos(j),0,.045*Math.sin(j));
    if(j%3!==1)prop('fern_02',x,7.79,1322.13,.76+.16*(j%4),j*.87);
  }
  for(const [cx,span] of [[road,4.93],[canal,4.64]])for(const z of [1324,1337,1350]){
    portal(cx,z,span,3.67,1.00,5.68,.51,'drainWall');
  }
  box(canal,5.88,1336,5.51,.66,28,'drainWall');
  // The drainage passage ends at a screened outfall. The adjacent driving
  // passage continues past it, so the exit remains accessible to vehicles.
  box(canal,3.12,1352.2,5.33,6.24,.45,'drainWall');
  for(let j=0;j<12;j++)box(canal-2.01+j*.36,1.65,1351.92,.065,3.25,.07,'iron');
  const portalBounce=new T.PointLight(0xffce93,12,9,2);
  portalBounce.position.set(775.3,1.28,1321.05);tile(775.3,1321.05).add(portalBounce);
  // Lay the worn surface along the actual turning lane. World-scaled UVs keep
  // the asphalt aggregate and tyre-width stains readable at driving height.
  materials.tunnelAsphalt=new T.MeshStandardMaterial({
    color:0x99918b,roughness:.57,map:texture('textures/road_damaged/road_damaged_diff_2k.jpg',true),
    normalMap:texture('textures/road_damaged/road_damaged_nor_gl_2k.jpg'),normalScale:new T.Vector2(.40,.40)
  });
  tunnelOcclusion(materials.tunnelAsphalt);
  const pavement=new T.BufferGeometry(),points=[],uvs=[],indices=[];
  for(let z=1294;z<=1360;z+=2){
    const cx=z<1310?760+.6*(z-1280):road;
    for(const dx of [-2.4,2.4]){points.push(cx+dx,.113,z);uvs.push((cx+dx)/4.5,z/4.5);}
    const k=points.length/3-2;
    if(k>0)indices.push(k-2,k,k-1,k-1,k,k+1);
  }
  pavement.setAttribute('position',new T.Float32BufferAttribute(points,3));
  pavement.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  pavement.setIndex(indices);pavement.computeVertexNormals();
  pavement.translate(-road,0,-1320);addGeo(pavement,'tunnelAsphalt',road,0,1320);
  // Leaf rafts snag against the driving side of the stone divider after flooding.
  const leafShape=new T.Shape();
  leafShape.moveTo(0,-.12);leafShape.lineTo(.058,-.012);leafShape.lineTo(.032,.074);
  leafShape.lineTo(0,.13);leafShape.lineTo(-.057,.016);leafShape.closePath();
  for(const [i,color] of [0x70502e,0x493724,0x9c7142].entries()){
    materials['drainLeaf'+i]=new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.77});
  }
  for(const centerZ of [1301.8,1304.5,1308.0,1311.1,1316.3,1322.0]){
    for(let j=0;j<19;j++){
      const phase=j*2.399+centerZ,z=centerZ+Math.sin(phase)*j*.043;
      const curbX=Math.min(778,760+.6*(z-1280))-(z<1310?3.04:3.03);
      const x=curbX+.31+.30*Math.abs(Math.cos(phase*1.31));
      addGeo(new T.ShapeGeometry(leafShape),'drainLeaf'+j%3,x,.15+(j%4)*.007,z,-1.48,0,phase);
    }
  }
  for(let k=0;k<14;k++){
    const z=1324.8+k*5.6;
    box(775.59,2.52,z,.10,5.02,5.58,'drainWall');
    box(780.40,2.52,z,.09,5.02,5.58,'drainWall');
    box(778,5.17,z,4.85,.3,5.58,'drainWall');
    for(const x of [775.65,780.34])box(x,.7,z,.035,1.38,5.58,'mossWall');
    if(k<5){box(770.54,.82,z,.045,1.56,5.58,'mossWall');box(772.69,4.93,z,4.85,.36,5.58,'drainWall');}
  }
  for(let k=0;k<6;k++){
    const x=770.6+.91*k;
    for(let j=0;j<3;j++)prop('weed_plant_02',x+.17*j,4.7+j*.27,1308.8+k*.17,1.25+.19*j,k*.36);
  }
  for(let i=0;i<18;i++){
    const z=1305+i*2.1;
    box(780.38,2.1,z,.14,3.9,.14,'iron');
    if(i%3===0)prop('fern_02',770.6,.17,z,.83,i);
    if(i%4===0&&z>=1310){box(775.03,4.94,z,.28,.18,.65,'light');prop('weed_plant_02',775.05,.48,z,1.3,i);}
  }
  for(let i=0;i<9;i++){const x=770.3+i*1.24;prop('fern_02',x,5.94,1310,.7+i%3*.26,.45*i);}
  for(let i=0;i<6;i++)box(778.8,.125,1302+i*.11,1.1,.018,.034,'iron');
  box(775.12,2.7,1342,.48,5.4,40,'drainWall');

  for(let i=0;i<8;i++){
    const x=736+i*3.27;
    prop('grass_medium_01',x,.08,331.7,1.3,.37*i);
    if(i%2===0)prop('shrub_03',x,0,327.9,2.6,.77*i);
  }
  // Service road in front of the storefronts, draining towards the storm curb.
  box(494.6,.026,1262.8,86,.05,7.45,'layers');
  for(let i=0;i<7;i++)box(454.7+i*12,.058,1263,5,.014,.12,'trim');
  // Six differently occupied shop bays are inspected individually at pedestrian height.
  const labels=['FOOD SHOP','COMMUNITY CLINIC','OUTDOOR SUPPLY','MOTOR SERVICE','BUILDERS SUPPLY','STATION 2'];
  for(let i=0;i<labels.length;i++){
    const x=460+i*14,z=1250,w=i===5?12.4:10.7,front=z+3.6;
    buildings.push([x,z,w,7.2]);
    const shell=i===2||i===4?'wood':i===3?'garageCladding':'shopCream';
    box(x,2.02,z-3.37,w,4.04,.32,shell);
    for(const side of [-1,1]){
      box(x+side*(w/2-.15),2.02,z,.30,4.04,7.12,shell);
      box(x+side*(w/2-.31),1.56,front,.62,3.12,.35,shell);
      box(x+side*1.55,1.54,front,1.05,3.08,.31,shell);
      box(x+side*3.32,.41,front,2.65,.82,.29,shell);
    }
    box(x,3.52,front,w,1.04,.35,shell);
    box(x,.11,z,w,.22,7.3,'layers');
    if(i<5)for(const side of [-1,1]){
      const sx=x+side*3.22;
      box(sx,.83,front-1.25,2.25,1.18,.77,'wood');
      if(i===0||i===4)for(let k=0;k<3;k++)prop(i===0?'plastic_crate_01':'wooden_crate_01',sx-.68+k*.64,1.44,front-1.26,.50,k*.19);
      else prop(i===1?'metal_office_desk':i===2?'metal_jerrycan':'old_tyre',sx,.22,front-1.92,.72,.23);
      for(let h=0;h<3;h++)box(sx,.76+h*.74,z-2.56,2.73,.08,.54,'wood');
    }
    box(x,4.12,z,w+.28,.22,7.5,'stone');
    box(x,.12,front+1.52,w+.66,.24,3.1,'layers');
    box(x,.08,front+5.5,13.98,.16,5.0,'stone');
    if(i===5){
      for(const k of [-3.12,3.12]){
        box(x+k,1.55,front+.03,5.47,3.12,.14,'flaking');
        for(let j=0;j<5;j++)box(x+k-1.92+j*.96,2.19,front+.13,.82,.52,.08,'storeGlass');
      }
    }else{
      for(const side of [-1,1]){
        box(x+side*3.1,1.64,front+.08,3.36,2.25,.14,'storeGlass');
        box(x+side*3.1,.44,front+.13,3.52,.24,.22,'stone');
        box(x+side*3.1,1.6,front+.18,.065,2.25,.11,'wood');
      }
      if(i!==3&&i!==4){
        box(x,1.27,front-.50,1.47,2.54,.12,'doors');
        box(x,1.65,front-.42,1.15,1.42,.055,'storeGlass');
        box(x+.47,1.10,front-.36,.05,.29,.07,'iron');
      }
      for(const side of [-1,1])box(x+side*.85,1.45,front-.25,.13,2.88,.70,shell);
      
    }
    if(i===0){
      box(x,2.76,front+.83,9.89,.14,1.93,'stripedCanvas',.29);
      box(x,2.4,front+1.73,9.89,.29,.10,'stripedCanvas');
      box(x,3.60,front+.26,9.75,.95,.06,'foodSign');
    }else if(i===1){
      box(x,3.64,front+.28,1.63,.86,.09,'enamelPlate');
      for(const side of [-1,1]){
        box(x+side*3.52,3.63,front+.23,1.34,.84,.07,'enamelPlate');
      }
      box(x,2.79,front+.4,2.46,.15,.9,'iron',.08);
    }else if(i===2){
      box(x,3.85,front+.12,w,1.04,.31,'wood');
      box(x,3.91,front+.35,8.74,.76,.05,'outfitterSign');
      box(x,2.84,front+1.03,10.84,.22,2.40,'wood',.22);
      box(x,2.54,front+2.12,10.82,.32,.12,'wood');
      for(const side of [-1,1])box(x+side*4.68,1.37,front+1.96,.13,2.74,.17,'wood');
      prop('old_tyre',x-3.8,.26,front+1.12,.9,1.25);
    }else if(i===3){
      box(x,3.1,front+.78,w+.45,.17,2.05,'roof',.09);
      sign(x,3.74,front+.23,'AUTO SERVICE',5.1,.47,'#aab0a0');
      prop('old_tyre',x+3.5,.26,front+.85,.91,.22);
      for(let k=0;k<3;k++)prop('old_tyre',x-.48,.24+k*.20,front-1.30,.68,.12*k);
      box(x+.48,.72,front-1.72,.65,.84,.48,'flaking');
      for(let k=0;k<3;k++)box(x+.48,.50+k*.22,front-1.44,.45,.045,.05,'iron');
    }else if(i===4){
      sign(x,3.71,front+.26,'BUILDING SUPPLIES',8.28,.65,'#b6a186');
      for(let j=0;j<4;j++)box(x-3.72+j*2.48,2.82,front+.87,2.49,.10,2.2,'patchedCanvas',.13+j*.018);
      for(const side of [-1,1])box(x+side*4.65,1.45,front+1.52,.13,2.9,.17,'wood');
      for(let j=0;j<5;j++)box(x+2.72+j*.22,1.25,front+.65,.18,2.07,.14,'wood',.06,.02,.07*j);
      for(let j=0;j<6;j++)box(x-3.55+(j%2)*.21,.36+Math.floor(j/2)*.16,front+1.12,2.1,.14,.20,'wood',0,.05*j);
    }else box(x,3.70,front+.23,1.55,.78,.06,'stationPlate');
    for(let j=0;j<3;j++)prop(i===0?'plastic_crate_01':i===4?'wooden_crate_01':'weed_plant_02',x-4.3+j*.53,.26,front+.53,.62,j*.38);
    tree(x+3.6,z-6,7+i%4);
  }
  // The camera faces the shelter through a ragged break in the shoulder paving.
  // The broken panels and bicycle stay outside the swept vehicle corridor.
  for(let i=0;i<9;i++){
    const x=982+i*.77,z=1289.65+Math.sin(i*2)*.32;
    box(x,.2,z,.74,.18,1.2,'layers',-.05*i,.13*Math.sin(i),.02*i);
    if(i%2===0)prop('weed_plant_02',x,.28,z-.2,.9,i);
  }
  for(const xx of [982.5,984.05]){
    addGeo(new T.TorusGeometry(.34,.052,6,16),'iron',xx,.29,1289.65,1.08,.06);
  }
  beam(982.5,.29,1289.65,983.23,.36,1289.38,.055,'iron');
  beam(983.23,.36,1289.38,984.05,.29,1289.65,.055,'iron');
  beam(982.5,.29,1289.65,983.1,.40,1290.02,.055,'flaking');
  beam(983.1,.40,1290.02,983.23,.36,1289.38,.055,'flaking');
  beam(983.1,.40,1290.02,983.77,.47,1290.11,.052,'flaking');
  beam(983.77,.47,1290.11,984.05,.29,1289.65,.065,'iron');
  const streetWet=new T.MeshPhysicalMaterial({color:0x4d5651,roughness:.47,clearcoat:.75,clearcoatRoughness:.22,metalness:.12,
    alphaMap:texture('evac-art/yard-water-mask.jpg'),transparent:true,depthWrite:false,roughnessMap:texture('evac-art/yard-water-rough.jpg')});
  materials.standingWater=streetWet;
  for(let j=0;j<21;j++){
    const x=927+j*2.91,z=1278+Math.sin(j*6.97)*5.65;
    addGeo(new T.PlaneGeometry(2.3+(j%5)*1.14,.9+j%3*.47),'standingWater',x,.115,z,-Math.PI/2,0,Math.sin(j*.59)*.27);
  }
  for(const [x,z,h] of [[978,1266.2,10.8],[953,1294,12.8],[927,1265,9.3],[899,1293,11.4],[884,1266,12.6]])tree(x,z,h);
  // Vestibule and threshold behind the nearest sidewalk, clear of the road.
  box(973,1.6,1261.1,5.1,3.2,3.25,'brick');
  box(973,1.34,1262.81,2.5,2.68,.19,'shadow');
  box(973,1.29,1262.93,1.65,2.45,.15,'doors');
  box(973,2.93,1263.23,3.2,.22,1.23,'roof',.08);
  box(973,.16,1263.8,3.52,.32,1.3,'layers');
  box(973,.09,1264.6,3.7,.18,.55,'layers');
  sign(973,2.68,1263.04,'ENTRY',1.08,.21);
  // Suspended traffic heads give the intersection a cross-street horizon.
  for(const zz of [1268,1292])cylinder(928,3.6,zz,.105,.18,7.2,'iron');
  beam(928,6.9,1268,928,6.67,1280,.065,'iron');
  beam(928,6.67,1280,928,6.9,1292,.065,'iron');
  for(const zz of [1275.1,1282.4])box(928,6.22,zz,.46,1.03,.38,'shadow');}
