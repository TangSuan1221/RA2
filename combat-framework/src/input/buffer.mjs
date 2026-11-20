import { CB, TM, IN } from '../core/constants.mjs';

export class InputBuffer {
  constructor() {
    this.maxAge=Math.ceil(CB.INPUT_BUFFER_MS*TM.TICK_HZ/1000);
    this.samples=Array.from({length:this.maxAge+1},()=>({kind:'',step:-Infinity,consumed:true}));
    this.cursor=0;
  }
  push(kind,step) { const s=this.samples[this.cursor]; s.kind=kind; s.step=step; s.consumed=false; this.cursor=(this.cursor+1)%this.samples.length; }
  peek(kind,step,maxAge=this.maxAge) {
    let oldest=null;
    for(const s of this.samples) if(!s.consumed && s.kind===kind && step>=s.step && step-s.step<=maxAge && (!oldest || s.step<oldest.step)) oldest=s;
    return oldest;
  }
  consume(kind,step,maxAge) { const s=this.peek(kind,step,maxAge); if(s) s.consumed=true; return s; }
  clear() { for(const s of this.samples) s.consumed=true; }
}
export function radialDeadzone(x,y) {
  const length=Math.hypot(x,y);
  if(length<=IN.DEADZONE) return [0,0];
  const magnitude=Math.min(1,(length-IN.DEADZONE)/(1-IN.DEADZONE));
  return [x/length*magnitude,y/length*magnitude];
}
