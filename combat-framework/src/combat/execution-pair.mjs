// Authoritative paired locks and interruption rollback. Animation anchors remain a separate gate.
import {DT,CB} from '../core/constants.mjs';
import {executionEligibility} from './execution-eligibility.mjs';
const snapshot=a=>({pos:[...a.pos],yaw:a.yaw,hp:a.hp,poise:a.poise,staggerUntil:a.staggerUntil});
export function beginExecutionPair(player,target,context,durationSeconds){
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw Error('Execution duration must be finite and positive');
 const eligibility=executionEligibility(player,target,context);if(!eligibility.ok)return eligibility;
 const start=context.step,end=start+Math.ceil(Math.max(durationSeconds,CB.EXEC_STAGGER_WINDOW_MS/1000)/DT),id=`${player.id}:execution:${start}`,pair={id,attackerId:player.id,targetId:target.id,start,end,snapshots:{attacker:snapshot(player),target:snapshot(target)}};
 for(const [a,b]of [[player,target],[target,player]]){a.state='locked';a.execLock={partnerId:b.id,untilStep:end,sourceActionId:id};a.busyUntil=end;a.attack=null;a.vel=[0,0,0];a.knockback=[0,0,0];a.upperClip=null;}
 return {ok:true,pair};
}
export function finishExecutionPair(pair,player,target,step,reason=null){
 const owned=[player,target].filter(a=>a.execLock?.sourceActionId===pair.id);
 if(owned.length!==2)reason='lock_lost';
 // Never clear or mutate a participant owned by a newer pair.
 for(const a of owned)a.execLock=null;
 if(reason==='lock_lost'){for(const a of owned){a.state=a.hp>0?'idle':'dead';a.busyUntil=step;}return {type:'execution_cancel',reason};}
 if(!reason){target.hp=0;target.state='dead';player.state='idle';player.busyUntil=step;target.busyUntil=step;return {type:'execution_end',reason:null};}
 if(reason==='stun'){target.hp=pair.snapshots.target.hp;target.staggerUntil=pair.snapshots.target.staggerUntil;target.state=step<target.staggerUntil?'stagger':'idle';target.busyUntil=Math.max(step,target.staggerUntil);player.busyUntil=Math.max(step+(Math.ceil(CB.EXEC_ABORT_RECOVERY_MS/1000/DT)),player.stunUntil??step);player.state='stagger';player.staggerUntil=Math.max(player.staggerUntil,player.busyUntil);return {type:'execution_cancel',reason};}
 const recovery=reason==='target_dead'?Math.ceil(CB.HEAVY.recovery/1000/DT):Math.ceil(CB.EXEC_ABORT_RECOVERY_MS/1000/DT);
 for(const a of [player,target]){a.busyUntil=step+recovery;if(a.hp>0){a.state='stagger';a.staggerUntil=Math.max(a.staggerUntil,step+recovery);}else a.state='dead';}
 return {type:'execution_cancel',reason};
}
export function updateExecutionPair(pair,player,target,step,{anchorError=0}={}){
 let reason=null;
 if(player.execLock?.sourceActionId!==pair.id||target.execLock?.sourceActionId!==pair.id)reason='lock_lost';
 else if(player.hp<=0)reason='attacker_dead';else if(target.hp<=0)reason='target_dead';
 else if(step<(player.stunUntil??0))reason='stun';
 else if(Math.hypot(player.pos[0]-target.pos[0],player.pos[2]-target.pos[2])>CB.EXEC_BREAK_DIST||anchorError>CB.EXEC_ANCHOR_TOL)reason='distance';
 if(reason||step>=pair.end)return finishExecutionPair(pair,player,target,step,reason);
 return null;
}
