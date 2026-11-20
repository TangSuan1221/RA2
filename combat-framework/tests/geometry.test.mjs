import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,BoxGeometry,BufferGeometry,Float32BufferAttribute} from 'three';
import {GeometryQueries} from '../render/geometry-query.mjs';
import {fits,moveCapsule} from '../src/character/collision.mjs';
import {clearSegment} from '../src/ai/navigation.mjs';
import {World} from '../src/world.mjs';
function collisionWorld(boxes){const w=new World({enemyCount:0,obstacles:boxes}),entries=boxes.map(box=>{const mesh=new Mesh(new BoxGeometry(...box.max.map((v,i)=>v-box.min[i])));mesh.position.fromArray(box.min.map((v,i)=>(v+box.max[i])/2));return {mesh,object:box};}),floor=new Mesh(new BoxGeometry(80,.2,80));floor.position.y=-.1;entries.push({mesh:floor,object:{id:'floor'}});const query=new GeometryQueries(entries);query.movementEnabled=true;w.obstacles.geometryQuery=query;w.player.pos=[0,0,-1];return w;}
test('BVH ray and swept sphere query actual transformed triangle mesh',()=>{const mesh=new Mesh(new BoxGeometry(1,2,.2));mesh.position.set(0,1,2);const object={id:'wall'},query=new GeometryQueries([{mesh,object}]);const ray=query.trace([0,1,0],[0,0,1],5),sphere=query.trace([0,1,0],[0,0,1],5,.2);assert.equal(ray.object,object);assert.ok(Math.abs(ray.distance-1.9)<1e-6);assert.ok(Math.abs(sphere.distance-1.7)<.001);query.dispose();mesh.geometry.dispose();});
test('triangle BVH rejects a ray inside bounding box but outside triangle',()=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,2,0,0,0,2,0],3));const mesh=new Mesh(geometry),query=new GeometryQueries([{mesh,object:{id:'triangle'}}]);assert.equal(query.trace([1.8,1.8,-1],[0,0,1],2).object,null);assert.equal(query.trace([.2,.2,-1],[0,0,1],2).object.id,'triangle');query.dispose();geometry.dispose();});
test('triangle capsule stops at wall and climbs only accepted step height',()=>{const wall=collisionWorld([{min:[-2,0,2],max:[2,3,2.2]}]);for(let i=0;i<180;i++)wall.update({z:1});assert.ok(wall.player.pos[2]<1.69);assert.ok(Math.abs(wall.player.pos[1])<.02);for(const height of [.44,.46]){const w=collisionWorld([{min:[-2,0,0],max:[2,height,2]}]);let maximum=0;for(let i=0;i<120;i++){w.update({z:1});maximum=Math.max(maximum,w.player.pos[1]);}if(height===.44)assert.ok(maximum>.43);else {assert.ok(maximum<.05,`invalid step height reached ${maximum}`);assert.ok(w.player.pos[2]<0);}}});
test('triangle slopes hold at forty-five degrees and slide beyond fifty',()=>{for(const angle of [45,55]){const slope=angle*Math.PI/180,h=Math.tan(slope)*10,geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-3,0,0,3,h,10,3,0,0,-3,0,0,-3,h,10,3,h,10],3));const mesh=new Mesh(geometry),w=new World({enemyCount:0,obstacles:[]}),query=new GeometryQueries([{mesh,object:{id:'slope'}}]);query.movementEnabled=true;w.obstacles.geometryQuery=query;w.player.pos=[0,5*Math.tan(slope)+.32*(1/Math.cos(slope)-1)+.005,5];for(let i=0;i<5;i++)w.update();const start=[...w.player.pos];for(let i=0;i<60;i++)w.update();if(angle===45)assert.ok(Math.hypot(...w.player.pos.map((v,i)=>v-start[i]))<.02);else assert.ok(w.player.pos[2]<start[2]-.1);query.dispose();geometry.dispose();}});

test('closed solid rejects deeply contained capsule without treating open terrain as solid',()=>{
 const mesh=new Mesh(new BoxGeometry(10,10,10)),q=new GeometryQueries([{mesh,object:{id:'solid'}}]),actor={radius:.32,height:1.8,posture:'stand',yaw:0};
 const result=q.resolveCapsule(actor,[0,0,0]);assert.ok(Math.hypot(...result.position)>4);assert.equal(q.inside(q.entries[0],new mesh.position.constructor(0,0,0)),true);assert.equal(q.inside(q.entries[0],new mesh.position.constructor(...result.position).addScalar(0)),false);q.dispose();mesh.geometry.dispose();
});

