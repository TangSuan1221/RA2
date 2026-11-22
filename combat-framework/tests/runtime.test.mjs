import {predictTrajectory} from '../src/anim/trajectory.mjs';
import {movementInput} from '../src/input/buffer.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {World} from '../src/world.mjs';
import {FixedLoop} from '../src/core/loop.mjs';
import {createFighter,beginAttack,applyHit} from '../src/combat/resolve.mjs';
import {createTable,updateTable,requestSlot,freezeTargetTokens} from '../src/combat/slot.mjs';
import {CFG} from '../src/config.mjs';
import {fits} from '../src/character/collision.mjs';
import {navigationGoal} from '../src/ai/navigation.mjs';
import {separateActors} from '../src/character/separation.mjs';
import {motor} from '../src/character/motor.mjs';
import {CameraRig} from '../src/camera/rig.mjs';
const attack=(a,s)=>beginAttack(a,CFG.moves.light,s);
test('same-step multi-target damage and outward knockback',()=>{const a=createFighter('a'),b=createFighter('b',{pos:[0,0,1]}),c=createFighter('c',{pos:[0,0,1]});const atk=attack(a,0);assert.equal(applyHit(a,b,atk,CFG.moves.light,16).damage,22);assert.equal(applyHit(a,c,atk,CFG.moves.light,16).damage,22);assert.ok(b.knockback[2]>0);assert.equal(applyHit(a,b,atk,CFG.moves.light,16).reason,'duplicate');});
test('armor limited to torso and leg threshold accumulates',()=>{const a=createFighter('a'),b=createFighter('b',{armor:.7});assert.equal(applyHit(a,b,attack(a,0),{damage:10,hitstopMs:0},0,{part:'head'}).damage,18);applyHit(a,b,attack(a,1),{damage:10,hitstopMs:0},1,{part:'leg'});assert.equal(b.brokenLeg,false);for(let s=2;s<5;s++)applyHit(a,b,attack(a,s),{damage:10,hitstopMs:0},s,{part:'leg'});assert.equal(b.brokenLeg,true);});
test('exclusive slots and target-specific freeze',()=>{const t=createTable();updateTable(t,{pos:[0,0],yaw:0},[],0);assert.equal(requestSlot(t,{actorId:'a',targetId:'player',slotIndex:0},0).granted,true);assert.equal(requestSlot(t,{actorId:'b',slotIndex:0},0).reason,'occupied');assert.equal(requestSlot(t,{actorId:'b',targetId:'ally',slotIndex:1},0).granted,true);freezeTargetTokens(t,'player',1);assert.equal(t.tokens.has('a'),false);assert.equal(t.tokens.has('b'),true);});
test('runtime windup never damages and active strike does',()=>{const w=new World({enemyCount:1,obstacles:[]});w.player.pos=[0,0,0];w.enemies[0].pos=[0,0,1.2];w.update({commands:['light']});for(let s=1;s<16;s++)w.update();assert.equal(w.enemies[0].hp,100);w.update();assert.equal(w.enemies[0].hp,78);});
test('fixed loop replay hashes identical at 30/60/144Hz',()=>{const runs=[];for(const hz of [30,60,144]){const w=new World({enemyCount:4,obstacles:[]}),hashes=[];const loop=new FixedLoop((dt,t)=>{w.update({z:t<180?1:0,x:t>=180&&t<300?1:0,commands:t%77===0?['light']:t%181===0?['dodge']:[]},dt);hashes.push(createHash('sha256').update(JSON.stringify(w.snapshot())).digest('hex'));});for(let f=0;f<hz*20;f++)loop.advance(1/hz);assert.equal(loop.tick,1200);assert.equal(loop.overrun,0);runs.push(hashes);}assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[1],runs[2]);});
test('stand-up blocked by ceiling',()=>{const w=new World({enemyCount:0});w.player.pos=[-3,0,-6];w.player.height=1.05;w.player.posture='crouch';w.update({commands:['crouch']});for(let i=0;i<90;i++)w.update();assert.ok(w.player.height<=1.55);assert.ok(fits(w.player.pos,w.player.radius,w.player.height,w.obstacles));});
test('collision stops forward movement against boundary',()=>{const w=new World({enemyCount:0});for(let i=0;i<1200;i++)w.update({z:-1,sprint:true});assert.ok(w.player.pos[2]>=-17+.31);assert.ok(w.player.pos.every(Number.isFinite));});
test('dodge iframe expires after twelve simulation steps',()=>{const w=new World({enemyCount:0,obstacles:[]});w.update({commands:['dodge']});assert.equal(w.player.iframeUntil,12);const e=createFighter('e');assert.equal(applyHit(e,w.player,attack(e,11),{damage:10,hitstopMs:0},11).reason,'iframe');assert.equal(applyHit(e,w.player,attack(e,12),{damage:10,hitstopMs:0},12).damage,10);});
test('default walls leave usable combat slots and alert AI can attack',()=>{const w=new World({enemyCount:1});w.player.pos=[0,0,0];w.enemies[0].pos=[0,0,2];w.enemies[0].yaw=Math.PI;for(let i=0;i<300;i++)w.update();assert.ok(w.table.slots.length>0);assert.ok(w.events.some(e=>e.type==='melee_hit'&&e.actorId==='enemy-0'));assert.ok(w.player.hp<100);});
test('explosion respects dodge and execution protection',()=>{const w=new World({enemyCount:1,obstacles:[]});w.player.pos=[0,0,0];w.enemies[0].pos=[0,0,1];w.player.iframeUntil=10;w.enemies[0].execLock={partnerId:'other',untilStep:10};w.projectiles.push({pos:[0,0,0],explode:0,vel:[0,0,0]});w.update();assert.equal(w.player.hp,100);assert.equal(w.enemies[0].hp,100);});
test('reload cannot fire in its entry frame',()=>{const w=new World({enemyCount:0});w.ammo=3;w.update({aim:true,fire:true,commands:['reload']});assert.equal(w.ammo,3);assert.equal(w.player.state,'reload');});
test('frozen attack retains phase duration and does not enable early cancel',()=>{const w=new World({enemyCount:1,obstacles:[]});w.player.pos=[0,0,0];w.enemies[0].pos=[0,0,1.2];w.update({commands:['light']});for(let i=1;i<26;i++)w.update();const atk=w.player.attack;assert.equal(atk.endStep-atk.startStep,39);w.update({commands:['dodge']});assert.notEqual(w.player.state,'dodge');});
test('repeat dodge cannot extend invulnerability during active dodge',()=>{const w=new World({enemyCount:0,obstacles:[]});for(let s=0;s<30;s++)w.update({commands:s%10===0?['dodge']:[]});assert.equal(w.player.iframeUntil,12);assert.equal(w.player.busyUntil,33);});
test('shot animation survives on upper layer',()=>{const w=new World({enemyCount:0,obstacles:[]});w.update({aim:true,fire:true});assert.equal(w.player.upperClip,'Pistol_Shoot');assert.equal(w.player.clip,'Idle_Loop');assert.ok(w.player.upperTime>0);});
test('attack cancel opens at sixty percent of recovery, not total duration',()=>{for(const [step,allowed]of [[25,false],[31,false],[32,true]]){const w=new World({enemyCount:0,obstacles:[]});w.startAttack(w.player);w.step=step;w.update({commands:['dodge']});assert.equal(w.player.state==='dodge',allowed);}});
test('navigation routes standing capsule around overhead beam',()=>{const obstacles=[{min:[-1,1.2,0],max:[1,2.2,1]}],w=new World({enemyCount:0,obstacles}),a=w.player,goal=[0,0,2];a.pos=[0,0,-1];let usedPath=false;for(let step=0;step<600;step++){const target=navigationGoal(a,goal,obstacles,step),dx=target[0]-a.pos[0],dz=target[2]-a.pos[2],len=Math.hypot(dx,dz);usedPath||=!!a.path;motor(a,{x:len>.08?dx/len:0,z:len>.08?dz/len:0,walk:true},1/60,obstacles);assert.ok(fits(a.pos,a.radius,a.height,obstacles));}assert.ok(usedPath);assert.ok(Math.hypot(a.pos[0]-goal[0],a.pos[2]-goal[2])<.2);});
test('context traversal waits for stability and keeps collision through vault and climb',()=>{for(const height of [.9,1.9]){const obstacles=[{id:'ledge',min:[-1,0,0],max:[1,height,height>1.2?1:.5]}],w=new World({enemyCount:0,obstacles});w.player.pos=[0,0,-.4];for(let i=0;i<100;i++){w.update({commands:i===0?['execute']:[]});assert.ok(fits(w.player.pos,w.player.radius,w.player.height,obstacles));if(i<5)assert.equal(w.player.traversal,undefined);}assert.equal(w.events[0]?.step,5);assert.equal(w.player.state,'idle');assert.ok(w.player.pos[2]>0);assert.equal(w.player.pos[1],height>1.2?height:0);}});
test('traversal rejects excessive height, aim and obstructed arc',()=>{for(const setup of ['high','aim','ceiling']){const obstacles=[{id:'ledge',min:[-1,0,0],max:[1,setup==='high'?2.21:.9,.5]}];if(setup==='ceiling')obstacles.push({min:[-1,2,-1],max:[1,3,1]});const w=new World({enemyCount:0,obstacles});w.player.pos=[0,0,-.4];for(let i=0;i<20;i++)w.update({aim:setup==='aim',commands:i===0?['execute']:[]});assert.equal(w.events.filter(e=>e.type==='traversal_start').length,0);}});
test('climb rejects unsupported landing on thin wall',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-1,0,0],max:[1,1.9,.1]}]});w.player.pos=[0,0,-.4];for(let i=0;i<100;i++)w.update({commands:i===0?['execute']:[]});assert.equal(w.events.length,0);assert.equal(w.player.pos[1],0);});
test('cached traversal rechecks aim and posture before entry',()=>{for(const mode of ['aim','prone']){const w=new World({enemyCount:0,obstacles:[{min:[-1,0,0],max:[1,.9,.5]}]});w.player.pos=[0,0,-.4];for(let i=0;i<6;i++)w.update({aim:i===5&&mode==='aim',commands:i===0?['execute']:i===5&&mode==='prone'?['prone']:[]});assert.equal(w.player.traversal,undefined);}});
test('death clears traversal and infinite busy lock',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-1,0,0],max:[1,.9,.5]}]});w.player.pos=[0,0,-.4];for(let i=0;i<10;i++)w.update({commands:i===0?['execute']:[]});assert.ok(w.player.traversal);w.player.hp=0;w.update();assert.equal(w.player.traversal,null);assert.ok(Number.isFinite(w.player.busyUntil));assert.equal(w.player.state,'dead');});
test('crouch transition takes eleven 60Hz steps and aim has separate strafe speed',()=>{const w=new World({enemyCount:0,obstacles:[]});for(let s=0;s<10;s++)w.update({commands:s===0?['crouch']:[]});assert.ok(w.player.height>1.05);w.update();assert.equal(w.player.height,1.05);for(const [input,speed]of [[{x:1},2.2],[{z:1},1.35]]){const v=new World({enemyCount:0,obstacles:[]});for(let i=0;i<60;i++)v.update({...input,aim:true,yaw:0});assert.ok(Math.abs(Math.hypot(v.player.vel[0],v.player.vel[2])-speed)<1e-8);assert.ok(Number.isFinite(v.player.yaw));}});
test('reticle converges shoulder camera shot and weapon trace respects near cover',()=>{for(const blocked of [false,true]){const obstacles=blocked?[{min:[-.2,0,.3],max:[.2,2,.6]}]:[],w=new World({enemyCount:1,obstacles});w.player.pos=[0,0,0];w.enemies[0].pos=[.5,0,5];w.update({aim:true,fire:true,yaw:0,pitch:0,cameraOrigin:[.5,1.6,-2]});assert.equal(w.enemies[0].hp<100,!blocked);assert.equal(w.ammo,7);if(blocked)assert.ok(w.shot.to[2]<=.6);}});
test('camera fixed-clock replay agrees at 30/60/144Hz and aim FOV reaches target',()=>{const runs=[];for(const hz of [30,60,144]){const w=new World({enemyCount:0}),rig=new CameraRig(),poses=[];const loop=new FixedLoop((dt,step)=>{w.update({z:step<90?1:0});rig.update(w.player,{yaw:step*.003,pitch:.1,aim:step>=90,shoulder:step>120?-1:1},w.obstacles,dt);poses.push(structuredClone(rig.current));});for(let f=0;f<hz*4;f++)loop.advance(1/hz);assert.equal(poses[104].fov,42);runs.push(poses);}assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[1],runs[2]);});
test('camera interpolation does not cut through pillar between safe endpoints',()=>{const w=new World({enemyCount:0,obstacles:[]}),rig=new CameraRig(),box={min:[-.2,0,-1.8],max:[.2,3,-1.5]};w.player.pos=[0,0,0];rig.update(w.player,{yaw:-1},[box]);rig.update(w.player,{yaw:1},[box]);for(let i=0;i<=100;i++){const p=rig.interpolate(i/100).position;assert.ok(!p.every((v,j)=>v>box.min[j]&&v<box.max[j]));}});
test('prone body clearance rejects thin pillar between former probe circles',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-.04,0,-.4],max:[.04,.4,-.36]}]});w.player.pos=[0,0,0];w.update({commands:['prone']});assert.equal(w.player.posture,'stand');});

