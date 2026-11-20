import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The quay is built around the existing western road bridge and navigable channel.
// Each row is a separate occupied footprint, independent of roof plant and canopies.
export const harborFootprints = [
  [161,555,13,28,7,'shed'],[182,544,16,21,10,'yard'],[205,537,19,17,7,'glass'],
  [209,570,23,13,8,'yard'],[174,579,12,9,5,'shed'],[168,534,8,10,5,'shed',-.46],
  [178,521,8,6,3,'shed'],
  [267,601,25,12,9,'yard'],[308,557,13,23,7,'glass'],[311,530,22,13,8,'yard'],
  [309,503,17,14,9,'yard'],[295,603,9,9,4,'shed'],[310,603,10,9,5,'shed'],
  [323,600,7,10,5,'shed'],[284,613,8,6,4,'shed'],[297,612,7,8,4,'shed'],
  [310,615,7,9,5,'shed'],[322,614,7,9,5,'shed'],[333,616,7,8,4,'shed'],
  [332,623,8,6,4,'shed'],[315,624,8,7,4,'shed'],
  [352,538,16,18,20,'office'],[359,514,16,18,28,'office'],
  [360,484,16,21,28,'office'],[350,557,12,9,8,'yard'],[356,463,17,16,24,'office'],
  [214,452,20,15,9,'yard']
];

