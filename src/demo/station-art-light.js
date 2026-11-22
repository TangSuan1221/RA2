import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

export const studyViews={
  front:{eye:[-3,3.0,36],look:[-.6,3.25,8.6],fov:57},
  corner:{eye:[-26,2.8,20],look:[-10,3.4,8.6],fov:56},
  rooftop:{eye:[-27,16,27],look:[-6.5,2.6,1.5],fov:55},
  garage:{eye:[-17,2.2,-2.5],look:[-12,2.6,10],fov:73},
  workshop:{eye:[-19.65,1.68,-8.7],look:[-12.2,1.85,-3.45],fov:68},
  quarters:{eye:[5.0,1.58,-9.2],look:[11.1,1.48,-6.6],fov:70},
  foyer:{eye:[17.8,1.65,7.3],look:[11.8,1.6,3.8],fov:66},
  passage:{eye:[.3,1.65,8.4],look:[.22,1.55,-7.8],fov:66},
  transom:{eye:[-8.1,1.65,8.7],look:[-16,2.8,-1.9],fov:70}
};
export function lightStructure(scene,renderer,sun){
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  sun.position.set(-18,30,24);sun.color.setHex(0xffe2c2);sun.intensity=2.1;
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-35,right:35,top:36,bottom:-30,near:.5,far:110});
  sun.shadow.bias=-.00022;sun.shadow.normalBias=.035;sun.shadow.camera.updateProjectionMatrix();
  scene.traverse(o=>{if(o.isHemisphereLight){o.intensity=.72;o.color.setHex(0xcbdbeb);o.groundColor.setHex(0x837062);}});
  // Broad daylight bounce immediately inside the real glazing. The limited
  // ranges distinguish the tall bay, workshop and north kitchen opening.
  for(const [x,y,z,power,range,tint] of [[-13,4.7,9.2,32,10,0xffe0b4],[-19.6,2.6,-6.9,14,6.5,0xd9e8ef],[6.9,2.2,-9.6,12,5,0xf6dfba]]){
    const bounce=new T.PointLight(tint,power,range,2);
    bounce.position.set(x,y,z);scene.add(bounce);
  }
  scene.fog=new T.FogExp2(0xa4aba9,.0095);
  return new HDRLoader().loadAsync('/assets/hdri/kloofendal_overcast_puresky_2k.hdr').then(sky=>{
    sky.mapping=T.EquirectangularReflectionMapping;scene.environment=sky;scene.environmentIntensity=.39;
    scene.background=sky;scene.backgroundIntensity=.67;scene.backgroundBlurriness=.08;
  });
}
