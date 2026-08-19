type MicHitCallback = (energy: number) => void;

export interface MicDetectorState {
  isActive: boolean;
  isPermissionGranted: boolean;
  sensitivity: number; // 0.1 to 1.0 (threshold)
  currentVolume: number;
}

class MicEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animId: number | null = null;
  private onHitCallback: MicHitCallback | null = null;
  private onStateChangeCallback: ((state: MicDetectorState) => void) | null = null;
  private lastHitTime = 0;

  private state: MicDetectorState = {
    isActive: false,
    isPermissionGranted: false,
    sensitivity: 0.35,
    currentVolume: 0,
  };

  public async start(onHit: MicHitCallback, onStateChange?: (state: MicDetectorState) => void): Promise<boolean> {
    this.onHitCallback = onHit;
    this.onStateChangeCallback = onStateChange || null;

    if (this.state.isActive) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.1;
      source.connect(this.analyser);

      this.updateState({
        isActive: true,
        isPermissionGranted: true,
      });

      this.monitorLoop();
      return true;
    } catch (err) {
      console.warn('Microphone access denied or unavailable:', err);
      this.updateState({ isActive: false, isPermissionGranted: false });
      return false;
    }
  }

  public stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.updateState({ isActive: false, currentVolume: 0 });
  }

  public setSensitivity(val: number) {
    this.updateState({ sensitivity: Math.max(0.05, Math.min(0.95, val)) });
  }

  private monitorLoop() {
    if (!this.analyser || !this.state.isActive) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length / 255; // 0 to 1

    const now = performance.now();
    const threshold = this.state.sensitivity;

    // Detect transient sharp hit with minimum debounce (85ms)
    if (avg > threshold && now - this.lastHitTime > 85) {
      this.lastHitTime = now;
      if (this.onHitCallback) {
        this.onHitCallback(avg);
      }
    }

    this.updateState({ currentVolume: Math.round(avg * 100) });
    this.animId = requestAnimationFrame(this.monitorLoop.bind(this));
  }

  private updateState(partial: Partial<MicDetectorState>) {
    this.state = { ...this.state, ...partial };
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.state);
    }
  }

  public getState(): MicDetectorState {
    return this.state;
  }
}

export const micEngine = new MicEngine();
