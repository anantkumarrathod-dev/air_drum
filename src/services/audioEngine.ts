// Web Audio API Synthesizer with Sound Kits, Haptics & Audio Take Recorder
import { DrumInstrumentId, SoundKitId } from '../types/drum';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private recordDestNode: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;
  private soundKit: SoundKitId = 'studio_birch';
  private hapticsEnabled: boolean = true;

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Recording stream destination
      if (this.ctx.createMediaStreamDestination) {
        this.recordDestNode = this.ctx.createMediaStreamDestination();
        this.masterGain.connect(this.recordDestNode);
      }

      this.generateNoiseBuffer();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setSoundKit(kit: SoundKitId) {
    this.soundKit = kit;
  }

  public setHaptics(enabled: boolean) {
    this.hapticsEnabled = enabled;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  // --- AUDIO TAKE RECORDER ---
  public startRecording(): boolean {
    this.init();
    if (!this.recordDestNode || !window.MediaRecorder) return false;

    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.recordDestNode.stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      return true;
    } catch {
      return false;
    }
  }

  public stopRecordingAndDownload(filename: string = 'drum_practice_take.webm') {
    if (!this.mediaRecorder || !this.isRecording) return;

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    };

    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  public getIsRecording() {
    return this.isRecording;
  }

  // Trigger Tactile Haptic Vibration for Deaf Drummers
  private triggerHaptic(durationMs: number = 25) {
    if (this.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(durationMs);
      } catch {}
    }
  }

  public playInstrument(instrument: DrumInstrumentId, velocity: number = 1.0) {
    // Trigger tactile haptic pulses
    if (instrument === 'bass' || instrument === 'floor_tom') {
      this.triggerHaptic(40);
    } else {
      this.triggerHaptic(20);
    }

    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const vel = Math.max(0.1, Math.min(1.0, velocity));

    switch (instrument) {
      case 'bass':
        this.playBassDrum(time, vel);
        break;
      case 'floor_tom':
        this.playFloorTom(time, vel);
        break;
      case 'snare':
        this.playSnare(time, vel);
        break;
      case 'hihat_closed':
        this.playHiHatClosed(time, vel);
        break;
      case 'hihat_open':
        this.playHiHatOpen(time, vel);
        break;
      case 'high_tom':
        this.playTom(time, 175, 110, 0.28, vel);
        break;
      case 'mid_tom':
        this.playTom(time, 135, 85, 0.32, vel);
        break;
      case 'crash':
        this.playCrash(time, vel);
        break;
      case 'ride':
        this.playRide(time, vel);
        break;
    }
  }

  private playBassDrum(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (this.soundKit === 'synth_808') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.2);
      gain.gain.setValueAtTime(1.2 * velocity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.65);
    } else if (this.soundKit === 'practice_pad') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.06);
      gain.gain.setValueAtTime(0.6 * velocity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    } else if (this.soundKit === 'heavy_metal') {
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
      gain.gain.setValueAtTime(1.3 * velocity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    } else if (this.soundKit === 'vintage_maple') {
      osc.frequency.setValueAtTime(115, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.16);
      gain.gain.setValueAtTime(1.0 * velocity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
    } else {
      // studio_birch
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      gain.gain.setValueAtTime(1.1 * velocity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.68);
  }

  private playFloorTom(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = this.soundKit === 'vintage_maple' ? 88 : this.soundKit === 'heavy_metal' ? 110 : 98;
    const endFreq = this.soundKit === 'vintage_maple' ? 55 : 62;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.25);

    gain.gain.setValueAtTime(0.95 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.48);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  private playTom(time: number, startFreq: number, endFreq: number, decay: number, velocity: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + decay * 0.7);

    gain.gain.setValueAtTime(0.85 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  private playSnare(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain) return;

    // Body tone
    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.soundKit === 'heavy_metal' ? 220 : 185, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.08);

    toneGain.gain.setValueAtTime(0.7 * velocity, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(toneGain);
    toneGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.16);

    // Snare wires rattle (noise)
    if (this.noiseBuffer && this.soundKit !== 'practice_pad') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(this.soundKit === 'synth_808' ? 800 : 1200, time);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.85 * velocity, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(time);
      noise.stop(time + 0.23);
    }
  }

  private playHiHatClosed(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(8000, time);
    bandpass.Q.setValueAtTime(3.5, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  private playHiHatOpen(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(7500, time);
    bandpass.Q.setValueAtTime(2.5, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.75 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.38);
  }

  private playCrash(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(4500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.1);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 1.15);
  }

  private playRide(time: number, velocity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, time);
    toneGain.gain.setValueAtTime(0.4 * velocity, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
    osc.connect(toneGain);
    toneGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.5);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(9500, time);
    bandpass.Q.setValueAtTime(5, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5 * velocity, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.65);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.7);
  }

  public playMetronomeTick(isDownbeat: boolean) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.04);
  }
}

export const audioEngine = new AudioEngine();
