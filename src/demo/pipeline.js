import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {Vector3} from 'three';
import {reviewShots} from './review-shots.js';

// Display-referred shadow, midtone and highlight controls measured from each location.
const grades={
 overview:[[67,85,117],[26,58,148]],fort:[[74,109,163],[28,77,185]],
 fire:[[38,74,101],[27,75,151]],home:[[26,118,211],[28,103,240]],
 tower:[[55,98,159],[34,78,159]],underground:[[15,45,84],[8,49,130]],
 conservatory:[[29,59,191],[21,74,188]],rail:[[27,78,205],[14,51,180]],
 dock:[[30,97,232],[18,82,225]],radio:[[21,61,201],[30,90,210]],
 power:[[44,82,197],[23,55,174]],shops:[[54,96,202],[32,104,229]],
 tunnel:[[14,43,226],[12,42,181]],corridor:[[30,81,202],[23,60,151]]
};
// Correct the daylight cast locally, fading the correction out at specular whites.
const balance={overview:[.98,.99,1.16],fire:[1.09,1.04,1.17],tower:[.89,.89,.98],
 conservatory:[.96,.94,.94],rail:[.94,.96,.96],dock:[.94,.96,.98],
 power:[.88,.93,1.02],tunnel:[1.13,1.04,.98]};
export function pipeline(renderer,scene,camera){
 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 const ao=new GTAOPass(scene,camera);ao.updateGtaoMaterial({radius:1.35,thickness:1.1,samples:8});ao.blendIntensity=.8;composer.addPass(ao);
 composer.addPass(new OutputPass());
 const grade=new ShaderPass({
  uniforms:{tDiffuse:{value:null},knots:{value:new Vector3()},values:{value:new Vector3()},balanceRGB:{value:new Vector3(1,1,1)},amount:{value:0}},
  vertexShader:'varying vec2 uv0; void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform vec3 knots,values,balanceRGB;uniform float amount;varying vec2 uv0;
  void main(){vec4 c=texture2D(tDiffuse,uv0);float l=dot(c.rgb,vec3(.299,.587,.114));
  float v=l<knots.x?l*values.x/knots.x:l<knots.y?mix(values.x,values.y,(l-knots.x)/(knots.y-knots.x)):
    l<knots.z?mix(values.y,values.z,(l-knots.y)/(knots.z-knots.y)):mix(values.z,1.,(l-knots.z)/(1.-knots.z));
  vec3 daylightTint=mix(vec3(1.),balanceRGB,amount*(1.-smoothstep(.72,1.,l)));
  gl_FragColor=vec4(c.rgb*daylightTint*mix(1.,v/max(.0001,l),amount),c.a);}`
 });composer.addPass(grade);
 const zones=Object.entries(grades).map(([key,curve])=>({center:reviewShots[key][0],
   balance:new Vector3().fromArray(balance[key]||[1,1,1]),knots:new Vector3().fromArray(curve[0]).multiplyScalar(1/255),
   values:new Vector3().fromArray(curve[1]).multiplyScalar(1/255),radius:key==='overview'?130:60}));
 function localGrade(x,z,night){
  let best=0,total=0;
  const knots=grade.uniforms.knots.value,values=grade.uniforms.values.value;
  const tint=grade.uniforms.balanceRGB.value;
  knots.set(0,0,0);values.set(0,0,0);tint.set(0,0,0);
  for(const zone of zones){
   const w=1-Math.hypot(x-zone.center[0],z-zone.center[2])/zone.radius;
   if(w<=0)continue;
   best=Math.max(best,w);total+=w*w;
   knots.addScaledVector(zone.knots,w*w);values.addScaledVector(zone.values,w*w);tint.addScaledVector(zone.balance,w*w);
  }
  grade.uniforms.amount.value=night?0:Math.min(1,best*1.8)*.88;
  if(total){knots.divideScalar(total);values.divideScalar(total);tint.divideScalar(total);}
  grade.enabled=!night&&best>0;
 }
 function resize(w,h){composer.setSize(w,h);ao.setSize(Math.max(1,Math.round(w*.58)),Math.max(1,Math.round(h*.58)))}
 resize(innerWidth,innerHeight);renderer.info.autoReset=false;
 return {render(){localGrade(camera.position.x,camera.position.z,scene.backgroundIntensity<.1);renderer.info.reset();composer.render()},quality(ratio,showAO){composer.setPixelRatio(ratio);ao.enabled=showAO},resize};
}
