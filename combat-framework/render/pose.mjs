import {PropertyBinding,Quaternion} from 'three';

/** Direct track sampling: no AnimationMixer and no baked/synthetic substitute motion. */
export class PosePlayer {
  constructor(root,clips){
    this.root=root;this.clips=new Map(clips.map(c=>[c.name,c]));this.name='';this.transition=1;
    this.channels=new Map();this.samplers=new Map();
    for(const clip of clips){const samplers=[];for(const track of clip.tracks){let channel=this.channels.get(track.name);if(!channel){const size=track.getValueSize(),binding=PropertyBinding.create(root,track.name);binding.bind();const rest=new Float32Array(size);binding.getValue(rest,0);channel={binding,rest,from:rest.slice(),current:rest.slice(),size,quaternion:track.ValueTypeName==='quaternion'};this.channels.set(track.name,channel);}samplers.push({channel,interpolant:track.createInterpolant()});}this.samplers.set(clip.name,samplers);}
    this.qa=new Quaternion();this.qb=new Quaternion();
  }
  bindSkeleton(bones){this.bones=bones.map(b=>{const node=this.root.getObjectByName(b.name);if(!node)throw Error('Render skeleton missing '+b.name);return node;});}
  applyPose(previous,current,alpha){if(!this.bones||!current)return;for(let i=0;i<this.bones.length;i++){const bone=this.bones[i];bone.quaternion.fromArray(previous.rotations[i]);this.qb.fromArray(current.rotations[i]);bone.quaternion.slerp(this.qb,alpha);bone.position.fromArray(previous.translations[i]);bone.position.x+=(current.translations[i][0]-bone.position.x)*alpha;bone.position.y+=(current.translations[i][1]-bone.position.y)*alpha;bone.position.z+=(current.translations[i][2]-bone.position.z)*alpha;}this.root.updateMatrixWorld(true);}
  sample(name,time,dt,loop=true,upper=null,upperTime=0){
    if(!this.clips.has(name))name='Idle_Loop';
    if(name!==this.name){this.name=name;this.transition=0;for(const ch of this.channels.values())ch.from.set(ch.current);}
    this.transition=Math.min(1,this.transition+dt/.18);const blend=this.transition*this.transition*(3-2*this.transition);
    const clip=this.clips.get(name),t=loop?time%Math.max(.001,clip.duration):Math.min(time,clip.duration);
    for(const ch of this.channels.values())ch.current.set(ch.rest);
    for(const s of this.samplers.get(name))s.channel.current.set(s.interpolant.evaluate(t));
    if(upper&&this.samplers.has(upper)){
      const upperChannels=new Set([...this.channels.entries()].filter(([n])=>/spine|neck|Head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb/i.test(n)).map(([,c])=>c));
      for(const s of this.samplers.get(upper))if(upperChannels.has(s.channel))s.channel.current.set(s.interpolant.evaluate(Math.min(upperTime,this.clips.get(upper).duration)));
    }
    for(const ch of this.channels.values()){
      if(ch.quaternion){this.qa.fromArray(ch.from);this.qb.fromArray(ch.current);this.qa.slerp(this.qb,blend).toArray(ch.current);}
      else for(let j=0;j<ch.size;j++)ch.current[j]=ch.from[j]+(ch.current[j]-ch.from[j])*blend;
      ch.binding.setValue(ch.current,0);
    }
    this.root.updateMatrixWorld(true);
  }
}
