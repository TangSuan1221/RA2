import {
  AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, QuaternionKeyframeTrack,
  VectorKeyframeTrack
} from 'three';

/** @typedef {{loop?:boolean, startTime?:number, rate?:number, duration?:number, warp?:boolean, restart?:boolean}} TransitionOptions */

/** A single bone writer. The caller owns the simulation clock and gameplay locks. */
export class ActionStateMachine {
  constructor(root, bones, clips, hooks = {}) {
    this.root = root;
    this.bones = bones;
    this.clips = clips;
    this.hooks = hooks;
    this.mixer = new AnimationMixer(root);
    this.cache = new Map();
    this.finished = ({action}) => {
      if (action === this.current) this.pendingFinish = action;
    };
    this.mixer.addEventListener('finished', this.finished);
  }

  getClip(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const source = this.clips.get(name);
    if (!source) throw new Error('Unknown animation: ' + name);
    const times = Float32Array.from({length: source.frames}, (_, i) => i / source.fps);
    const tracks = [];
    this.bones.forEach((bone, i) => {
      for (const [key, values, size, Track] of [
        ['position', source.trans, 3, VectorKeyframeTrack],
        ['quaternion', source.quat, 4, QuaternionKeyframeTrack]
      ]) {
        const data = new Float32Array(source.frames * size);
        for (let frame = 0; frame < source.frames; frame++) {
          const offset = (frame * source.bones + i) * size;
          data.set(values.subarray(offset, offset + size), frame * size);
        }
        tracks.push(new Track(bone.name + '.' + key, times, data));
      }
    });
    const clip = new AnimationClip(name, source.duration, tracks);
    this.cache.set(name, clip);
    return clip;
  }

  // Freeze the displayed blend when a second transition interrupts the first.
  freezePose() {
    const tracks = this.bones.flatMap(bone => [
      new VectorKeyframeTrack(bone.name + '.position', [0], bone.position.toArray()),
      new QuaternionKeyframeTrack(bone.name + '.quaternion', [0], bone.quaternion.toArray())
    ]);
    const clip = new AnimationClip('transition pose', 1, tracks);
    this.clearOutgoing();
    this.current.stop();
    this.frozen = clip;
    return this.mixer.clipAction(clip).play();
  }

  clearOutgoing() {
    this.outgoing?.stop();
    if (this.frozen) this.mixer.uncacheClip(this.frozen);
    this.outgoing = this.frozen = null;
  }

  /** @param {string} name @param {TransitionOptions} options */
  transitionTo(name, options = {}) {
    const {loop = false, startTime = 0, rate = 1, duration = .18, warp = false, restart = false} = options;
    if (name === this.name && !restart) return false;
    const next = this.mixer.clipAction(this.getClip(name));
    const previous = this.current;
    if (previous) this.hooks.onExit?.(this.name);
    this.pendingFinish = null;
    const from = previous && (this.outgoing || next === previous) ? this.freezePose() : previous;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(rate);
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.time = Math.max(0, Math.min(next.getClip().duration, startTime));
    next.play();
    if (from && duration > 0) {
      from.crossFadeTo(next, duration, warp && !this.frozen);
      this.outgoing = from;
      this.fadeEnd = this.mixer.time + duration;
    } else if (from) {
      this.outgoing = from;
      this.clearOutgoing();
    }
    this.name = name;
    this.current = next;
    this.hooks.onEnter?.(name);
    return true;
  }

  update(delta) {
    this.mixer.update(delta);
    if (this.outgoing && this.mixer.time >= this.fadeEnd) this.clearOutgoing();
    if (this.pendingFinish) {
      this.pendingFinish = null;
      const next = this.hooks.onFinished?.(this.name);
      if (next) this.transitionTo(next.name, next.options);
    }
  }

  getSnapshot() {
    return {name:this.name, time:this.current?.time ?? 0, blending:!!this.outgoing};
  }

  dispose() {
    this.mixer.removeEventListener('finished', this.finished);
    this.clearOutgoing();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.cache.clear();
    this.current = this.pendingFinish = this.name = null;
  }
}
