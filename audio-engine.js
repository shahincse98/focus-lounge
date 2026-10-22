/**
 * Focus Lounge Web Audio Engine
 * Zero external audio files required! Synthesizes organic sounds
 * using native Web Audio API oscillators, noise generators & filters.
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.sounds = {};
    this.masterGain = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Generate buffer with White Noise
  createWhiteNoiseBuffer(seconds = 5) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Generate buffer with Pink Noise (deeper, more natural)
  createPinkNoiseBuffer(seconds = 5) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  // Generate Brown Noise (very low frequency focus hum)
  createBrownNoiseBuffer(seconds = 5) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Gain compensation
    }
    return buffer;
  }

  /**
   * Start or create a specific sound generator
   */
  startSound(name, targetVolume = 0.5) {
    this.ensureContext();
    if (!this.ctx) return;

    if (this.sounds[name]) {
      this.setSoundVolume(name, targetVolume);
      return;
    }

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
    gainNode.connect(this.masterGain);

    let soundObj = { gain: gainNode, nodes: [] };

    switch (name) {
      case 'rain': {
        // Rain: Pink noise + multi-band filtering
        const source = this.ctx.createBufferSource();
        source.buffer = this.createPinkNoiseBuffer(6);
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(250, this.ctx.currentTime);

        source.connect(highpass);
        highpass.connect(filter);
        filter.connect(gainNode);

        source.start();
        soundObj.nodes = [source, highpass, filter];
        break;
      }

      case 'fire': {
        // Fireplace: Low pink noise rumble + crackle pops
        const source = this.ctx.createBufferSource();
        source.buffer = this.createBrownNoiseBuffer(5);
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, this.ctx.currentTime);

        source.connect(filter);
        filter.connect(gainNode);
        source.start();

        // Interval crackles generator
        const crackleInterval = setInterval(() => {
          if (!this.sounds['fire']) {
            clearInterval(crackleInterval);
            return;
          }
          if (Math.random() > 0.45 && this.ctx && this.ctx.state === 'running') {
            const crackleGain = this.ctx.createGain();
            const now = this.ctx.currentTime;
            crackleGain.gain.setValueAtTime(0.01 + Math.random() * 0.15, now);
            crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.08);

            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(800 + Math.random() * 2200, now);
            osc.connect(crackleGain);
            crackleGain.connect(gainNode);

            osc.start(now);
            osc.stop(now + 0.12);
          }
        }, 120);

        soundObj.nodes = [source, filter];
        soundObj.interval = crackleInterval;
        break;
      }

      case 'wind': {
        // Wind: Modulated bandpass filter on pink noise
        const source = this.ctx.createBufferSource();
        source.buffer = this.createPinkNoiseBuffer(6);
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, this.ctx.currentTime);
        filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

        // LFO for swaying wind
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime); // Slow sweep

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(200, this.ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        source.connect(filter);
        filter.connect(gainNode);

        lfo.start();
        source.start();
        soundObj.nodes = [source, filter, lfo, lfoGain];
        break;
      }

      case 'waves': {
        // Ocean Waves: Deep swell with periodic amplitude surge
        const source = this.ctx.createBufferSource();
        source.buffer = this.createPinkNoiseBuffer(8);
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, this.ctx.currentTime);

        // Slow wave modulator
        const waveLfo = this.ctx.createOscillator();
        waveLfo.type = 'sine';
        waveLfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // ~8 sec ocean swell

        const waveLfoGain = this.ctx.createGain();
        waveLfoGain.gain.setValueAtTime(350, this.ctx.currentTime);

        waveLfo.connect(waveLfoGain);
        waveLfoGain.connect(filter.frequency);

        source.connect(filter);
        filter.connect(gainNode);

        waveLfo.start();
        source.start();
        soundObj.nodes = [source, filter, waveLfo, waveLfoGain];
        break;
      }

      case 'brown': {
        // Deep Brown Noise
        const source = this.ctx.createBufferSource();
        source.buffer = this.createBrownNoiseBuffer(6);
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, this.ctx.currentTime);

        source.connect(filter);
        filter.connect(gainNode);
        source.start();
        soundObj.nodes = [source, filter];
        break;
      }

      case 'zen': {
        // Zen Drone: 432 Hz pure harmonic chord
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(108, this.ctx.currentTime); // 432 / 4 Sub-base

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(216, this.ctx.currentTime); // Octave

        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(432, this.ctx.currentTime); // 432Hz Healing tone

        const zenSubGain = this.ctx.createGain();
        zenSubGain.gain.setValueAtTime(0.3, this.ctx.currentTime);

        osc1.connect(zenSubGain);
        osc2.connect(zenSubGain);
        osc3.connect(zenSubGain);
        zenSubGain.connect(gainNode);

        osc1.start();
        osc2.start();
        osc3.start();

        soundObj.nodes = [osc1, osc2, osc3, zenSubGain];
        break;
      }
    }

    this.sounds[name] = soundObj;
  }

  setSoundVolume(name, volume) {
    if (this.sounds[name] && this.sounds[name].gain) {
      const now = this.ctx ? this.ctx.currentTime : 0;
      this.sounds[name].gain.gain.setTargetAtTime(volume, now, 0.05);
    }
  }

  stopSound(name) {
    if (!this.sounds[name]) return;
    const soundObj = this.sounds[name];
    if (soundObj.interval) {
      clearInterval(soundObj.interval);
    }
    if (soundObj.nodes) {
      soundObj.nodes.forEach(node => {
        try {
          if (node.stop) node.stop();
          if (node.disconnect) node.disconnect();
        } catch (e) {}
      });
    }
    delete this.sounds[name];
  }

  toggleMasterMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1.0, now, 0.08);
    }
    return this.isMuted;
  }

  // Pleasant Buddhist singing bowl / Tibetan bell chime for session completion
  playCompletionChime() {
    this.ensureContext();
    if (!this.ctx) return;

    const fundamental = 528; // Solfeggio 528 Hz frequency
    const harmonics = [1, 2.02, 3.01, 4.15];
    const gains = [0.4, 0.2, 0.1, 0.05];

    harmonics.forEach((h, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * h, now);

      gain.gain.setValueAtTime(gains[index], now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 3.6);
    });
  }
}

// Global audio engine singleton
window.audioEngine = new AudioEngine();