export function harbor(scene) {
  const loader = new T.TextureLoader(), batches=new Map();
  function surface(color, texture, resolution='1k') {
    const material=new T.MeshStandardMaterial({color,roughness:.80});
    if(texture){
      const prefix='/assets/textures/'+texture+'/'+texture+'_';
      for(const [property,suffix] of [['map','diff'],['normalMap','nor_gl'],['roughnessMap','arm']]){
        const t=loader.load(prefix+suffix+'_'+resolution+'.jpg');
        t.wrapS=t.wrapT=T.RepeatWrapping;
        t.anisotropy=4;
        if(property==='map')t.colorSpace=T.SRGBColorSpace;
        material[property]=t;
      }
      material.normalScale.set(.48,.48);
      material.aoMap=material.metalnessMap=material.roughnessMap;
      material.metalness=material.roughness=1;
    }
    batches.set(material,[]);
    return material;
  }
  const stone=surface(0xabc1d2,'cracked_concrete','2k'), tar=surface(0x949b99,'asphalt_02','2k');
  const rust=surface(0xa38167,'rusty_painted_metal'), brick=surface(0xbdaba0,'red_brick_03');
  const metal=surface(0x80887e,'worn_corrugated_iron'),paint=surface(0xbcb89e),dark=surface(0x37433f);
  const glass=surface(0x678484);glass.roughness=.22;glass.metalness=.4;
  const lichens=loader.load('/assets/textures/concrete_moss/concrete_moss_diff_1k.jpg');
  lichens.wrapS=lichens.wrapT=T.RepeatWrapping;lichens.colorSpace=T.SRGBColorSpace;
  for(const mat of [stone,tar,rust,metal,brick]){
    mat.onBeforeCompile=shader=>{
      shader.uniforms.lichenMap={value:lichens};
      shader.vertexShader='varying vec3 harborPosition;varying float skyFacing;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nharborPosition=position;skyFacing=normal.y;');
      shader.fragmentShader='uniform sampler2D lichenMap;varying vec3 harborPosition;varying float skyFacing;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        vec2 area=harborPosition.xz*.055+harborPosition.y*vec2(.02,.07);
        float grime=texture2D(map,area).g*.65+texture2D(map,area*.29+vec2(.3,.2)).g*.35;
        float damp=smoothstep(.045,.25,grime);
        diffuseColor.rgb*=mix(vec3(.55,.62,.65),vec3(1.43,1.49,1.48),damp);
        float moss=smoothstep(.21,.36,grime)*smoothstep(.0,.20,texture2D(map,area*1.9).g);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.56,.78,.42),moss*.60);
        vec3 patina=texture2D(lichenMap,harborPosition.xz*.38).rgb;
        float cover=smoothstep(.39,.80,skyFacing)*smoothstep(.055,.21,grime+patina.g*.4);
        diffuseColor.rgb=mix(diffuseColor.rgb,patina*vec3(.65,.77,.52),.65*cover);
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.95,cover*.7);');
    };
  }
  function put(g,mat,x,y,z,angle=0){
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      const side=Math.abs(n.getX(i))>.6, top=Math.abs(n.getY(i))>.6;
      uv.setXY(i,(side?p.getZ(i):p.getX(i))/3.7,(top?p.getZ(i):p.getY(i))/3.7);
    }
    g.rotateY(angle).translate(x,y,z);
    const geo=g.index?g.toNonIndexed():g;
    batches.get(mat).push(geo);
    if(g!==geo)g.dispose();
  }
  const box=(mat,x,y,z,w,h,d,a=0)=>put(new T.BoxGeometry(w,h,d),mat,x,y,z,a);
  function polygon(points,y,mat){
    const g=new T.ShapeGeometry(new T.Shape(points.map(([x,z])=>new T.Vector2(x,-z)))).rotateX(-Math.PI/2);
    put(g,mat,0,y,0);
  }
  // Decks have narrow fenders, capstones and pilings, so their edge reads from the water.
  function quay(points){
    polygon(points,.015,stone);
    for(let i=0;i<points.length;i++){
      const [x,z]=points[i],[ex,ez]=points[(i+1)%points.length],length=Math.hypot(ex-x,ez-z);
      const angle=Math.atan2(ex-x,ez-z);
      box(rust,(x+ex)/2,-.38,(z+ez)/2,.55,.80,length,angle);
      for(let d=2;d<length;d+=7){
        put(new T.CylinderGeometry(.21,.32,1.6,8),dark,x+(ex-x)*d/length,-.46,z+(ez-z)*d/length);
      }
    }
  }
  quay([[147,586],[147,552],[168,515],[192,504],[230,504],[230,583]]);
  quay([[249,507],[292,507],[299,491],[324,491],[324,583],[249,583]]);
  quay([[170,436],[323,436],[323,465],[265,465],[258,456],[192,460]]);
  quay([[325,436],[369,436],[369,571],[327,571],[327,516],[338,495]]);
  quay([[249,584],[335,584],[341,629],[278,629],[278,618],[249,618]]);
  // Narrow service aisles separate the loading side of each building from the plaza.
  for(const [x,z,w,d] of [[200,514,62,4],[191,555,4,63],[215,559,36,3.8],[249,548,3.4,62],[294,549,4.2,71],[271,578,48,3.6],[311,540,23,3.2],[318,573,45,3.1]]){
    box(tar,x,.043,z,w,.048,d);
  }
  for(let i=0;i<10;i++){
    box(paint,222+i*1.55,.118,525,.65,.018,2.65);
    box(paint,222+i*1.55,.118,577,.65,.018,2.65);
  }
  for(const [x,z,w,d,h,kind,yaw=0] of harborFootprints){
    const turn=yaw||(kind==='shed'&&z>593?Math.sin(x*1.41)*.18:0);
    const initial=turn?new Map([...batches].map(([mat,geos])=>[mat,geos.length])):null;
    const wall=kind==='office'?stone:kind==='shed'?metal:brick;
    box(wall,x,h/2,z,w,h,d);
    box(kind==='shed'?rust:tar,x,h+.10,z,w+.24,.22,d+.24);
    for(const sign of [-1,1]){
      box(stone,x,h+.31,z+sign*d/2,w,.48,.27);
      box(stone,x+sign*w/2,h+.31,z,.27,.48,d);
      for(let y=2.3;y<h-1;y+=3.25)for(let u=-w/2+2;u<w/2-.8;u+=3.3)
        box(glass,x+u,y,z+sign*(d/2+.06),1.75,1.54,.12);
      for(let y=2.3;y<h-1;y+=3.25)for(let v=-d/2+2;v<d/2-.8;v+=3.5)
        box(glass,x+sign*(w/2+.06),y,z+v,.12,1.54,1.7);
    }
    if(kind==='glass'){
      box(glass,x,h+.5,z,w*.8,.55,d*.84);
      for(let k=-w*.40;k<=w*.40;k+=1.8)box(paint,x+k,h+.8,z,.10,.12,d*.84);
      for(let k=-d*.42;k<=d*.42;k+=2.1)box(paint,x,h+.82,z+k,w*.8,.11,.11);
    }else{
      for(let k=0;k<Math.ceil(w/9);k++){
        const px=x-w*.28+k*3.6;
        box(metal,px,h+.64,z+d*.21,2.3,1.12,2);
        put(new T.CylinderGeometry(.62,.62,.10,12),dark,px,h+1.25,z+d*.21);
      }
      box(rust,x+w*.26,h+.21,z-d*.17,.40,.42,d*.52);
    }
    if(kind==='yard'||kind==='office'){
      box(stone,x+w*.18,h+.73,z-d*.18,w*.32,1.35,d*.27);
      box(metal,x+w*.18,h+1.48,z-d*.18,w*.33,.19,d*.28);
      for(let u=-w*.41;u<w*.41;u+=2.7)box(dark,x+u,h+.23,z+d*.41,.82,.35,.57);
    }
    if(kind==='yard'){
      // Raised clerestory and downpipes belong to this roof, including its pitched return.
      const span=w*.54,depth=d*.23,ridge=h+1.48;
      box(glass,x-w*.13,ridge-.57,z+d*.11,span,1.12,depth);
      for(const side of [-1,1]){
        const sheet=new T.BoxGeometry(span+.25,.12,depth*.54);
        sheet.rotateX(side*.20);
        put(sheet,metal,x-w*.13,ridge+.05,z+d*.11+side*depth*.25);
      }
      for(let u=-span*.5;u<=span*.5;u+=2.15)
        box(rust,x-w*.13+u,ridge-.54,z+d*.11+depth*.505,.12,1.18,.13);
      for(const side of [-1,1])
        box(rust,x+side*w*.43,h*.5,z+d*.5+.09,.18,h,.17);
    }
    if(kind==='shed'&&z>593){
      for(const side of [-1,1]){
        const pitch=.37;
        const panel=new T.BoxGeometry(w*.54/Math.cos(pitch),.24,d+.82).rotateZ(-side*pitch);
        put(panel,(Math.round(x)%3===0?rust:metal),x+side*w*.26,h+.26+w*.125,z);
      }
      box(brick,x+w*.24,h+1,z-d*.19,.61,2.5,.75);
      box(stone,x,.21,z+d*.5+.62,2.2,.40,1.2);
    }
    if(initial)for(const [mat,geos] of batches){
      for(let i=initial.get(mat);i<geos.length;i++)geos[i].translate(-x,0,-z).rotateY(turn).translate(x,0,z);
    }
  }
  // A waterfront maintenance court and open hoist remain visually distinct from roofs.
  box(stone,272,.052,551,36,.09,41);
  for(let i=-16;i<=16;i+=4)box(paint,272+i,.17,551,.075,.018,40);
  for(let i=-18;i<=18;i+=4)box(paint,272,.17,551+i,36,.018,.075);
  box(tar,272,.23,551,6,.28,7,.36);
  for(const side of [-1,1]){
    box(metal,272+side*1.75,6.2,551,.52,12,1.2);
    box(rust,272,12.2,551+side*.48,7,.63,.35);
  }
  for(let i=0;i<4;i++)box(metal,272,3+i*2.7,551,3.4,.25,.66);
  function strut(a,b,r,mat){
    const d=b.clone().sub(a),center=a.clone().add(b).multiplyScalar(.5);
    const beam=new T.CylinderGeometry(r,r,d.length(),6);
    beam.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));
    put(beam,mat,center.x,center.y,center.z);
  }
  const V=(x,y,z)=>new T.Vector3(272+x,y,551+z);
  for(const x of [-1,1])for(const z of [-1,1]){
    strut(V(x*3.4,.5,z*3.4),V(x*.82,12.4,z*.82),.18,metal);
    strut(V(x*2.4,4.4,z*2.4),V(-x*1.4,8.6,z*1.4),.11,rust);
  }
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
    strut(V(Math.cos(a)*2.1,12.8,Math.sin(a)*2.1),V(Math.cos(b)*2.1,12.8,Math.sin(b)*2.1),.11,metal);
  }
  for(const [x,z,w,d] of [[254,552,.4,34],[290,551,.4,34],[272,530,28,.4],[272,572,27,.4]]){
    box(stone,x,.32,z,w,.54,d);
  }
  for(let i=0;i<6;i++){
    box(metal,286,.62,539+i*3.5,1.05,.9,2.15);
    box(paint,286,1.11,539+i*3.5,1.09,.08,2.22);
  }
  const soil=surface(0x757653,'brown_mud_leaves_01'),leaf=surface(0x606747);
  const branch=loader.load('/assets/evac-art/ash-branch.webp');branch.colorSpace=T.SRGBColorSpace;
  leaf.map=branch;leaf.alphaTest=.34;leaf.side=T.DoubleSide;
  let seed=4728;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(const [x,z] of [[163,540],[151,567],[182,569],[194,516],[217,514],[224,581],[255,532],[254,571],[288,534],[289,570],[303,542],[321,573],[317,499],[350,525],[335,599],[202,451],[283,465]]){
    box(soil,x,.082,z,3+random()*3,.12,3+random()*4);
    const h=3.5+random()*3;
    put(new T.CylinderGeometry(.10,.27,h,7),rust,x,h/2,z);
    for(let j=0;j<20;j++){
      const a=j*2.39996, r=(.25+random()*.72)*h*.35;
      const card=new T.PlaneGeometry(h*.7,h*.59).rotateX(-.75-random()*.53);
      card.rotateY(a).translate(x+r*Math.cos(a),h*(.68+.28*random()),z+r*Math.sin(a));
      const geo=card.toNonIndexed();batches.get(leaf).push(geo);card.dispose();
    }
  }
  // Drainage, chipped concrete joints, loading bins and wheel stops read at pedestrian scale too.
  for(let j=0;j<95;j++){
    const x=252+random()*40,z=529+random()*46;
    if(Math.abs(x-272)<3&&Math.abs(z-551)<4)continue;
    const edge=Math.min(x-252,292-x,z-529,575-z);
    if(edge<3.3)box(soil,x,.111,z,.25+random()*1.2,.014,.15+random()*.44,random()*3);
  }
  for(const [x,z] of [[201,520],[226,561],[184,569],[302,520],[311,572],[210,456],[285,607]]){
    for(let k=0;k<3;k++){
      box(k===0?rust:metal,x+k*1.25,.59,z,1.1,1.12,.95);
      box(dark,x+k*1.25,1.18,z,1.11,.09,.97);
    }
  }
  // The high-level pipe gallery serves the eastern works, leaving all mapped lanes clear.
  const line=[[349,438],[343,474],[338,508],[338,548],[342,574],[348,606],[360,631]];
  for(let i=1;i<line.length;i++){
    const [ax,az]=line[i-1],[bx,bz]=line[i],dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz),a=Math.atan2(dx,dz);
    box(stone,(ax+bx)/2,8.1,(az+bz)/2,7,1.15,l+.3,a);
    for(const s of [-1,1])box(metal,(ax+bx)/2+s*3.45*dz/l,8.95,(az+bz)/2-s*3.45*dx/l,.2,.64,l+.3,a);
    if(Math.abs(bz-590)>10)box(stone,bx,3.95,bz,2.85,7.9,1.5,a);
  }
  const group=new T.Group();group.name='Western bridge waterfront';
  for(const [mat,list] of batches){
    if(!list.length)continue;
    const mesh=new T.Mesh(mergeGeometries(list),mat);mesh.receiveShadow=mesh.castShadow=true;group.add(mesh);
    for(const g of list)g.dispose();
  }
  scene.add(group);
}
