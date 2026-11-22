import * as T from 'three';

// Sample the static masonry footprint to tint indirect light at wall/floor
// junctions. Door thresholds stay clear because overhead lintels are excluded.
export function bakeRoomBounce(scene,meshes) {
  const walls=[];
  for(const [id,m] of meshes){
    if(!id.startsWith('wall/'))continue;
    const [,axis,fixed,a,b,lo]=id.split('/');
    if(+lo>.15)continue;
    walls.push({alongX:axis==='x',fixed:+fixed,a:+a,b:+b});
  }
  const width=256,height=144,data=new Uint8Array(width*height*4);
  for(let j=0;j<height;j++)for(let i=0;i<width;i++){
    const x=-24+48*(i+.5)/width,z=-13+26*(j+.5)/height;
    let edge=100;
    for(const w of walls){
      const t=w.alongX?x:z,n=w.alongX?z:x;
      edge=Math.min(edge,(n-w.fixed)**2+Math.max(w.a-t,0,t-w.b)**2);
    }
    const v=Math.round(255*(1-Math.exp(-1.65*Math.sqrt(edge))));
    data.set([v,v,v,255],(j*width+i)*4);
  }
  const map=new T.DataTexture(data,width,height);
  map.minFilter=map.magFilter=T.LinearFilter;map.needsUpdate=true;
  const mats=new Set();
  scene.traverse(m=>{
    if(m.isMesh && (m.name==='Batched station masonry'||m.parent?.name==='Station 27 | architectural finishes')&&!m.isInstancedMesh)
      for(const mat of [].concat(m.material))if(mat.isMeshStandardMaterial)mats.add(mat);
  });
  for(const mat of mats){
    const previous=mat.onBeforeCompile,base=mat.customProgramCacheKey();
    mat.customProgramCacheKey=()=>base+'-floorbounce';
    mat.onBeforeCompile=function(s,r){
      previous.call(this,s,r);
      s.uniforms.roomContact={value:map};
      s.vertexShader='varying vec3 vContactWorld;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvContactWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader='uniform sampler2D roomContact; varying vec3 vContactWorld;\n'+s.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 contactUV=(vContactWorld.xz+vec2(24.,13.))/vec2(48.,26.);
        float clearance=texture2D(roomContact,contactUV).r;
        float contact=(1.-clearance)*exp(-max(vContactWorld.y,0.)*2.5);
        outgoingLight*=1.-.49*contact;
        #include <opaque_fragment>`);
    };
    mat.needsUpdate=true;
  }
}
