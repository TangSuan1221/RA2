import {publicEntranceHead} from '../world/placements/station-walls.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Reflector} from 'three/addons/objects/Reflector.js';

// Meter coordinates follow the saved station datum: the single south shutter is
// DR-08, the south visitor entrance is in the lower wing at x=14.
export function buildExterior(scene, meshes) {
  const group = new T.Group();
  group.name = 'station-exterior';
  scene.add(group);
  const loader = new T.TextureLoader();
  const buckets = new Map();
  const root = '/assets/evac-art/';
  function texture(path, color = true) {
    const t = loader.load(root + path);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    if (color) t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function surface(name, src, scale, color, options = {}) {
    const mat = new T.MeshStandardMaterial({color, roughness: .85, ...options});
    mat.name = name;
    if (src) {
      mat.map = texture('surfaces/' + src + '_diff_' + (src === 'asphalt_02' ? '2k' : '1k') + '.webp');
      mat.map.repeat.setScalar(scale);
    }
    return mat;
  }
  const brick = surface('weathered pier brick','red_brick_03',.58,0xa16852);
  const cap = surface('rain-blackened coping','concrete_moss',.7,0x696b5a);
  const cement = surface('scuffed concrete','concrete_layers_02',.35,0xaaa495);
  const rust = surface('oxidized tower iron','rusty_painted_metal',1.1,0xa15a36,{metalness:.35,roughness:.63});
  const iron = surface('cast iron',null,1,0x353836,{metalness:.4,roughness:.57});
  const sash = surface('old sash',null,1,0x443a32);
  const asphalt = surface('rain dark asphalt','asphalt_02',.20,0x8c9596,{roughness:.46});
  const line = surface('worn paint','concrete_layers_02',.5,0xb9ae7b);
  const silver = surface('flashing','rusty_painted_metal',.8,0x888a79);
  const light = new T.MeshStandardMaterial({color:0xf1c684,emissive:0xffbf70,emissiveIntensity:1.1});
  const asphaltNormal = texture('surfaces/asphalt_02_nor_gl_2k.webp',false);
  asphaltNormal.repeat.setScalar(.20); asphalt.normalMap=asphaltNormal; asphalt.normalScale.set(.35,.35);
  const rustNormal = texture('surfaces/rusty_painted_metal_nor_gl_1k.webp',false);
  rust.normalMap = rustNormal; rust.normalScale.setScalar(.5);
  const v = new T.Vector3(), q = new T.Quaternion(), one = new T.Vector3(1,1,1);
  function add(geom,mat,x,y,z,rotation,project=true) {
    geom.applyMatrix4(new T.Matrix4().compose(v.set(x,y,z),rotation||q.identity(),one));
    const p=geom.attributes.position,n=geom.attributes.normal,uv=geom.attributes.uv;
    if(project) for(let i=0;i<p.count;i++){
      const a=Math.abs(n.getX(i)),b=Math.abs(n.getY(i)),c=Math.abs(n.getZ(i));
      uv.setXY(i, a>c&&a>b?p.getZ(i):p.getX(i), b>Math.max(a,c)?p.getZ(i):p.getY(i));
    }
    const flat=geom.index?geom.toNonIndexed():geom;
    if(flat!==geom)geom.dispose();
    if(!buckets.has(mat))buckets.set(mat,[]);
    buckets.get(mat).push(flat);
  }
  const box=(x,y,z,w,h,d,mat)=>add(new T.BoxGeometry(w,h,d),mat,x,y,z);
  function beam(a,b,width,depth,mat){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start);
    const middle=start.addScaledVector(delta,.5);
    add(new T.BoxGeometry(width,delta.length(),depth),mat,middle.x,middle.y,middle.z,
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
  }
  function panel(x,y,z,w,h,material,yaw=0) {
    add(new T.PlaneGeometry(w,h),material,x,y,z,new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),false);
  }
  function paint(text,width,height,size) {
    const c=document.createElement('canvas'); c.width=width; c.height=height;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#e3d9ae';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold '+size+'px Georgia,serif';ctx.fillText(text,width/2,height*.51,width*.98);
    // Split weathered paint at mortar courses and flake a deterministic minority of pigment.
    const data=ctx.getImageData(0,0,width,height);
    let seed=2701;
    for(let i=3;i<data.data.length;i+=4){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const r=seed/4294967296, py=Math.floor((i>>2)/width);
      if(r<.10|| (py%29<=1 && r<.75))data.data[i]=0;
      else data.data[i]*=.56+.44*r;
    }
    ctx.putImageData(data,0,0);
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;
    return new T.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  }
  // Real soffit, masonry piers and top band carry the station name. The upper
  // cornice masks the roof membrane; it does not alter interior clearance.
  for(const x of [-20.67,-6.4]){
    box(x,3.1,10.66,.61,6.2,.32,brick);
    box(x,.22,10.72,.72,.44,.37,cement);
    box(x,4.35,10.84,.76,.14,.44,cap);
    box(x,4.49,10.81,.7,.14,.39,brick);
  }
  box(-13.5,6.53,10.51,15.4,.92,.39,brick);
  box(-13.5,6.16,10.69,15.48,.12,.42,brick);
  box(-13.5,6.91,10.64,15.57,.15,.49,cap);
  box(-13.5,7.04,10.62,15.6,.11,.53,iron);
  const fasciaMap=texture('fire-elevation-main.webp');
  // Rectified survey crop of the original brick coping, inclusive of its
  // mossy upper drip and dark horizontal run-off below the stone.
  fasciaMap.repeat.set(.995,.148);fasciaMap.offset.set(.002,.838);
  const fascia=new T.MeshStandardMaterial({map:fasciaMap,roughness:.92,color:0xbfb7a5});
  fascia.name='surveyed cornice';
  panel(-13.5,6.92,10.891,15.6,.36,fascia);
  panel(-21.216,6.92,3.43,14.25,.36,fascia,-Math.PI/2);
  panel(-5.785,6.92,3.43,14.25,.36,fascia,Math.PI/2);
  panel(-13.5,6.92,-3.984,15.3,.36,fascia,Math.PI);
  // Rectified masonry piers retain rain streaks, splash-back and mortar
  // bleaching that would be lost if the facade used only a tileable brick.
  function surveyedPier(x,width,y,height,z,u,v,uw,vh){
    const sample=texture('fire-elevation-main.webp');
    sample.offset.set(u,1-v-vh);sample.repeat.set(uw,vh);
    const mat=new T.MeshStandardMaterial({map:sample,roughness:.92,color:0xb9ad9a});
    mat.name='masonry survey pier';
    panel(x,y,z,width,height,mat);
  }
  surveyedPier(-20.66,.57,2.67,4.40,10.823,.006,.189,.085,.744);
  surveyedPier(-6.4,.58,2.67,4.40,10.823,.009,.189,.081,.744);
  // Rust caught behind the left rain leader, widening into a splash fan at
  // the base. Thin translucent strands preserve the underlying mortar detail.
  const stain=document.createElement('canvas');stain.width=160;stain.height=448;
  const sc=stain.getContext('2d');
  for(let i=0;i<83;i++){
    const jitter=Math.sin(i*32.84)*Math.cos(i*1.46);
    const x=76+jitter*47,top=(.5+.5*Math.sin(i*8.31))*255;
    const ink=sc.createLinearGradient(0,top,0,448);
    ink.addColorStop(0,'rgba(56,45,26,0)');ink.addColorStop(.42,'rgba(41,40,25,.13)');
    ink.addColorStop(1,'rgba(28,32,22,.21)');sc.strokeStyle=ink;sc.lineWidth=1.2+(i%4)*.65;
    sc.beginPath();sc.moveTo(x,top);sc.bezierCurveTo(x+2,top+45,x-3,350,x+jitter*21,448);sc.stroke();
  }
  const dirt=new T.MeshStandardMaterial({map:new T.CanvasTexture(stain),transparent:true,depthWrite:false,roughness:.81,polygonOffset:true,polygonOffsetFactor:-3});
  dirt.map.colorSpace=T.SRGBColorSpace;dirt.name='rain leader wall wash';
  panel(-20.83,1.56,10.834,.77,3.03,dirt);panel(-20.83,.23,10.912,.78,.43,dirt);
  const trackBack=surface('shutter guide recess',null,1,0x1f2020);
  for(const [x,hand] of [[-19,-1],[-7,1]]){
    box(x+hand*.045,2.24,10.631,.14,4.48,.075,trackBack);
    box(x+hand*.104,2.24,10.714,.044,4.48,.18,iron);
    box(x+hand*.053,2.24,10.787,.09,4.48,.035,rust);
  }
  box(-13,4.59,10.72,12.64,.16,.3,brick);
  panel(-13.5,6.56,10.715,10.8,.72,paint('FIRE STATION 27',1536,128,104));
  const glazing=new T.MeshStandardMaterial({color:0x837f74,transparent:true,opacity:.19,depthWrite:false,metalness:.18,roughness:.27,side:T.DoubleSide});
  glazing.map=texture('home-window-glass.webp');
  // Apertures in the existing DR-08 lintel. Its saved collision envelope remains
  // the structural envelope (4.5m above circulation); visible glass transmits light.
  const header=meshes.get('wall/x/10.5/-19/-7/4.5/6.2');
  if(header){
    const g=header.geometry, shapes=[],indices=[];
    function piece(cx,cy,w,h){
      const geo=new T.BoxGeometry(w,h,.24);geo.translate(cx,cy,0);
      const u=geo.attributes.uv,p=geo.attributes.position,n=geo.attributes.normal;
      for(let i=0;i<p.count;i++)u.setXY(i,Math.abs(n.getX(i))>.5?p.getZ(i)+10.5:p.getX(i)-13,Math.abs(n.getY(i))>.5?p.getZ(i)+10.5:p.getY(i)+5.35);
      const offset=shapes.reduce((sum,s)=>sum+s.index.count,0);
      for(const face of geo.groups)indices.push([offset+face.start,face.count,face.materialIndex]);
      shapes.push(geo);
    }
    piece(0,-.73,12,.24);piece(0,.73,12,.24);
    let end=-6;
    for(let i=0;i<7;i++){
      const cx=-5.04+i*1.68,left=cx-.56,right=cx+.56;
      piece((end+left)/2,0,left-end,1.22);end=right;
      const x=-13+cx;
      for(const dx of [-.56,.56])box(x+dx,5.35,10.5,.065,1.24,.16,sash);
      for(const dy of [-.59,.08,.59])box(x,5.35+dy,10.5,1.13,.05,.13,sash);
      box(x,5.35,10.49,.038,1.17,.08,sash);
      box(x,4.705,10.58,1.35,.10,.36,cement);
      panel(x,5.35,10.48,1.06,1.14,glazing);
    }
    piece((end+6)/2,0,6-end,1.22);
    header.geometry=mergeGeometries(shapes);header.geometry.parameters=g.parameters;
    for(const args of indices)header.geometry.addGroup(...args);
    shapes.forEach(s=>s.dispose());g.dispose();
  }
  // Behind the shutter fascia a return parapet wraps the upper garage mass.
  for(const x of [-21,-6]){
    box(x,6.59,3.37,.28,.73,14.24,brick);
    box(x,7,3.37,.4,.10,14.36,cap);
  }
  box(-13.5,6.59,-3.77,15.2,.73,.28,brick);
  box(-13.5,7,-3.77,15.3,.10,.4,cap);
  for(const [x,z,w,d] of [[-13.5,-10.5,15,.27],[6,-10.5,24.2,.27],[-21,-7.12,.27,6.8],[18.25,-7.1,.27,6.82],[19.5,-3.75,2.5,.27],[20.75,2.4,.27,12.4],[15.4,8.5,10.9,.27],[10,9.5,.27,2.1],[2,10.5,16,.27]]){
    box(x,3.85,z,w,.51,d,brick);box(x,4.14,z,w+.14,.1,d+.14,cap);
  }
  // Window furniture stays outside the jamb/sill edges of the authored
  // vaultable windows. Open sashes never bisect a player's traversal volume.
  function sill(axis,fixed,c,facing){
    const isX=axis==='x';
    const at=(off,y,push,w,h,d,mat)=>box(isX?c+off:fixed+push*facing,y,isX?fixed+push*facing:c+off,isX?w:d,h,isX?d:w,mat);
    at(0,.69,.16,1.98,.10,.38,cement);at(0,2.72,.11,1.93,.18,.29,brick);
    for(const side of [-1,1])at(side*.83,1.68,.11,.07,1.87,.15,sash);
    at(0,2.62,.11,1.7,.065,.18,sash);
  }
  for(const c of [-16,-7.5,4,14])sill('x',-10.5,c,-1);
  for(const c of [-7,0,7])sill('z',-21,c,-1);
  for(const c of [-3.5,5])sill('x',10.5,c,1);
  for(const c of [0,6])sill('z',20.75,c,1);
  sill('z',18.25,-6.5,1);sill('x',8.5,18.8,1);
  for(const x of [12.72,15.28])box(x,publicEntranceHead/2,8.62,.15,publicEntranceHead,.24,sash);
  box(14,publicEntranceHead+.10,8.66,2.76,.19,.32,sash);
  box(14,publicEntranceHead+.35,8.94,3.3,.14,1.0,cap);
  // Original 2.4 m doorway with both leaves parked against the jambs.
  // The open leaves extend back into the sides of the existing public lobby.
  for(const x of [12.86,15.14]){
    box(x,(publicEntranceHead-.04)/2,7.89,.075,publicEntranceHead-.08,1.23,sash);
    box(x+(x<14?.047:-.047),.23,7.89,.014,.34,1.08,silver);
    box(x+(x<14?.06:-.06),1.10,7.50,.037,.23,.034,iron);
  }
  panel(16.1,1.85,8.631,.95,.54,paint('S.F.D.',256,96,80));
  // Goosenecks, folded shades, rain leaders and bollards are architectural attachments.
  for(const [x,z,h] of [[-20.25,10.71,3.2],[-6.33,10.71,3.2],[14,8.84,publicEntranceHead+.26]]){
    beam([x,h,z],[x,h+.22,z+.32],.065,.065,iron);
    beam([x,h+.22,z+.32],[x,h+.1,z+.46],.06,.06,iron);
    add(new T.CylinderGeometry(.08,.25,.16,16),iron,x,h+.03,z+.46);
    add(new T.CylinderGeometry(.19,.17,.035,16),light,x,h-.056,z+.46);
  }
  for(const [x,z,h] of [[-20.93,10.83,6.9],[-6.2,10.82,6.9],[20.82,8.4,4],[-20.99,-10.65,4]]){
    add(new T.CylinderGeometry(.067,.067,h-.32,8),iron,x,(h+.32)/2,z);
    for(let y=.52;y<h;y+=1.45)box(x,y,z,.18,.05,.16,silver);
  }
  const brass=surface('worn yellow bollard','rusty_painted_metal',1,0xe6a849);
  for(const x of [-19.45,-6.54]){add(new T.CylinderGeometry(.09,.095,.97,10),brass,x,.485,10.91);box(x,.04,10.91,.35,.08,.35,iron);}
  // Rooftop instrument tower: four tapering legs with crossed bays. Only the
  // roof-mounted bracing, wind vanes and lightning rod protrude in silhouette.
  const tx=-15.2,tz=1,base=6.44,levels=[0,1.35,2.72,4.2];
  function towerPoint(i,l){const r=1.0-l*.042;return [tx+[-1,1,1,-1][i]*r,base+l,tz+[-1,-1,1,1][i]*r];}
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    const foot=towerPoint(i,0);box(foot[0],base,foot[2],.5,.18,.5,cement);
    beam(foot,towerPoint(i,4.2),.12,.12,rust);
    for(let k=0;k<levels.length-1;k++){
      const lo=levels[k],hi=levels[k+1];
      beam(towerPoint(i,lo),towerPoint(j,lo),.09,.09,rust);
      beam(towerPoint(i,lo),towerPoint(j,hi),.055,.055,rust);
      beam(towerPoint(j,lo),towerPoint(i,hi),.045,.045,rust);
    }
    beam(towerPoint(i,4.2),towerPoint(j,4.2),.1,.1,rust);
  }
  add(new T.CylinderGeometry(.48,.23,2.6,16),rust,tx,base+2.45,tz);
  beam([tx-.45,base+4.2,tz],[tx-.45,base+5.4,tz],.035,.035,iron);
  for(const [x,z,y] of [[-9,2,6.49],[-12,-6.8,3.8],[11,2.5,3.8],[5,-7,3.8]]){
    box(x,y,z,.96,.20,1.2,iron);box(x,y+.13,z,1.03,.06,1.26,silver);
  }
  // Urban block beyond the walkable site. Storeys and sash rhythm are geometry
  // batched rather than a single low-resolution billboard.
  box(0,-.27,0,250,.20,250,asphalt);
  const tenement=surface('surveyed brick neighbour',null,1,0xc5b9a6);
  tenement.map=texture('fire-elevation-rear.webp');
  const paleTenement=tenement.clone();paleTenement.name='weathered painted neighbour';
  paleTenement.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nfloat lum=dot(diffuseColor.rgb,vec3(.299,.587,.114)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(lum)*vec3(1.35,1.42,1.38),.86);');
  };
  function cityBlock(x,z,w,d,h,mat,front){
    box(x,h/2-.12,z,w,h,d,mat);
    box(x,h-.04,z,w+.38,.30,d+.38,cap);
    const rows=Math.max(1,Math.round(h/7)),surface=mat===brick?tenement:paleTenement;
    for(const facing of [-1,1])for(const alongX of [false,true]){
      const span=alongX?w:d,count=Math.max(1,Math.round(span/12));
      for(let i=0;i<count;i++)for(let j=0;j<rows;j++){
        const along=-span/2+(i+.5)*span/count;
        panel(alongX?x+along:x+facing*(w/2+.023),(j+.5)*h/rows-.12,
          alongX?z+facing*(d/2+.023):z+along,span/count,h/rows,surface,alongX?(facing===1?0:Math.PI):facing*Math.PI/2);
      }
    }
    for(let y=3.3;y<h-1;y+=6.2)box(x,y,z,w+.18,.16,d+.18,cap);
    box(x+w*.24,h+.85,z-d*.22,w*.25,1.7,d*.22,mat);
    box(x+w*.24,h+1.74,z-d*.22,w*.25+.32,.16,d*.22+.32,cap);
    for(let j=0;j<2;j++)box(x-w*.27+1.45*j,h+.56+j*.12,z+d*.22,.52,1.12+j*.24,.64,brick);
  }
  for(const [x,z,w,d,h,f,m] of [[-42,-35,16,17,16,1,brick],[-19,-40,23,14,11,1,brick],[11,-44,24,21,18,1,cement],[41,-38,18,21,13,1,brick],[-48,8,16,32,11,1,cement],[46,8,17,28,12,1,brick],[-16,48,32,14,13,-1,brick],[16,51,21,18,16,-1,cement],[-49,44,20,17,20,-1,cement]])cityBlock(x,z,w,d,h,m,f);
  // Second row closes street-end sightlines. Real setbacks keep the first row
  // in silhouette without placing buildings or obstacles on the station site.
  for(const [x,z,w,d,h] of [[-69,-61,27,20,20],[-36,-64,32,21,25],[2,-69,26,17,26],[30,-62,18,16,21],[66,-53,32,19,23],[69,-18,18,32,16],[72,17,23,30,22],[-74,-13,18,30,17],[-73,25,19,26,23]])
    cityBlock(x,z,w,d,h,h%2?brick:cement,1);
  // Fixed cast-iron street standards across the road frame the station and
  // break up the long horizontal eaves at walking height.
  for(const [x,z,dir] of [[-36,21,1],[-36,-18,1],[31,23,-1],[32,-19,-1],[-21,-22,1],[8,-22,1]]){
    add(new T.CylinderGeometry(.11,.22,.65,12),iron,x,.17,z);
    add(new T.CylinderGeometry(.055,.108,5.6,12),iron,x,3.22,z);
    beam([x,5.82,z],[x+.42*dir,6.18,z],.07,.075,iron);
    beam([x+.42*dir,6.18,z],[x+1.42*dir,6.08,z],.07,.075,iron);
    add(new T.CylinderGeometry(.12,.24,.15,16),iron,x+1.42*dir,6.04,z);
    add(new T.CylinderGeometry(.19,.14,.065,16),light,x+1.42*dir,5.94,z);
  }
  // Escape balconies are permanently fixed to the neighbouring tenement.
  for(const [cx,faceZ,levels] of [[-17,-32.83,3],[40,-27.32,3],[12,-33.32,4]]){
    for(let n=0;n<levels;n++){
      const y=2.8+3.05*n;
      box(cx,y,faceZ,3.35,.12,1.18,iron);
      for(const end of [-1,1])box(cx+end*1.61,y+.45,faceZ,.06,.9,1.14,iron);
      box(cx,y+.9,faceZ+.55,3.22,.055,.045,iron);
      for(let j=0;j<12;j++)box(cx-1.55+j*.28,y+.47,faceZ+.55,.027,.86,.027,iron);
      if(n){
        for(const side of [-.23,.23])beam([cx-1.32,y-2.99,faceZ+.43+side],[cx+1.18,y,faceZ+.43+side],.048,.045,iron);
        for(let i=1;i<12;i++)box(cx-1.32+i*2.5/12,y-2.99+i*2.99/12,faceZ+.43,.21,.045,.5,iron);
      }
    }
  }
  for(const z of [-27,32])for(let x=-83;x<84;x+=8)box(x,-.151,z,3,.013,.12,line);
  for(const x of [-31,33])for(let z=-80;z<80;z+=8)box(x,-.149,z,.12,.013,3,line);
  for(const x of [-17,-10])box(x,.012,16,.095,.018,10.8,line);
  // Sidewalk joints and red fire-lane curb. The level continues through the
  // flush apron cut; no raised geometry crosses the southern egress line.
  const curbPaint=surface('fire lane curb','concrete_layers_02',.7,0x883d34);
  for(let i=0;i<15;i++){
    const x=-24.5+i*3.55;if(x> -20 && x< -6)continue;
    box(x,.045,22,3.52,.085,2.55,cement);
    box(x,.03,23.34,3.52,.13,.14,curbPaint);
  }
  for(let i=0;i<12;i++)box(-24,.045,-20+i*3.55,2.2,.08,3.53,cement);
  // A single low-resolution planar reflection covers the sloped wet apron.
  // The scanned water mask breaks the reflection into shallow depressions.
  const water=T.UniformsUtils.clone(Reflector.ReflectorShader.uniforms);
  water.patchMask={value:texture('yard-water-mask.jpg',false)};
  const maskShader={...Reflector.ReflectorShader,uniforms:water,
    vertexShader:Reflector.ReflectorShader.vertexShader
      .replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 groundUV;')
      .replace('vUv = textureMatrix','groundUV=uv; vUv = textureMatrix'),
    fragmentShader:Reflector.ReflectorShader.fragmentShader
      .replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 groundUV; uniform sampler2D patchMask;')
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );',
        `vec2 p=vec2(-24.6+groundUV.x*49.,24.55-groundUV.y*13.8);
         float breakup=texture2D(patchMask,groundUV*vec2(5.4,3.1)).r;
         float bowl=min(length((p-vec2(-20.35,15.05))/vec2(1.85,.56)),
                        min(length((p-vec2(-10.3,18.3))/vec2(3.,.71)),length((p-vec2(6.6,20.15))/vec2(2.05,.44))));
         float mask=1.-smoothstep(.68,1.04,bowl+breakup*.21);
         float path=abs(p.x-(-20.91+.126*(p.y-10.75)+.062*sin((p.y-10.75)*2.1)));
         float stream=(1.-smoothstep(.045,.145+breakup*.034,path))*smoothstep(10.72,10.88,p.y)*(1.-smoothstep(14.9,15.13,p.y));
         mask=max(mask,stream*.82);if(mask<.035)discard;
         vec2 distortion=vec2(sin(groundUV.y*800.+groundUV.x*90.)*.00065,sin(groundUV.x*350.)*.00022);
         vec4 base=texture2D(tDiffuse,vUv.xy/vUv.w+distortion);`)
      .replace('blendOverlay( base.rgb, color ), 1.0','blendOverlay(base.rgb,color), mask*.30')};
  const waterSheet=new Reflector(new T.PlaneGeometry(49,13.8),{textureWidth:384,textureHeight:192,multisample:0,clipBias:.002,color:0x999b9c,shader:maskShader});
  waterSheet.material.uniforms.patchMask.value=water.patchMask.value;
  waterSheet.name='apron rainfall';waterSheet.rotation.x=-Math.PI/2;waterSheet.position.set(-.1,.022,17.65);
  waterSheet.material.transparent=true;waterSheet.material.depthWrite=false;
  const updateReflection=waterSheet.onBeforeRender;let nextCapture=0;const lastCamera=new T.Matrix4().makeScale(0,0,0);let reflectedGate,reflectedEnvironment,reflectedReady;
  waterSheet.onBeforeRender=function(renderer,scene,camera,...args){
    const lightingChanged=reflectedEnvironment!==scene.environment||reflectedReady!==scene.userData.stationMaterialsReady;
    if(camera.position.z<9 || (!lightingChanged && performance.now()<nextCapture))return;
    const gateVisible=meshes.get('gate').visible;
    if(!lightingChanged&&lastCamera.equals(camera.matrixWorld)&&reflectedGate===gateVisible)return;
    reflectedEnvironment=scene.environment;reflectedReady=scene.userData.stationMaterialsReady;
    lastCamera.copy(camera.matrixWorld);reflectedGate=gateVisible;
    nextCapture=performance.now()+140;
    updateReflection.call(this,renderer,scene,camera,...args);
  };
  group.add(waterSheet);
  // Group-by-material meshes keep the detail budget independent of brick/steel counts.
  for(const [mat,geoms] of buckets){
    const geo=mergeGeometries(geoms); geoms.forEach(g=>g.dispose());
    const mesh=new T.Mesh(geo,mat);mesh.name='structure/'+mat.name;
    mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