test('sprint reversal brakes to jog before yaw changes',()=>{const w=new World({enemyCount:0,obstacles:[]}),a=w.player;a.vel=[0,0,5.6];a.yaw=0;let turned=false;for(let i=0;i<90;i++){const previous=a.yaw;motor(a,{x:0,z:-1,sprint:true},1/60,[]);if(a.sprintBraking){assert.equal(a.yaw,previous);assert.ok(a.vel[2]>0);}if(a.yaw!==previous){turned=true;if(Math.abs(previous)<1e-9)assert.ok(Math.hypot(a.vel[0],a.vel[2])<=3.35+1e-6);assert.ok(Math.abs(a.yaw-previous)<=Math.PI/60+1e-9);}}assert.equal(turned,true);assert.ok(Math.abs(a.yaw-Math.PI)<1e-6);});
test('blocked desired movement exposes stuck and clears after moving away',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-2,0,0],max:[2,3,.2]}]}),a=w.player;a.pos=[0,0,-.32];for(let i=0;i<8;i++)motor(a,{x:0,z:1},1/60,w.obstacles);assert.equal(a.stuck,true);for(let i=0;i<5;i++)motor(a,{x:0,z:-1},1/60,w.obstacles);assert.equal(a.stuck,false);});

test('actor separation is position-only and player never absorbs more than half',()=>{const w=new World({enemyCount:1,obstacles:[]}),p=w.player,e=w.enemies[0];p.pos=[0,0,0];e.pos=[0,0,.5];e.mass=110;p.vel=[0,0,0];e.vel=[0,0,-1];separateActors([p,e],p,[],1/60,0);const lp=Math.hypot(...p.separationDelta),le=Math.hypot(...e.separationDelta);assert.ok(lp/(lp+le)<=.5001);assert.ok(lp+le<=2.2/60+1e-9);assert.deepEqual(p.vel,[0,0,0]);assert.deepEqual(e.vel,[0,0,-1]);});
test('corner suppression lets AI yield without moving pinned player',()=>{const obstacles=[{min:[-2,0,-2],max:[0,3,2]},{min:[-2,0,-2],max:[2,3,0]}],w=new World({enemyCount:1,obstacles}),p=w.player,e=w.enemies[0];p.pos=[.325,0,.325];e.pos=[.7,0,.7];const initial=[...p.pos];let yielded=0;for(let i=0;i<60;i++){e.pos=[p.pos[0]+.35,0,p.pos[2]+.35];separateActors([p,e],p,obstacles,1/60,i);yielded+=Math.hypot(...e.separationDelta);}assert.deepEqual(p.pos,initial);assert.ok(yielded>.3);});

