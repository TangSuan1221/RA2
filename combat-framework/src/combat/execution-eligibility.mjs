// Authoritative execution eligibility; animation alignment is a separate gate.
import {CB,CC} from '../core/constants.mjs';
import {attackInfo} from './resolve.mjs';
const horizontal=(a,b)=>Math.hypot(a.pos[0]-b.pos[0],a.pos[2]-b.pos[2]);
export function executionEligibility(player,target,{step,actors=[],visible=()=>true}={}){
 if(!Number.isInteger(step))throw Error('Execution requires an authoritative simulation step');
 if(!target||target.hp<=0)return {ok:false,reason:'dead'};
 if(horizontal(player,target)>CB.EXEC_RANGE)return {ok:false,reason:'tooFar'};
 const angle=Math.atan2(target.pos[0]-player.pos[0],target.pos[2]-player.pos[2])-player.yaw;
 if(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))>CB.EXEC_ANGLE*Math.PI/360)return {ok:false,reason:'wrongAngle'};
 if(Math.abs(player.pos[1]-target.pos[1])>CC.STEP_UP)return {ok:false,reason:'heightGap'};
 const staggered=target.state==='stagger'&&step<target.staggerUntil;
 if(target.hp>CB.EXEC_HP_PCT*target.maxHp&&!staggered)return {ok:false,reason:'tooHealthy'};
 if(!staggered&&step<(target.hitstunUntil??0))return {ok:false,reason:'hitstun'};
 if(step<(target.stunUntil??0))return {ok:false,reason:'stunned'};
 const phase=player.attack?attackInfo(player.attack,step):null,cancellable=phase?.phase==='recovery'&&phase.pct>=CB.CANCEL_POINT;
 if(player.hp<=0||step<(player.hitstunUntil??0)||step<(player.stunUntil??0)||step<player.hitstopUntil||step<player.staggerUntil||step<player.iframeUntil||player.attack&&!cancellable||!player.attack&&step<player.busyUntil)return {ok:false,reason:'busy'};
 const locked=a=>a.execLock&&step<a.execLock.untilStep;
 const occupied=actors.some(a=>a!==player&&a!==target&&a.hp>0&&a.pos[1]<target.pos[1]+(target.height??CC.STAND_H)&&a.pos[1]+(a.height??CC.STAND_H)>target.pos[1]&&horizontal(a,target)<CB.EXEC_3P_CLEAR+(a.radius??CC.CAP_RADIUS));
 if(locked(player)||locked(target)||occupied)return {ok:false,reason:'occupied'};
 if(target.executionImmune||target.aiRole?.executionImmune)return {ok:false,reason:'immune'};
 if(!player.grounded||!target.grounded||player.traversal||target.traversal)return {ok:false,reason:'airborne'};
 if(!visible(player,target))return {ok:false,reason:'occluded'};
 return {ok:true,reason:null};
}
