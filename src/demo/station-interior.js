import {isPedestrianHead} from '../world/placements/station-walls.js';
import * as T from 'three';
import {metricUV} from './station-metrics.js';

// Geometry coordinates and all finish repeat distances are in metres.
export function buildInterior(scene, meshes, parts) {
  const assembly = new T.Group();
  assembly.userData.windowSashes=new Map();
  assembly.name = 'Station 27 | architectural finishes';
  scene.add(assembly);
  const loader = new T.TextureLoader();
  function texture(url, repeat, color) {
    const t = loader.load(url);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.setScalar(1 / repeat);
    t.anisotropy = 4;
    if (color) t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function finish(name, resolution, size, tint, roughness, normal = .5) {
    const root = '/assets/evac-art/surfaces/' + name;
    return new T.MeshStandardMaterial({
      color: tint, roughness,
      map: texture(root + '_diff_' + resolution + '.webp', size, true),
      normalMap: texture(root + '_nor_gl_' + resolution + '.webp', size, false),
      normalScale: new T.Vector2(normal, normal)
    });
  }
  const brick = finish('red_brick_03','1k',2.1,0xb77c64,.91);
  const plaster = finish('painted_plaster_wall','2k',3.9,0xfff4dc,.9,.42);
  const dado = plaster.clone();
  // Historic painted masonry: running bond, discoloured belt, and worn paint.
  dado.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vBuilding;\n' + shader.vertexShader.replace('#include <project_vertex>',
      'vBuilding=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = 'varying vec3 vBuilding;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float y=vBuilding.y;
      float course=floor(y/.205);
      vec2 cell=fract(vec2((vBuilding.x+vBuilding.z)/.406+mod(course,2.)*.5,y/.205));
      vec2 edge=min(cell,1.-cell);
      float mortar=1.-smoothstep(.002,.009,min(edge.x*.406,edge.y*.205));
      float wear=smoothstep(.48,.74,diffuseColor.r);
      if(y<1.08) diffuseColor.rgb*=mix(vec3(.35,.39,.37),vec3(.67,.65,.57),wear);
      if(y>1.08 && y<1.106) diffuseColor.rgb*=.55;
      diffuseColor.rgb*=1.-mortar*.19;
      diffuseColor.rgb*=.76+.24*smoothstep(0.,.35,y);
    `);
  };
  const ceiling=finish('concrete_layers_02','1k',5,0xcac4b2,.94,.3);
  const garageFloor=new T.MeshStandardMaterial({
    map:texture('/assets/textures/garage_floor/garage_floor_diff_2k.webp',4.5,true),
    normalMap:texture('/assets/textures/garage_floor/garage_floor_nor_gl_2k.webp',4.5,false),
    roughnessMap:texture('/assets/textures/garage_floor/garage_floor_arm_2k.webp',4.5,false),
    roughness:.72,normalScale:new T.Vector2(.4,.4),color:0xa7a39b
  });
  const tile=finish('concrete_tiles','2k',2.35,0xb7b5a9,.75,.42);
  const timber=finish('weathered_planks','1k',2.9,0xbc9e7c,.77,.38);
  const concrete=garageFloor.clone();
  concrete.color.setHex(0x89939a);
  concrete.roughness=.47;
  const grainSize=256,grainData=new Uint8Array(grainSize*grainSize);
  let grainSeed=27;
  for(let i=0;i<grainData.length;i++){
    grainSeed=(Math.imul(grainSeed,1664525)+1013904223)>>>0;
    grainData[i]=grainSeed>>>24;
  }
  const grain=new T.DataTexture(grainData,grainSize,grainSize,T.RedFormat);
  grain.wrapS=grain.wrapT=T.RepeatWrapping;
  grain.minFilter=grain.magFilter=T.LinearFilter;grain.needsUpdate=true;
  function weather(material,fragment,roughness=''){
    const previous=material.onBeforeCompile.bind(material);
    material.onBeforeCompile=shader=>{
      previous(shader);shader.uniforms.masonryGrain={value:grain};
      shader.vertexShader='varying vec3 vPatina;\n'+shader.vertexShader.replace('#include <project_vertex>','vPatina=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
      shader.fragmentShader=`uniform sampler2D masonryGrain;
varying vec3 vPatina;
float buildingHash(vec2 p){return fract(sin(dot(p,vec2(27.31,91.73)))*15913.735);}
float buildingNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(masonryGrain,(i+f+.5)/256.).r;}
float buildingFbm(vec2 p){return .52*buildingNoise(p)+.29*buildingNoise(p*2.07)+.13*buildingNoise(p*4.39)+.06*buildingNoise(p*8.97);}
`+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+fragment).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+roughness);
    };
    material.customProgramCacheKey=()=>fragment;
  }
  const agedPaint=`
    float u=vPatina.x+vPatina.z,h=vPatina.y;
    float fleck=buildingFbm(vec2(u,h)*2.7);
    float trail=buildingFbm(vec2(u*2.9,h*.35));
    float wetBand=(1.-smoothstep(.02,.57,h))*smoothstep(.2,.72,trail);
    float runs=smoothstep(.43,.83,trail)*smoothstep(.28,.84,buildingFbm(vec2(u*.74,h*.19)));
    diffuseColor.rgb*=vec3(1.)-vec3(.30,.27,.22)*(runs+wetBand*.64);
    float chip=smoothstep(.65,.735,fleck)*(.22+.78*(1.-smoothstep(.04,1.7,h)));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.12,.085),chip*.58);
    if(abs(vPatina.x-10.)<.2 && vPatina.z< -4.5){
      float r=length(vec2((vPatina.z+6.94)*.77,(h-1.11)*.77));
      float scar=1.-smoothstep(1.28+fleck*.46,1.35+fleck*.67,r);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.18,.111)*(.55+fleck),scar*.75);
    }`;
  weather(dado,agedPaint);
  weather(plaster,agedPaint+'\n');
  const floorWear=`vec2 apron=vPatina.xz;float pooled=smoothstep(.51,.65,buildingFbm(apron*vec2(.43,.85))+.08*buildingNoise(apron*3.7));diffuseColor.rgb*=mix(vec3(1.),vec3(.75,.81,.85),pooled*.68);`;
  weather(concrete,floorWear,'roughnessFactor=mix(.79,.29,pooled*.79);');
  weather(garageFloor,floorWear+'\n','roughnessFactor=mix(.81,.38,pooled*.66);');
  const roofBase=finish('asphalt_02','2k',1.75,0x666963,.86,.43);
  function roofMembrane(m,p){
    const roofing=roofBase.clone();
    const basis=[m.position.x,m.position.z,p.footprint.w/2,p.footprint.d/2].map(v=>Number(v).toFixed(4));
    weather(roofing,`
      vec2 localRoof=vPatina.xz-vec2(${basis[0]},${basis[1]});
      vec2 border=vec2(${basis[2]},${basis[3]})-abs(localRoof);
      float eave=min(border.x,border.y);
      float strip=floor(vPatina.x/1.02);
      vec2 lap=fract(vec2(vPatina.x/1.02,vPatina.z/8.3+fract(strip*.381)));
      float join=min(min(lap.x,1.-lap.x)*1.02,min(lap.y,1.-lap.y)*8.3);
      float seam=1.-smoothstep(.007,.019+fwidth(join),join);
      float damp=buildingFbm(vPatina.xz*.61);
      float moss=smoothstep(.48,.65,damp)*(1.-smoothstep(.02,1.65,eave+.3*buildingNoise(vPatina.xz*3.)));
      float aggregate=buildingFbm(vPatina.xz*3.6);
      diffuseColor.rgb*=.82+.28*buildingHash(vec2(strip,8.))+aggregate*.26-.37*seam;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.096,.113,.055)*(.47+aggregate),moss*.66);`);
    return roofing;
  }
  const steel=new T.MeshStandardMaterial({color:0x444640,metalness:.62,roughness:.72});
  const flange=new T.MeshStandardMaterial({color:0x695f50,metalness:.48,roughness:.72});
  const enamel=new T.MeshStandardMaterial({color:0x884838,metalness:.31,roughness:.62});
  const rubber=new T.MeshStandardMaterial({color:0x282825,roughness:.98});
  const roofs=parts.filter(p=>p.shape==='roof').map(p=>{
    const m=meshes.get(p.id);
    m.material=[brick,brick,roofMembrane(m,p),ceiling,brick,brick];
    return {p,m};
  });
  function occupied(x,y,z) {
    return roofs.some(({p,m})=>Math.abs(x-m.position.x)<p.footprint.w/2 && Math.abs(z-m.position.z)<p.footprint.d/2 && y<m.position.y);
  }
  // Batch fixed metalwork per host so the roof inspection cut also hides its fittings.
  const batches=new Map(),dummy=new T.Object3D(),cube=new T.BoxGeometry(1,1,1);
  function stick(host,mat,x,y,z,w,h,d,angle=0) {
    let perHost=batches.get(host);
    if(!perHost)batches.set(host,perHost=new Map());
    let matrices=perHost.get(mat);
    if(!matrices)perHost.set(mat,matrices=[]);
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,angle);dummy.scale.set(w,h,d);
    dummy.updateMatrix();matrices.push(dummy.matrix.clone());
  }
  const oldGlass=new T.MeshStandardMaterial({color:0x9aadb1,transparent:true,opacity:.36,roughness:.30,metalness:.10,depthWrite:false});
  const windowPaint=new T.MeshStandardMaterial({color:0x827967,roughness:.79});
  function surface(x,z,w,d,mat) {
    const g=new T.BoxGeometry(w,.012,d);
    metricUV(g,x,.003,z);
    const m=new T.Mesh(g,mat);
    m.position.set(x,.003,z);m.receiveShadow=true;assembly.add(m);
  }
  meshes.get('site').material=concrete;
  for(const {p,m} of roofs) surface(m.position.x,m.position.z,p.footprint.w,p.footprint.d,
    p.id==='roof-garage'||p.id==='roof-workshop'?garageFloor:tile);
  for(const [x,z,w,d] of [[14.125,-7.125,8,6.52],[5.75,-1.5,8.25,4.26],[5.75,7.375,8.25,6.01]]) {
    const sheet=new T.Mesh(new T.PlaneGeometry(w,d),timber);
    sheet.rotation.x=-Math.PI/2;sheet.position.set(x,.012,z);
    const uv=sheet.geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w,uv.getY(i)*d);
    sheet.receiveShadow=true;assembly.add(sheet);
  }
  for(const p of parts.filter(p=>p.id.startsWith('wall/'))) {
    const m=meshes.get(p.id),[ ,axis,fixed,a,b,lo,hi]=p.id.split('/');
    const Y=m.position.y, X=m.position.x,Z=m.position.z;
    function side(sign){
      const x=X+(axis==='z'?sign*.22:0),z=Z+(axis==='x'?sign*.22:0);
      if(!occupied(x,Y,z))return brick;
      return x<1.6 || (z>0.75 && z<4.25 && x<10) || z< -3.75 && x<10 ? dado:plaster;
    }
    const front=side(1),back=side(-1);
    m.material=front===back?front:[front,back,brick,plaster,front,back];
    if(+lo===0 && +hi===.75 && Math.abs((b-a)-1.6)<.001){
      // Double-hung sash parked above 2.21 m, with open daylight beneath.
      const inside=occupied(X+(axis==='z'?.23:0),1.45,Z+(axis==='x'?.23:0))?1:-1;
      const upper=new T.Group();assembly.add(upper);assembly.userData.windowSashes.set(p.id,upper);
      function member(s,y,offset,w,h,d,mat,host=assembly){
        stick(host,mat,X+(axis==='x'?s:offset*inside),y,Z+(axis==='z'?s:offset*inside),
          axis==='x'?w:d,h,axis==='x'?d:w);
      }
      for(const s of [-.845,.845]){
        member(s,1.67,.127,.092,1.94,.07,windowPaint);
        member(s,1.67,.169,.038,1.94,.033,flange);
      }
      member(0,.733,.138,1.82,.038,.16,windowPaint);
      member(0,2.625,.15,1.8,.089,.079,windowPaint);
      for(const y of [2.242,2.58]) member(0,y,.155,1.6,.057,.065,flange,upper);
      for(const s of [-.78,-.26,.26,.78])member(s,2.41,.154,.035,.32,.061,windowPaint,upper);
      for(const s of [-.52,0,.52])member(s,2.41,.152,.48,.289,.009,oldGlass,upper);
    }
    if(+lo===0)for(const [s,material] of [[1,front],[-1,back]]){
      if(material!==plaster)continue;
      const x=X+(axis==='z'?s*.132:0),z=Z+(axis==='x'?s*.132:0);
      stick(assembly,flange,x,.065,z,axis==='x'?b-a:.035,.13,axis==='z'?b-a:.035);
    }
    // Recessed commercial steel door frames fixed to the aperture perimeter.
    const span=b-a;
    const head=Y-p.footprint.h/2;
    if(isPedestrianHead(+lo) && span>=1.45 && span<=2.45 && !(axis==='z' && +fixed===10 && +a< -3.75)){
      const width=.065,depth=.258;
      const piece=(offset,y,w,h)=>stick(assembly,flange,X+(axis==='x'?offset:0),y,Z+(axis==='z'?offset:0),
        axis==='x'?w:depth,h,axis==='z'?w:depth);
      piece(0,head-.005,span+.08,.07);
      for(const s of [-1,1])piece(s*span*.5,head/2,width,head);
    }
  }
  const gate=meshes.get('gate');
  gate.material=new T.MeshStandardMaterial({color:0x793d32,metalness:.26,roughness:.64});
  weather(gate.material,`
    float corr=vPatina.y/.132;
    float filtered=(1.-smoothstep(.18,.77,fwidth(corr)));
    float ridge=sin(corr*6.28318)*filtered;
    float rust=buildingFbm(vec2(vPatina.x*.94,vPatina.y*.27));
    diffuseColor.rgb*= (.91+.235*ridge)*(.79+.43*rust);
    float edgeOx=(1.-smoothstep(.03,.46,vPatina.y))*smoothstep(.32,.7,rust);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.136,.089,.045),edgeOx);
  `);
  const chain=meshes.get('chain');
  if(chain)chain.material=steel;
  stick(gate,rubber,0,-1.615,0,11.98,.052,.232);
  for (const s of [-1,1])stick(assembly,steel,-13+s*6.04,2.25,10.45,.115,4.5,.32);
  const hall=meshes.get('roof-garage');
  const fittings=new T.Group();fittings.position.copy(hall.position).multiplyScalar(-1);hall.add(fittings);
  for(const z of [-3.36,.85,5.16,9.94]){
    // Parallel-chord steel truss with riveted gussets and I-section lower chords.
    for(const y of [5.22,5.95]){
      stick(fittings,steel,-13.5,y,z,14.79,.095,.095);
      for(const dy of [-.062,.062])stick(fittings,flange,-13.5,y+dy,z,14.79,.03,.17);
    }
    for(let j=0;j<12;j++){
      const dx=14.7/12,dy=.72*(j%2?1:-1),x=-20.85+dx*(j+.5);
      stick(fittings,flange,x,5.585,z,Math.hypot(dx,dy),.059,.081,Math.atan2(dy,dx));
      stick(fittings,steel,x-dx/2,5.585,z,.045,.72,.057);
      stick(fittings,flange,x-dx/2,5.27,z,.16,.18,.117);
    }
  }
  for(let x=-20.6;x<-6.1;x+=.82)stick(fittings,steel,x,6.115,3.375,.065,.117,14.08);
  for(const x of [-20.64,-6.36])for(const z of [-3.36,.85,5.16,9.94]){
    stick(assembly,flange,x,2.62,z,.21,5.24,.065);
    for(const dz of [-.082,.082])stick(assembly,steel,x,2.62,z+dz,.25,5.24,.035);
    stick(assembly,flange,x,.08,z,.34,.14,.32);
  }
  // Roof-suspended enameled luminaires. Diffusers remain visible with power off.
  const shadeGeom=new T.ConeGeometry(.32,.19,24,1,true),glow=new T.MeshStandardMaterial({color:0xe9e0c6,emissive:0xc3ab87,emissiveIntensity:.72});
  const diffuserGeom=new T.CylinderGeometry(.298,.298,.026,24);
  for(const x of [-17.3,-10.1])for(const z of [-1.44,3.0,7.5]){
    stick(fittings,steel,x,5.65,z,.022,.92,.022);
    const shade=new T.Mesh(shadeGeom,flange);shade.position.set(x,5.10,z);fittings.add(shade);
    const lamp=new T.Mesh(diffuserGeom,glow);lamp.position.set(x,5.003,z);fittings.add(lamp);
  }
  for(const x of [-19.9,-7.16])stick(fittings,enamel,x,5.78,3.375,.067,.067,14);
  // Fixed conduit and sealed strip lights in the service rooms follow their own roof cut.
  for(const [id,positions] of [
    ['roof-workshop',[[-16,-7.1],[-10.7,-7.1]]],
    ['roof-middle',[[-3.55,-3.5],[-3.55,5.2],[.25,-4],[.25,4],[6,-7.1],[5.75,2.55]]],
    ['roof-front',[[15.6,4.6]]]
  ]){
    const roof=meshes.get(id);
    for(const [worldX,worldZ] of positions){
      const x=worldX-roof.position.x,z=worldZ-roof.position.z,y=-.16;
      stick(roof,flange,x,y,z,1.32,.09,.18);
      for(const dz of [-.04,.04])stick(roof,glow,x,y-.052,z+dz,1.23,.026,.044);
    }
  }
  // Old painted bay lettering is a finish bonded to the wall, clear of all apertures.
  function lettering(text,x,y,z,width,angle){
    const canvas=document.createElement('canvas');
    canvas.width=640;canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#322d22';ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.font='bold 66px Georgia';ctx.fillText(text,320,48,625);
    let seed=27;
    function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
    for(let i=0;i<2400;i++)ctx.clearRect(rand()*640,rand()*96,.7+rand()*3,.6+rand()*2.5);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(width,width*.15),new T.MeshBasicMaterial({
      map,transparent:true,opacity:.59,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    m.position.set(x,y,z);m.rotation.y=angle;assembly.add(m);
  }
  lettering('←  APPARATUS BAY',11.9,1.82,1.535,1.5,0);
  lettering('NORTH EXIT  →',6.2,2.02,-10.365,1.3,0);
  lettering('BAY DOOR',-6.56,1.90,10.366,.70,Math.PI);
  lettering('PUMP SERVICE',-16.0,2.15,-3.88,2.95,Math.PI);
  lettering('ENGINE  27',-6.129,3.0,6.5,2.35,-Math.PI/2);
  // Above the wash line, a fixed steel supply rises to the service-room ceiling.
  for(const [x,z] of [[-15.65,-3.935],[-6.25,-6.75]]){
    stick(assembly,flange,x,1.73,z,.056,3.31,.061);
    for(const y of [.48,1.53,2.74])stick(assembly,steel,x,y,z,.103,.075,.078);
  }
  // Cast-iron linear drain and slab saw cuts follow the original bay threshold.
  stick(assembly,rubber,-13.15,.015,3.4,.25,.014,13.67);
  for(const x of [-13.295,-13.005])stick(assembly,flange,x,.025,3.4,.026,.023,13.7);
  for(let z=-3.37;z<10.24;z+=.073)stick(assembly,steel,-13.15,.027,z,.245,.013,.031);
  for(const z of [-.6,3.7,8])stick(assembly,rubber,-13.5,.012,z,14.77,.003,.009);
  // Fractured render follows the existing three-part kitchen breach. Irregular
  // triangular spandrels only occupy the opening corners above/alongside the passage.
  const rubble=finish('concrete_layers_02','1k',.85,0x9e8162,.97);
  function brokenEdge(points){
    const shape=new T.Shape();
    points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));
    shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:.247,bevelEnabled:false});
    g.rotateY(Math.PI/2);g.translate(9.876,0,0);metricUV(g,0,0,0);
    const edge=new T.Mesh(g,[dado,rubble]);
    edge.castShadow=edge.receiveShadow=true;assembly.add(edge);
  }
  brokenEdge([[-8.6,2.19],[-8.1,2.19],[-8.1,2.70],[-5.7,2.70],[-5.7,2.19],[-5.2,2.19],
    [-5.21,1.8],[-5.37,1.91],[-5.39,2.03],[-5.52,2.00],[-5.73,2.21],[-5.77,2.19],
    [-5.91,2.38],[-6.08,2.41],[-6.14,2.52],[-6.32,2.48],[-6.52,2.60],[-6.74,2.55],
    [-6.90,2.62],[-7.10,2.53],[-7.31,2.57],[-7.48,2.45],[-7.64,2.46],[-7.83,2.31],[-7.98,2.28],
    [-8.06,2.11],[-8.25,2.08],[-8.32,1.94],[-8.43,1.95],[-8.57,1.76]]);
  brokenEdge([[-8.6,.64],[-8.1,.64],[-8.1,.01],[-7.98,.01],[-8.03,.21],
    [-8.02,.33],[-8.17,.41],[-8.18,.69],[-8.31,.71],[-8.42,.88],[-8.48,.85],[-8.60,1.03]]);
  brokenEdge([[-5.7,.01],[-5.7,.89],[-5.2,.89],[-5.2,1.34],[-5.29,1.19],[-5.39,1.22],
    [-5.44,1.02],[-5.56,.99],[-5.63,.79],[-5.74,.73],[-5.73,.46],[-5.84,.40],[-5.88,.01]]);
  for(const [host,mats] of batches)for(const [mat,matrices] of mats){
    const inst=new T.InstancedMesh(cube,mat,matrices.length);
    matrices.forEach((m,i)=>inst.setMatrixAt(i,m));inst.castShadow=inst.receiveShadow=true;
    inst.computeBoundingSphere();host.add(inst);
  }
  return assembly;
}
