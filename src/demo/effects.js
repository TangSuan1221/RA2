import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function alternateVehicle(kind){
 const g=new T.Group(),body=new T.MeshStandardMaterial({color:0x556654,metalness:.35,roughness:.6}),dark=new T.MeshStandardMaterial({color:0x292b27}),iron=new T.MeshStandardMaterial({color:0x777c70,metalness:.7}),glass=new T.MeshStandardMaterial({color:0x35464a,metalness:.5,roughness:.2});
 function put(geo,m,x,y,z){const o=new T.Mesh(geo,m);o.position.set(x,y,z);g.add(o);o.castShadow=true;return o}
 const box=(x,y,z,w,h,l,m)=>put(new RoundedBoxGeometry(w,h,l,2,.045),m,x,y,z);
 function wheel(x,y,z,r,w){for(const [radius,width,mat] of [[r,w,dark],[r*.54,w+.015,iron]])put(new T.CylinderGeometry(radius,radius,width,20),mat,x,y,z).rotation.z=Math.PI/2}
 if(kind==='卡车'){box(0,1.05,0,2.45,.48,6.5,body);box(0,1.72,2.1,2.35,.9,2.1,body);box(0,2.43,2.03,2.24,.76,1.8,glass);box(0,2.86,2,2.34,.12,1.91,body);box(0,1.51,-1.05,2.45,.3,4.12,iron);
 for(const x of [-1.16,1.16]){box(x,1.95,-1.05,.16,.7,4.25,body);for(const z of [-2.28,-1.04,2.13])wheel(x,.62,z,.59,.31)}
 box(0,1.95,-3.1,2.4,.7,.15,body)
 }else if(kind==='摩托'){wheel(0,.38,.82,.38,.15);wheel(0,.38,-.72,.38,.19);box(0,.63,0,.39,.48,.95,iron);box(0,.96,.21,.43,.35,.64,body);box(0,.95,-.41,.42,.17,.6,dark);box(0,1.29,.68,.72,.07,.12,iron);box(0,1.16,.77,.25,.23,.18,glass);for(const x of [-.1,.1])box(x,.74,.76,.06,.72,.08,iron).rotation.x=-.18}
 return g;
}
export function weather(scene){
 const count=900, positions=new Float32Array(count*6), tip=new Float32Array(count*2);
 for(let i=0;i<count;i++){
  const x=Math.random()*48-24,y=Math.random()*25,z=Math.random()*48-24;
  positions.set([x,y,z,x,y,z],i*6);tip[i*2+1]=1;
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 geometry.setAttribute('tip',new T.BufferAttribute(tip,1));
 const uniforms={time:{value:0}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  vertexShader:`uniform float time;attribute float tip;varying float intensity;
  void main(){
   float height=mod(position.y-time*15.0,25.0);
   vec3 drop=vec3(position.x+.10*height,height-10.0,position.z);
   drop+=tip*vec3(.04,.43,.012);
   vec4 eye=modelViewMatrix*vec4(drop,1.0);
   intensity=(1.0-smoothstep(10.0,26.0,-eye.z))*(.18+tip*.14);
   gl_Position=projectionMatrix*eye;
  }`,
  fragmentShader:`varying float intensity;void main(){gl_FragColor=vec4(.55,.65,.69,intensity);}`
 });
 const rain=new T.LineSegments(geometry,material);
 rain.frustumCulled=false;scene.add(rain);
 return (camera,time,enabled)=>{rain.visible=enabled;if(enabled){rain.position.copy(camera);uniforms.time.value=time}};
}
export function engineSound(){
 let ctx,osc,gain,filter,muted=false;
 function start(){if(!ctx){ctx=new AudioContext();osc=ctx.createOscillator();filter=ctx.createBiquadFilter();gain=ctx.createGain();osc.type='sawtooth';filter.type='lowpass';filter.frequency.value=150;gain.gain.value=0;osc.connect(filter).connect(gain).connect(ctx.destination);osc.start()}ctx.resume().catch(()=>{})}
 return {start,mute(value){muted=value},update(v,mode){if(!ctx)return;const speed=Math.abs(v),t=ctx.currentTime;osc.frequency.setTargetAtTime((mode==='摩托'?49:mode==='卡车'?22:31)+speed*1.7,t,.12);gain.gain.setTargetAtTime(muted||mode==='步行'?0:.012+speed*.0005,t,.12)}}
}