test('releasing sprint cannot bypass braking while sprint momentum remains',()=>{const a=new World({enemyCount:0,obstacles:[]}).player;a.vel=[0,0,5.6];a.yaw=0;motor(a,{x:0,z:-1,sprint:false},1/60,[]);assert.equal(a.yaw,0);assert.equal(a.sprintBraking,true);assert.ok(a.vel[2]>3.35);});
test('crowd separation shares a per-actor displacement budget across all pairs',()=>{const w=new World({enemyCount:8,obstacles:[]}),p=w.player;p.pos=[0,0,0];for(const e of w.enemies)e.pos=[0,0,.2];separateActors([p,...w.enemies],p,[],1/60,0);for(const a of [p,...w.enemies]){assert.ok(Math.hypot(...a.separationDelta)<=2.2/60+1e-9);assert.ok(a.separationSpent<=2.2/60+1e-9);}});

test('blocked-goal navigation bounds each actor search work per simulation tick',()=>{const obstacles=[{min:[-.5,0,-.5],max:[.5,3,.5]}],w=new World({enemyCount:0,obstacles}),a=w.player;a.pos=[0,0,-3];for(let step=0;step<100;step++){navigationGoal(a,[0,0,0],obstacles,step);assert.ok(a.navigationExpanded<=32);}assert.ok(a.path);});

