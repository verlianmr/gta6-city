// All of Sunset Palms' sound, synthesised at runtime on one WebAudio context: engine hum,
// siren, gunshots, crashes and footsteps, plus the M-key mute. createAudio() is the only
// export and stays silent until the first user gesture unlocks the context.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;

  // The engine's moving parts.
  let engine = null;
  let siren = null;

  function makeNoise() {
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x1f2e3d4c;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  function buildEngine() {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 3.2;
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 46;
    const high = ctx.createOscillator();
    high.type = 'square';
    high.frequency.value = 92;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.18;
    low.connect(filter);
    high.connect(highGain);
    highGain.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    low.start();
    high.start();
    engine = { gain, filter, low, high, level: 0 };
  }

  function buildSiren() {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 2.4;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 720;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    siren = { gain, osc, level: 0 };
  }

  function unlock() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      noise = makeNoise();
      buildEngine();
      buildSiren();
    } catch {
      ctx = null;
    }
  }

  /** A shaped noise burst: the body of gunshots, crashes and footsteps. */
  function burst(duration, volume, type, frequency, q = 1) {
    if (ctx === null || noise === null) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function tone(frequency, duration, volume, type = 'sine', slide = 0) {
    if (ctx === null) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
      return muted;
    },

    /** The engine hum: `speed` in world px/s, `throttle` -1..1, `on` false when on foot. */
    engine(speed, throttle, on) {
      if (engine === null) return;
      const now = ctx.currentTime;
      const level = on ? 0.05 + Math.min(0.09, Math.abs(speed) * 0.00016) + Math.max(0, throttle) * 0.03 : 0;
      engine.level += (level - engine.level) * 0.18;
      engine.gain.gain.setTargetAtTime(engine.level, now, 0.06);
      const pitch = 40 + Math.min(150, Math.abs(speed) * 0.22) + Math.max(0, throttle) * 12;
      engine.low.frequency.setTargetAtTime(pitch, now, 0.08);
      engine.high.frequency.setTargetAtTime(pitch * 2.01, now, 0.08);
      engine.filter.frequency.setTargetAtTime(480 + Math.min(1100, Math.abs(speed) * 1.6), now, 0.1);
    },

    /** The two-tone siren: `intensity` 0..1 from how close the nearest cruiser is. */
    siren(on, intensity) {
      if (siren === null) return;
      const now = ctx.currentTime;
      const target = on ? 0.022 + 0.05 * Math.max(0, Math.min(1, intensity)) : 0;
      siren.level += (target - siren.level) * 0.2;
      siren.gain.gain.setTargetAtTime(siren.level, now, 0.08);
      const phase = (performance.now() / 1000) % 0.9;
      siren.osc.frequency.setTargetAtTime(phase < 0.45 ? 760 : 990, now, 0.015);
    },

    gunshot() {
      burst(0.16, 0.5, 'lowpass', 1900);
      burst(0.05, 0.35, 'highpass', 3200);
      tone(160, 0.09, 0.18, 'square', -90);
    },
    crash(intensity = 1) {
      const v = Math.max(0.08, Math.min(0.55, 0.2 + intensity * 0.3));
      burst(0.3, v, 'lowpass', 900);
      tone(74, 0.2, v * 0.5, 'triangle', -30);
    },
    footstep() {
      burst(0.06, 0.06, 'highpass', 1700);
    },
    blip(pitch = 620) {
      tone(pitch, 0.11, 0.10, 'sine', 120);
    },
    hurt() {
      tone(220, 0.18, 0.12, 'triangle', -120);
    },
    mission() {
      tone(660, 0.12, 0.1, 'sine');
      setTimeout(() => tone(880, 0.16, 0.09, 'sine'), 110);
    },
  };
}
