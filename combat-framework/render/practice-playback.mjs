import {Bone, Group, Quaternion, Vector3} from 'three';
import {ActionStateMachine} from './action-state-machine.mjs';
import {sampleAnimation} from '../src/anim/skeleton.mjs';
import {MM} from '../src/core/constants.mjs';

/** CrossFade comparison on the practice actor. Gameplay and its timers stay in World. */
export class PracticePlayback {
  constructor(actor, view) {
    this.actor = actor;
    this.view = view;
    const root = new Group();
    this.bones = view.pose.bones.map(source => {
      const bone = new Bone();
      bone.name = source.name;
      bone.position.copy(source.position);
      bone.quaternion.copy(source.quaternion);
      root.add(bone);
      return bone;
    });
    this.offsets = this.bones.map(() => ({rotation:new Quaternion(), position:new Vector3()}));
    this.machine = new ActionStateMachine(root, this.bones, actor.rootAnimation.clips, {
      onFinished: name => {
        this.lastFinished = name;
        // Only free locomotion can accept a fallback. Montage locks belong to World.
        const selected = actor.selectedMotion;
        if (actor.state === 'idle' && selected && selected.clip !== name && actor.posture !== 'prone') {
          return {name:selected.clip, options:{startTime:selected.time, loop:actor.rootAnimation.clips.get(selected.clip).loop}};
        }
      }
    });
    this.rotation = new Quaternion();
    this.inverse = new Quaternion();
    this.translation = new Vector3();
    this.basePosition = new Vector3();
  }

  update(dt) {
    const a = this.actor, machine = this.machine;
    const source = a.rootAnimation.clips.get(a.clip);
    if (!source) return;
    const loop = a.state === 'idle' && source.loop;
    const time = a.skeletonPlayer.baseClock?.time ?? a.clipTime;
    let advance = time - (this.lastTime ?? time);
    if (loop && advance < -source.duration / 2) advance += source.duration;
    if (loop && advance > source.duration / 2) advance -= source.duration;
    const restart = a.state !== this.state || Math.abs(advance) > .12;
    const changed = machine.transitionTo(a.clip, {
      restart, startTime:time, loop, duration:a.skeletonPlayer.blendDuration ?? MM.BLEND_T
    });
    // Preserve matched entry frames, reversed posture transitions and montage timing.
    machine.current.timeScale = changed ? 0 : advance / dt;
    machine.update(dt);
    this.lastTime = time;
    this.state = a.state;
    const base = sampleAnimation(source, time, loop);
    const layered = a.skeletonPlayer.target(a, time, a.skeletonPlayer.upperClock?.time ?? 0);
    const weight = 1 - Math.exp(-dt / .045);
    this.bones.forEach((bone, i) => {
      const offset = this.offsets[i];
      this.inverse.fromArray(base.rotations[i]).invert();
      this.rotation.fromArray(layered.rotations[i]).multiply(this.inverse);
      offset.rotation.slerp(this.rotation, weight);
      this.translation.fromArray(layered.translations[i]).sub(this.basePosition.fromArray(base.translations[i]));
      offset.position.lerp(this.translation, weight);
    });
    this.previous = this.pose;
    this.pose = {rotations:[], translations:[]};
    this.bones.forEach((bone,i)=>{
      this.pose.rotations.push(this.rotation.copy(this.offsets[i].rotation).multiply(bone.quaternion).toArray());
      this.pose.translations.push(this.translation.copy(bone.position).add(this.offsets[i].position).toArray());
    });
  }


  render(alpha) {
    if (this.pose) this.view.pose.applyPose(this.previous || this.pose, this.pose, alpha);
  }

  dispose() { this.machine.dispose(); }
}