test('pending navigation recomputes clearance when actor floor height changes',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-8,0,1],max:[8,4,2]}]}),a=w.player;a.pos=[0,0,0];navigationGoal(a,[0,0,3],w.obstacles,0);const first=a.pathSearch;assert.ok(first);a.pos[1]=.7;navigationGoal(a,[0,.7,3],w.obstacles,1);assert.notEqual(a.pathSearch,first);assert.equal(a.pathSearch.start[1],.7);});

test('completed navigation path invalidates immediately when root height changes',()=>{const w=new World({enemyCount:0,obstacles:[{min:[-1,0,1],max:[1,4,2]}]}),a=w.player;a.pos=[0,0,0];for(let step=0;step<100&&!a.path;step++)navigationGoal(a,[0,0,3],w.obstacles,step);assert.ok(a.path);const old=a.path;a.repathAt=10000;a.pos[1]=.7;navigationGoal(a,[0,.7,3],w.obstacles,101);assert.notEqual(a.path,old);assert.equal((a.pathDomain&&a.path?a.pathDomain:a.pathSearch).start[1],.7);});

test('future trajectory includes braking and bounded turning for current intent',()=>{const a={vel:[0,0,3.35],yaw:0,motionIntent:{velocity:[0,0,-3.35],yaw:Math.PI,acceleration:14,turnRate:640*Math.PI/180,rotationLocked:false}};const near=predictTrajectory(a,.2),far=predictTrajectory(a,.67);assert.ok(near.pos[1]<3.35*.2);assert.ok(far.pos[1]<0);assert.ok(near.yaw<=640*Math.PI/180*.2+1e-9);assert.ok(Math.abs(far.yaw-Math.PI)<1e-9);});

