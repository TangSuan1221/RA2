import { TM } from './constants.mjs';

/** Exact 60 Hz; elapsed is supplied by the host and never read by gameplay. */
export class FixedLoop {
  constructor(update) { this.update=update; this.accumulator=0; this.tick=0; this.overrun=0; this.paused=false; }
  advance(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid frame delta');
    if (this.paused) return 0;
    const dt=1/TM.TICK_HZ;
    this.accumulator += Math.min(elapsed, 0.25);
    let steps=0;
    while (this.accumulator + 1e-12 >= dt && steps<TM.MAX_CATCHUP) {
      this.update(dt,this.tick++); this.accumulator-=dt; steps++;
    }
    if (this.accumulator + 1e-12 >= dt) { this.overrun++; this.accumulator %= dt; }
    this.accumulator=Math.max(0,this.accumulator);
    return this.accumulator/dt;
  }
}
