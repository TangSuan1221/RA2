// A filtered wind bed crossfades into rain and surf as the listener moves.
export function ambience() {
  let context, master, wind, rain, surf, muted = false;
  function start() {
    if (context) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : .16;
    master.connect(context.destination);
    const noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    function bed(frequency, type) {
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = context.createBiquadFilter(), gain = context.createGain();
      filter.type = type;
      filter.frequency.value = frequency;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(master);
      source.start(0, Math.random() * 3);
      return gain.gain;
    }
    wind = bed(330, 'lowpass');
    rain = bed(3000, 'bandpass');
    surf = bed(750, 'lowpass');
  }
  return {
    start,
    horn(){
      start();
      const t=context.currentTime;
      for(const hz of [349,440]){
        const tone=context.createOscillator(),level=context.createGain();
        tone.type='sawtooth';tone.frequency.value=hz;
        level.gain.setValueAtTime(.001,t);level.gain.exponentialRampToValueAtTime(.19,t+.025);
        level.gain.exponentialRampToValueAtTime(.001,t+.39);
        tone.connect(level).connect(master);tone.start(t);tone.stop(t+.4);
        tone.onended=()=>{level.disconnect();tone.disconnect()};
      }
    },
    mute(value) { muted = value; if (master) master.gain.setTargetAtTime(value ? 0 : .16, context.currentTime, .12); },
    update(x, z, wet) {
      if (!context) return;
      const t = context.currentTime;
      const shore = Math.max(0, 1 - Math.min(Math.abs(z - 480), Math.abs(x - 150)) / 100);
      wind.setTargetAtTime(.14 + .065 * Math.sin(t * .33), t, .6);
      rain.setTargetAtTime(wet ? .24 : 0, t, .35);
      surf.setTargetAtTime(shore * (.18 + .13 * Math.sin(t * .69)), t, .45);
    }
  };
}