test('trajectory matches stationary heading and sprint brake release over repeated actual motor ticks',()=>{
 for(const scenario of [{yaw:Math.PI/2,vel:[0,0,0],input:{}},{yaw:0,vel:[0,0,5.6],input:{z:-1,sprint:true}},{yaw:0,vel:[0,0,5.6],input:{z:-1,sprint:false}}]){
  const a=new World({enemyCount:0,obstacles:[]}).player;a.pos=[0,0,0];a.yaw=scenario.yaw;a.vel=[...scenario.vel];a.grounded=true;
  motor(a,scenario.input,1/60,[]);const start=[...a.pos],expected=predictTrajectory(a,.4);
  for(let i=0;i<24;i++)motor(a,scenario.input,1/60,[]);
  assert.ok(Math.abs(a.pos[0]-start[0]-expected.pos[0])<1e-9);assert.ok(Math.abs(a.pos[2]-start[2]-expected.pos[1])<1e-9);assert.ok(Math.abs(a.yaw-expected.yaw)<1e-9);
 }
});


test('motor consumes measured loop tail and head across animation seam',()=>{
 const a=new World({enemyCount:0,obstacles:[]}).player;a.pos=[0,0,0];a.vel=[0,0,.6];a.yaw=0;a.clip='loop';a.clipTime=.005;a.rootHandoff={weight:1};
 const clip={frames:4,fps:30,duration:.1,loop:true,rootDelta:new Float32Array([0,0,0,0,0,.02,0,0,.02,0,0,.02])};
 a.rootAnimation={clips:new Map([['loop',clip]]),metadata:new Map([['loop',{measuredRoot:true,frames:4,headings:[0,0,0,0]}]])};
 motor(a,{z:.6/3.35},1/60,[]);assert.ok(Math.abs(a.pos[2]-.01)<1e-8);
});

test('airborne locomotion does not let ground root arbitration clamp gravity displacement',()=>{
 const a=new World({enemyCount:0,obstacles:[]}).player;a.pos=[0,10,0];a.grounded=false;a.vel=[0,-30,0];a.clip='idle';a.clipTime=.05;
 a.rootAnimation={clips:new Map([['idle',{frames:4,fps:30,duration:.1,loop:false,rootDelta:new Float32Array(12)}]]),metadata:new Map([['idle',{measuredRoot:true,frames:4}]])};
 motor(a,{},1/60,[]);assert.ok(a.pos[1]<9.5);assert.equal(a.rootMotionClamped,false);
});