test('deep recovery chooses an exit outside touching solids regardless of entry order',()=>{
 for(const reverse of [false,true]){const lower=new Mesh(new BoxGeometry(10,10,10)),upper=new Mesh(new BoxGeometry(10,4,10));upper.position.y=7;const entries=[{mesh:lower,object:{id:'lower'}},{mesh:upper,object:{id:'upper'}}];if(reverse)entries.reverse();const q=new GeometryQueries(entries),a={radius:.32,height:1.8,posture:'stand',yaw:0},result=q.resolveCapsule(a,[0,0,0]),second=q.resolveCapsule(a,result.position);assert.ok(Math.hypot(...second.position.map((v,i)=>v-result.position[i]))<.006);for(const e of q.entries)assert.equal(q.inside(e,new lower.position.constructor(result.position[0],result.position[1]+.9,result.position[2])),false);q.dispose();lower.geometry.dispose();upper.geometry.dispose();}
});

test('unresolved containment fails closed in clearance navigation and movement',()=>{
 const mesh=new Mesh(new BoxGeometry(10,10,10)),q=new GeometryQueries([{mesh,object:{id:'solid'}}]);q.movementEnabled=true;
 // Simulate obstruction of every proposed recovery exit to exercise failure propagation.
 q.overlap=()=>true;const obstacles=[];obstacles.geometryQuery=q;const actor={pos:[0,0,0],vel:[1,0,0],radius:.32,height:1.8,posture:'stand',yaw:0};
 assert.equal(q.resolveCapsule(actor,actor.pos).valid,false);assert.equal(fits(actor.pos,.32,1.8,obstacles),false);assert.equal(clearSegment([0,0,0],[0,0,1],obstacles,.32,1.8),false);assert.equal(moveCapsule(actor,[.01,0,0],obstacles,.45),true);assert.equal(actor.collisionError,'deep-containment-no-exit');assert.deepEqual(actor.vel,[0,0,0]);q.dispose();mesh.geometry.dispose();
});

test('iteration exhaustion reports unresolved penetration in an undersized gap',()=>{
 const entries=[-.35,.35].map(x=>{const mesh=new Mesh(new BoxGeometry(.2,4,4));mesh.position.set(x,1,0);return {mesh,object:{id:String(x)}};}),q=new GeometryQueries(entries),a={radius:.32,height:1.8,posture:'stand',yaw:0,pos:[0,0,0],vel:[0,0,1]},obstacles=[];q.movementEnabled=true;obstacles.geometryQuery=q;
 const result=q.resolveCapsule(a,a.pos);assert.equal(result.valid,false);assert.equal(result.reason,'surface-penetration-unresolved');assert.equal(fits(a.pos,a.radius,a.height,obstacles),false);moveCapsule(a,[0,0,.01],obstacles,.45);assert.equal(a.collisionError,'surface-penetration-unresolved');q.dispose();for(const e of entries)e.mesh.geometry.dispose();
});

test('generic BVH surface metadata does not enter box-only traversal',()=>{const mesh=new Mesh(new BoxGeometry(4,1,.2));mesh.position.set(0,.5,0);const q=new GeometryQueries([{mesh,object:{id:'generic-wall'}}]),w=new World({enemyCount:0,obstacles:[]});q.movementEnabled=true;w.obstacles.geometryQuery=q;w.player.pos=[0,0,-.8];assert.doesNotThrow(()=>{for(let i=0;i<10;i++)w.update({z:1});});assert.equal(w.player.traversalCandidate,null);q.dispose();mesh.geometry.dispose();});

test('step guard covers three world ticks even when knockback adds collision calls',()=>{const w=collisionWorld([{min:[-2,0,0],max:[2,.44,2]}]),a=w.player;for(let i=0;i<120&&!a.stepGuard;i++)w.update({z:1});assert.equal(a.stepGuard,3);const raised=a.pos[1];a.knockback=[.001,0,0];for(let i=0;i<3;i++){a.vel[1]=-1;w.update();assert.ok(a.pos[1]>=raised-1e-6);assert.equal(a.stepGuard,2-i);}assert.ok(raised>.43);});

test('navigation broad phase cannot hide small floor or ceiling penetration',()=>{for(const ceiling of [false,true]){const mesh=new Mesh(new BoxGeometry(10,.2,10));mesh.position.y=ceiling?1.896:-.1;const q=new GeometryQueries([{mesh,object:{id:'surface'}}]),obstacles=[];q.movementEnabled=true;obstacles.geometryQuery=q;const start=[0,ceiling?0:-.004,0],end=[1,start[1],0];assert.equal(clearSegment(start,end,obstacles,.32,1.8),false);q.dispose();mesh.geometry.dispose();}});
