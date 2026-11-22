import assert from 'node:assert/strict';
import test from 'node:test';
import {Bone,Group} from 'three';
import {ActionStateMachine} from '../render/action-state-machine.mjs';

test('interrupted fade preserves pose, ignores duplicate requests and returns after one finish',()=>{
  const root=new Group(),bone=new Bone();
  bone.name='pelvis';root.add(bone);
  const clip=x=>({frames:2,bones:1,fps:1,duration:1,trans:Float32Array.of(x,0,0,x,0,0),quat:Float32Array.of(0,0,0,1,0,0,0,1)});
  const clips=new Map([['walk',clip(0)],['attack',clip(1)],['reload',clip(2)]]);
  const finished=[];
  const machine=new ActionStateMachine(root,[bone],clips,{
    onFinished(name){finished.push(name);return {name:'walk',options:{loop:true}};}
  });
  machine.transitionTo('walk',{loop:true});machine.update(.1);
  machine.transitionTo('attack');machine.update(.09);
  assert.equal(machine.transitionTo('attack'),false);
  const mid=bone.position.x;
  machine.transitionTo('reload');machine.update(0);
  assert.ok(Math.abs(mid-bone.position.x)<1e-6);
  machine.update(1.1);machine.update(.2);
  assert.deepEqual(finished,['reload']);
  assert.equal(machine.getSnapshot().name,'walk');
  machine.dispose();
});