test('near-wall camera preserves requested yaw and uses scenery fading rather than side orbit',()=>{
 const w=new World({enemyCount:0,obstacles:[]}),rig=new CameraRig(),walls=[{min:[-20,0,-18],max:[20,4,-17]},{min:[-18,0,-18],max:[-17,4,20]}];
 for(const pos of [[0,0,-16.65],[-16.65,0,-16.65]]){
  w.player.pos=pos;for(let i=0;i<30;i++)rig.update(w.player,{yaw:0,pitch:-.08},walls);
  assert.ok(rig.current.recovering);assert.equal(rig.recoveryYaw,0);assert.equal(Math.atan2(rig.current.direction[0],rig.current.direction[2]),0);
  assert.ok(rig.current.position[2]<w.player.pos[2]-1.5);assert.equal(rig.interpolate(.5).fadeObstacles,true);
 }
 w.player.pos=[0,0,0];for(let i=0;i<120;i++)rig.update(w.player,{yaw:0,pitch:-.08},walls);
 assert.equal(rig.current.recovering,false);assert.ok(rig.arm.len>2.6);
});
test('look-driven player and rear camera turn together without movement or aim',()=>{
 const w=new World({enemyCount:0,obstacles:[]}),rig=new CameraRig();w.player.pos=[0,0,0];
 for(let step=0;step<240;step++){const requested=step<120?step*.02:(240-step)*.02;w.update({lookDriven:true,yaw:requested});rig.update(w.player,{yaw:w.player.yaw});
  const back=rig.current.position.map((v,i)=>v-rig.current.pivot[i]);assert.ok(back[0]*Math.sin(w.player.yaw)+back[2]*Math.cos(w.player.yaw)<-1.5);
 }
 assert.ok(Math.hypot(w.player.pos[0],w.player.pos[2])<1e-9);
});

test('rear-facing look input cannot bypass reverse sprint braking',()=>{
 const a=new World({enemyCount:0,obstacles:[]}).player;a.vel=[0,0,5.6];a.yaw=0;motor(a,{z:-1,yaw:0,lookDriven:true,sprint:true},1/60,[]);assert.equal(a.sprintBraking,true);assert.ok(a.vel[2]>3.35);assert.equal(a.yaw,0);
});

test('flat practice turns preserve the walking cycle through diagonal reversals',()=>{
  const world=new World({enemyCount:0,obstacles:[],flatGroundPractice:true});
  const p=world.player;
  world.animationClips=new Map([['Idle_Loop',{duration:2.5}],['Walk_Loop',{duration:4/3}]]);
  p.matcher={};
  p.prepareLocomotion=dt=>world.selectLocomotion(p,dt);
  let last=0;
  for(const [x,z] of [[1,1],[-1,1],[1,-1],[-1,-1],[1,1]]){
    for(let i=0;i<40;i++){
      world.update({x,z,walk:true,freeMove:true},1/60);
      assert.equal(p.clip,'Walk_Loop');
      const advance=(p.clipTime-last+4/3)%(4/3);
      assert.ok(advance>0 && advance<=1.12/60+1e-8);
      last=p.clipTime;
    }
  }
  for(let i=0;i<45;i++)world.update({walk:true},1/60);
  assert.equal(p.clip,'Idle_Loop');
});

test('rear movement stays actor-relative across camera angles and postures',()=>{
  for(const posture of ['stand','crouch','prone']) for(const side of [-1,0,1]) for(const mode of [{walk:true},{sprint:true},{aim:true}]){
    const a=new World({enemyCount:0,obstacles:[]}).player;
    a.posture=posture;
    const facing=a.yaw=1.2, start=[...a.pos];
    for(let step=0;step<60;step++){
      const yaw=step*.07, move=movementInput(-1,side,yaw,a.yaw);
      motor(a,{...move,...mode,yaw,lookDriven:!!mode.aim},1/60,[]);
      assert.equal(a.yaw,facing);
    }
    const dx=a.pos[0]-start[0],dz=a.pos[2]-start[2];
    assert.ok(dx*Math.sin(facing)+dz*Math.cos(facing)<-.1);
    const lateral=-dx*Math.cos(facing)+dz*Math.sin(facing);
    assert.ok(side ? side*lateral>.1 : Math.abs(lateral)<1e-6);
  }
});
