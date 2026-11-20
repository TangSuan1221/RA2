import test from 'node:test';
import assert from 'node:assert/strict';
import {phaseRate,wrapPhase} from '../src/anim/phase-sync.mjs';
test('phase control respects rate limits for full requested phase and speed ranges',()=>{
 for(let p=-.5;p<=.5;p+=.01)for(let raw=.5;raw<=2;raw+=.05){const result=phaseRate({speed:raw,sourceSpeed:1,sourcePhase:0,targetPhase:p,cyclePeriod:.806});assert.ok(result.rate>=.88&&result.rate<=1.12);}
});
test('phase correction chooses shorter circular direction and skips unreliable or speed-clamped sources',()=>{
 const args={speed:1,sourceSpeed:1,sourcePhase:.95,targetPhase:.1,cyclePeriod:.806};assert.ok(phaseRate(args).rate>1);assert.ok(phaseRate({...args,sourcePhase:.1,targetPhase:.95}).rate<1);
 for(const override of [{reliable:false},{research:true},{targetPhase:1},{speed:2}])assert.equal(phaseRate({...args,...override}).correction,0);
 assert.ok(Math.abs(wrapPhase(1.15)-.15)<1e-12);
});
test('bounded phase correction reduces error without claiming impossible .4s convergence',()=>{
 let current=0,target=.12;for(let step=0;step<24;step++){const r=phaseRate({speed:1,sourceSpeed:1,sourcePhase:current,targetPhase:target,cyclePeriod:.806});current+=r.rate/60/.806;target+=1/60/.806;}
 const residual=Math.abs(wrapPhase(target-current));assert.ok(residual<.12);assert.ok(residual>.02);
 // Even continuous maximum rate cannot remove more than .12*.4/.806 cycles.
 assert.ok(.12-.12*.4/.806>.02);
});
