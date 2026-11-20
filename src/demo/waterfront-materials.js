import * as T from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

// Local WebGL adaptation of roughness-gated planar water in threejs-conference.
// One reflection view covers all the disconnected patches of standing water.
export function cellarWater({x=431.9,y=-3.584,z=1319,width=8,length=32,yaw=0,name='Pioneer shopfront runoff'}={}){
  const base=Reflector.ReflectorShader;
  const shader={
    name:'CellarRunoff',uniforms:{...base.uniforms,tick:{value:0}},
    vertexShader:'varying vec2 groundUv;\n'+base.vertexShader.replace('vUv = textureMatrix','groundUv = uv;\n vUv = textureMatrix'),
    fragmentShader:`uniform float tick; varying vec2 groundUv;
      float cellHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float cells(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(cellHash(a),cellHash(a+vec2(1.,0.)),f.x),
      mix(cellHash(a+vec2(0.,1.)),cellHash(a+1.),f.x),f.y);}`+
      base.fragmentShader.replace('vec4 base = texture2DProj( tDiffuse, vUv );',`
        vec2 p=groundUv*vec2(8.,32.);
        float bank=min(min(p.x,8.-p.x),min(p.y,32.-p.y));
        float basin=cells(p*vec2(.35,.16))*.68+cells(p*1.05)*.22+cells(p*3.)*.10;
        float softness=smoothstep(.54,.66,basin)*smoothstep(.04,.55,bank);
        if(softness<.025)discard;
        vec2 ripple=vec2(sin(p.y*16.+tick),cos(p.x*13.+p.y*.4-tick))*.00045;
        vec2 uvR=vUv.xy/vUv.w+ripple;
        vec3 mirror=texture2D(tDiffuse,uvR).rgb*.5;
        mirror+=(texture2D(tDiffuse,uvR+vec2(.0015,.001)).rgb+
                 texture2D(tDiffuse,uvR-vec2(.0015,.001)).rgb)*.25;`)
      .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4(mix(vec3(.025,.031,.026), mirror,.72),softness*.76)')
  };
  const water=new Reflector(new T.PlaneGeometry(width,length),{textureWidth:384,textureHeight:216,clipBias:.002,shader,multisample:0});
  water.name=name;
  water.material.transparent=true;water.material.depthWrite=false;
  water.rotation.order='YXZ';water.rotation.set(-Math.PI/2,yaw,0);water.position.set(x,y,z);
  const render=water.onBeforeRender;let last=-Infinity;
  water.onBeforeRender=function(renderer,scene,camera,...args){
    if(scene.overrideMaterial||Math.hypot(camera.position.x-x,camera.position.z-z)>65)return;
    const t=performance.now();water.material.uniforms.tick.value=t*.0015;
    if(t-last<100)return;
    last=t;render.call(water,renderer,scene,camera,...args);
  };
  water.renderOrder=2;
  return water;
}

export function cellarSilt(texture){
  const material=new T.MeshStandardMaterial({
    color:0x8d846a,roughness:.69,transparent:true,depthWrite:false,
    map:texture('textures/brown_mud_leaves_01/brown_mud_leaves_01_diff_1k.jpg',true),
    normalMap:texture('textures/brown_mud_leaves_01/brown_mud_leaves_01_nor_gl_1k.jpg'),
    normalScale:new T.Vector2(.48,.48)
  });
  material.onBeforeCompile=s=>{
    s.vertexShader='varying vec2 siltUv;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsiltUv=uv;');
    s.fragmentShader='varying vec2 siltUv;\n'+s.fragmentShader.replace('#include <map_fragment>',`
      vec2 st=siltUv*vec2(3.5,12.0);
      vec3 soil=texture2D(map,st).rgb;
      vec3 second=texture2D(map,mat2(.91,-.42,.42,.91)*st*.73+.39).rgb;
      float mixAmount=smoothstep(.21,.73,texture2D(map,st*.19).g);
      float d=min(siltUv.x,1.-siltUv.x);
      float bank=(1.-smoothstep(.05,.35,d))*.45;
      float end=min(siltUv.y,1.-siltUv.y);
      diffuseColor.rgb*=mix(soil,second,mixAmount);
      // The long roof slit lights the stair end. The near span shades its landing.
      float opening=exp(-pow((siltUv.x-.49)/.39,2.)-pow((siltUv.y-.73)/.23,2.));
      float lintelShadow=1.-smoothstep(.24,.54,siltUv.y);
      diffuseColor.rgb*=mix(.57,1.0,1.-lintelShadow)+opening*.9;
      diffuseColor.rgb+=opening*vec3(.073,.077,.064);
      diffuseColor.a=smoothstep(.0,.028,end)*smoothstep(0.,.04,d)*
        clamp(.24+bank+.4*mixAmount,0.,.85);`);
  };
  const film=new T.Mesh(new T.PlaneGeometry(10.8,33.8),material);
  film.rotation.x=-Math.PI/2;film.position.set(431.8,-3.62,1319.6);
  // One local fill represents daylight reflected by the pale stairwell walls.
  // The film rests on the XZ plane, so its local Y axis points towards the exit.
  const skylight=new T.SpotLight(0xe1edf4,190,20,.89,.78,1.5);
  skylight.position.set(1,19.2,6.2);
  skylight.target.position.set(.3,19.9,.2);
  film.add(skylight,skylight.target);
  film.renderOrder=1;film.receiveShadow=true;return film;
}

