let audioCtx: AudioContext | null = null;
let muted = false;

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export function initAudio() {
  try {
    ctx();
  } catch {
    // unavailable
  }
}

function ramp(gain: GainNode, from: number, to: number, start: number, end: number) {
  gain.gain.setValueAtTime(from, start);
  gain.gain.linearRampToValueAtTime(to, end);
}

function playTone(
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainPeak: number,
  attackFrac = 0.05,
  decayFrac = 0.2
) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + duration * attackFrac);
  gain.gain.setValueAtTime(gainPeak, startTime + duration * (1 - decayFrac));
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playFreqSweep(
  freqStart: number,
  freqEnd: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainPeak: number
) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);

  gain.gain.setValueAtTime(gainPeak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playNoise(startTime: number, duration: number, gainPeak: number, lowpass = 2000) {
  const ac = ctx();
  const bufferSize = Math.ceil(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(lowpass, startTime);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(gainPeak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

export function playCardSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Crisp card slap: noise burst + frequency sweep
    playNoise(now, 0.08, 0.3, 1800);
    playFreqSweep(320, 160, 'triangle', now, 0.12, 0.18);
  } catch { /* unavailable */ }
}

export function playTakeSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Soft pickup whoosh
    playFreqSweep(200, 90, 'sine', now, 0.18, 0.12);
    playNoise(now, 0.15, 0.12, 800);
  } catch { /* unavailable */ }
}

export function playComboSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Three ascending notes — G4, B4, D5
    const notes = [392, 494, 587];
    notes.forEach((freq, i) => {
      playTone(freq, 'square', now + i * 0.1, 0.15, 0.12, 0.08, 0.3);
    });
    // Sparkle on top
    playTone(1174, 'sine', now + 0.28, 0.2, 0.06, 0.05, 0.5);
  } catch { /* unavailable */ }
}

export function playWinSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Triumphant: C5 E5 G5 C6 — major chord ascent
    const melody = [
      { freq: 523, t: 0 },
      { freq: 659, t: 0.12 },
      { freq: 784, t: 0.24 },
      { freq: 1047, t: 0.38 },
      { freq: 1047, t: 0.56 },
    ];
    melody.forEach(({ freq, t }) => {
      playTone(freq, 'triangle', now + t, 0.2, 0.15, 0.06, 0.4);
    });
    // Bass note
    playTone(131, 'sine', now + 0.38, 0.5, 0.2, 0.1, 0.5);
  } catch { /* unavailable */ }
}

export function playLoseSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Sad descending: C5 A4 F4 C4
    const melody = [
      { freq: 523, t: 0 },
      { freq: 440, t: 0.18 },
      { freq: 349, t: 0.36 },
      { freq: 261, t: 0.56 },
    ];
    melody.forEach(({ freq, t }) => {
      playTone(freq, 'sawtooth', now + t, 0.25, 0.1, 0.1, 0.5);
    });
  } catch { /* unavailable */ }
}

export function playYourTurnSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    // Gentle ping: soft sine bell
    playTone(880, 'sine', now, 0.3, 0.08, 0.03, 0.7);
    playTone(1108, 'sine', now + 0.06, 0.25, 0.04, 0.03, 0.8);
  } catch { /* unavailable */ }
}

export function playClickSound() {
  if (muted) return;
  try {
    const ac = ctx();
    const now = ac.currentTime;
    playTone(1200, 'square', now, 0.04, 0.06, 0.02, 0.8);
  } catch { /* unavailable */ }
}
