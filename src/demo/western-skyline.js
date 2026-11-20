import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Buildings in the second and third ranks behind the west end of the documented city street.
const towers = [
  [810,1240,23,19,14],[797,1310,24,19,11],[732,1234,22,24,20],
  [700,1315,28,22,23],[662,1251,25,23,30],[616,1304,28,21,24],[600,1221,22,21,20],
  [695,1262,21,15,10],[636,1261,22,13,17],[554,1266,19,9,22],[521,1228,26,17,16],
  [551,1297,23,13,13],[577,1238,16,14,27]
];
export function westernSkyline(scene){
  const loader=new T.TextureLoader();
  const map=loader.load('/assets/textures/concrete_moss/concrete_moss_diff_1k.jpg');
  map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;
  const facade=new T.MeshStandardMaterial({map,roughness:.7,color:0xc8c6b9});
  const roof=new T.MeshStandardMaterial({map,roughness:.85,color:0x727d79});
  facade.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 skylinePos;varying vec3 skylineAxis;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nskylinePos=position;skylineAxis=normal;');
    s.fragmentShader='varying vec3 skylinePos;varying vec3 skylineAxis;\n'+s.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      if(abs(skylineAxis.y)<.5){
        float u=abs(skylineAxis.x)>.5?skylinePos.z:skylinePos.x;
        vec2 grid=vec2(u/2.63,skylinePos.y/3.34);
        vec2 cell=fract(grid);
        float seed=fract(sin(dot(floor(grid),vec2(42.37,78.1)))*4375.5);
        float aperture=smoothstep(.10,.13,cell.x)*(1.-smoothstep(.87,.90,cell.x))*smoothstep(.18,.21,cell.y)*(1.-smoothstep(.84,.87,cell.y));
        float mullion=smoothstep(.012,.035,abs(cell.x-.5));
        float reflectedSky=smoothstep(12.,70.,skylinePos.y+6.*sin(u*.18));
        vec3 pane=mix(vec3(.030,.047,.053),vec3(.16,.207,.213),seed*.33+reflectedSky*.53+cell.y*.12);
        if(seed>.82 && cell.y>.55) pane=vec3(.20,.195,.16);
        float rainRun=.54;
        #ifdef USE_MAP
          rainRun=texture2D(map,vec2(u*.41,skylinePos.y*.032)).r;
        #endif
        diffuseColor.rgb*=mix(.67,1.05,smoothstep(.15,.78,rainRun));
        diffuseColor.rgb=mix(diffuseColor.rgb*.95,pane,aperture*mullion);
        diffuseColor.rgb*=.80+.20*smoothstep(.03,.14,cell.y);
      }`);
  };
  const walls=[],roofs=[];
  function box(list,x,y,z,w,h,d){
    const g=new T.BoxGeometry(w,h,d).translate(x,y,z);
    const uv=g.attributes.uv,p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/7,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/7);
    list.push(g);
  }
  for(const [i,[x,z,w,d,floors]] of towers.entries()){
    const h=floors*3.34,cut=i%2===0?h*.72:h*.90;
    box(walls,x,cut/2,z,w,cut,d);
    box(walls,x,(h+cut)/2,z,w-2.2,h-cut,d-2);
    box(roofs,x,cut+.22,z,w+.40,.44,d+.40);
    box(roofs,x,h+.20,z,w-1.5,.4,d-1.4);
    box(roofs,x-w*.14,h+1.7,z+d*.14,w*.35,3,d*.28);
        if(i%3===1)box(roofs,x,h+4.25,z,.25,6,.25);
    if(i>=7){
      const stories=Math.max(3,Math.round(floors*.44)),b=stories*3.34;
      box(walls,x+w*.25,b/2,z+d*.33,w*.75,b,d*.5);
      box(roofs,x+w*.25,b+.18,z+d*.33,w*.77,.35,d*.52);
      if(i%2===0)box(walls,x-w*.21,h+1.83,z-.95,w*.42,3.66,d*.41);
    }
    for(let j=0;j<3;j++)box(roofs,x-w*.30+j*2.5,h+.78,z-d*.28,1.8,1.1,1.5);
  }
  for(const [geos,mat] of [[walls,facade],[roofs,roof]]){
    const mesh=new T.Mesh(mergeGeometries(geos),mat);mesh.name='Western street skyline';mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);for(const g of geos)g.dispose();
  }
}