export function greenhouseGlass(){
  const m=new T.MeshPhysicalMaterial({color:0xb1c0b4,transparent:true,opacity:.44,roughness:.36,
    metalness:.03,clearcoat:.4,clearcoatRoughness:.2,side:T.DoubleSide,depthWrite:false});
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 plantGlassPoint;varying vec2 glassUV;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nglassUV=uv;plantGlassPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 plantGlassPoint;varying vec2 glassUV;\n'+s.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 p=plantGlassPoint;
      float drops=.5+.5*sin(p.x*14.+p.z*19.+1.9*sin(p.x*2.2+p.z*3.3)+p.y*.19);
      float damp=(1.-smoothstep(.1,7.1,p.y))*(.45+.55*drops);
      float dust=.5+.5*sin(p.x*1.3+p.y*.7+sin(p.z*1.95));
      diffuseColor.rgb*=mix(vec3(.86,.92,.89),vec3(.37,.47,.27),damp);
      vec2 grid=abs(fract(glassUV*vec2(3.,2.0)+.5)-.5);
      float grating=1.-smoothstep(.003,.018,min(grid.x,grid.y));
      float edge=1.-smoothstep(.02,.16,min(grid.x,grid.y));
      diffuseColor.rgb*=mix(vec3(.94,1.,.96),vec3(.25,.36,.29),grating+.16*edge*(1.-grating));
      diffuseColor.a=clamp(.34+damp*.37+dust*.19+grating*.44,.32,.93);`);
  };return m;
}

export function oxidizedTowerGlass(){
  const m=new T.MeshPhysicalMaterial({color:0x53696a,roughness:.36,metalness:.24,clearcoat:.35,clearcoatRoughness:.32});
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec2 paneUv;varying vec3 paneP;\n'+s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\npaneUv=uv;paneP=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec2 paneUv;varying vec3 paneP;\n'+s.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float column=paneP.x+paneP.z;
      float drip=.5+.5*sin(column*9.5+sin(column*3.41)*2.6+paneP.y*.11);
      float dust=(1.-smoothstep(.01,.29,paneUv.y))*(.35+.65*drip);
      float rust=smoothstep(.73,.95,drip)*(.38+.62*clamp(1.-paneUv.y,0.,1.));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.099,.057,.023),.47*rust);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.075,.035),dust*.75);
    `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+.40*dust+.17*rust,.15,.94);');
  };return m;
}

export function tidalTimber(texture){
  const m=new T.MeshPhysicalMaterial({
    color:0xa69d85,roughness:.81,clearcoat:.58,clearcoatRoughness:.13,
    map:texture('textures/weathered_planks/weathered_planks_diff_1k.jpg',true),
    normalMap:texture('textures/weathered_planks/weathered_planks_nor_gl_1k.jpg'),normalScale:new T.Vector2(.46,.46)
  });
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 quayP;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nquayP=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 quayP;\n'+s.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec2 q=quayP.xz;
      float wear=.5+.5*sin(q.x*2.27+q.y*.29+sin(q.y*.91+q.x*.47)*1.8);
      float lowline=1.-smoothstep(.24,.78,quayP.y);
      float damp=clamp(smoothstep(.38,.88,wear)*.57+lowline*.35,0.,.94);
      diffuseColor.rgb*=1.-damp*.53;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.52,.76,.49),lowline*(.45+.45*wear));`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.14,damp);');
  };return m;
}

// The Quick_Grass example weights movement by blade height. A curved, creased
// leaf silhouette and a stationary root apply that same rule to wet broadleaf plants.
export function greenhouseLeaves(){
  const vertices=[],colors=[],uv=[],indices=[],color=new T.Color();
  for(let j=0;j<9;j++){
    const angle=j*2.39996,spread=.48+(j%3)*.17,height=.74+(j%4)*.15;
    for(let i=0;i<9;i++){
      const f=i/8,w=Math.pow(Math.sin(Math.PI*f),.85)*.115+.005,along=f*spread;
      for(let k=-1;k<=1;k++){
        const y=height*Math.sin(f*2.13)-Math.abs(k)*w*.26;
        vertices.push(Math.cos(angle)*along-Math.sin(angle)*k*w,y,Math.sin(angle)*along+Math.cos(angle)*k*w);
        color.setHSL(.207+j*.002,.49-f*.10,.15+f*.115+(k===0?.020:0),T.SRGBColorSpace);colors.push(color.r,color.g,color.b);
        uv.push((k+1)*.5,f);
      }
      if(i>0){const b=j*27+i*3;for(let k=0;k<2;k++)indices.push(b+k-3,b+k,b+k+1,b+k-3,b+k+1,b+k-2);}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const m=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.82});
  const wind={value:0};
  m.onBeforeCompile=s=>{s.uniforms.greenhouseWind=wind;s.vertexShader='varying vec2 bladeUv;uniform float greenhouseWind;\n'+s.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    bladeUv=uv;
    transformed.x+=.035*position.y*position.y*sin(greenhouseWind+instanceMatrix[3].x*.43);
    transformed.z+=.016*position.y*sin(greenhouseWind*.77+instanceMatrix[3].z*.51);`);
    s.fragmentShader='varying vec2 bladeUv;\n'+s.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float stripe=.5+.5*cos(bladeUv.y*69.-abs(bladeUv.x-.5)*14.);
      diffuseColor.rgb*=.83+.17*smoothstep(.2,.76,stripe);`);};
  const plants=new T.InstancedMesh(g,m,74),o=new T.Object3D();
  for(let i=0;i<74;i++){
    const x=628.3+(i*7.24)%10.7,z=255.6+(i*3.62)%16.3;
    o.position.set(x,.05,z);o.rotation.y=i*2.4;
    const size=.66+(i%11)*.13;o.scale.set(size,size*(.71+(i%4)*.12),size);o.updateMatrix();plants.setMatrixAt(i,o.matrix);
  }
  plants.onBeforeRender=()=>{wind.value=performance.now()*.00066;};
  plants.castShadow=true;plants.receiveShadow=true;plants.computeBoundingSphere();
  return plants;
}
