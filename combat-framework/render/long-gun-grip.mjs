import {Quaternion,Vector3} from 'three';
import {forwardKinematics,sampleAnimation} from '../src/anim/skeleton.mjs';

// Calibrate in character space at neutral aim. Attaching to the wrist then
// preserves the authored recoil, carry and reload throughout interpolation.
export function mountFirearm(model,gun,bones,neutral,isPistol=false){
  const pose=sampleAnimation(neutral,0,false);
  const rest=forwardKinematics(bones,pose.rotations,pose.translations);
  const wrist=bones.findIndex(b=>b.name==='hand_r');
  const knuckle=bones.findIndex(b=>b.name==='middle_01_r');
  const inverse=new Quaternion().fromArray(rest.rotations[wrist]).invert();
  gun.position.fromArray(rest.positions[knuckle]).sub(new Vector3().fromArray(rest.positions[wrist])).multiplyScalar(.70).applyQuaternion(inverse);
  gun.quaternion.copy(inverse);
  if(isPistol)gun.quaternion.multiply(new Quaternion(0,Math.SQRT1_2,Math.SQRT1_2,0));
  model.getObjectByName('hand_r').add(gun);
}

export function poseMagazine(gun,progress){
  const t=Math.min(1,Math.max(0,progress));
  const away=Math.sin(Math.PI*Math.min(1,Math.max(0,(t-.16)/.60)))**2;
  const mag=gun.getObjectByName('magazine');
  mag.position.set(.092*away,-.04-.20*away,.08-.075*away);
  mag.rotation.z=-.34*away;
}
