import { DrumInstrumentId } from '../types/drum';

export interface MidiDeviceState {
  isSupported: boolean;
  isConnected: boolean;
  deviceName: string | null;
  lastNote: number | null;
  lastVelocity: number | null;
}

type MidiHitCallback = (instrument: DrumInstrumentId, velocity: number) => void;

interface MidiInputLike {
  state: string;
  name?: string;
  onmidimessage: ((event: { data: Uint8Array | number[] }) => void) | null;
}

interface MidiAccessLike {
  inputs: {
    values: () => IterableIterator<MidiInputLike>;
  };
  onstatechange: (() => void) | null;
}

class MidiEngine {
  private midiAccess: MidiAccessLike | null = null;
  private onHitCallback: MidiHitCallback | null = null;
  private stateChangeCallback: ((state: MidiDeviceState) => void) | null = null;
  private isRequesting = false;
  private hasInitialized = false;

  private currentState: MidiDeviceState = {
    isSupported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    isConnected: false,
    deviceName: null,
    lastNote: null,
    lastVelocity: null,
  };

  // Standard General MIDI (GM) Drum Map
  private noteToInstrumentMap: Record<number, DrumInstrumentId> = {
    35: 'bass',        // Acoustic Bass Drum
    36: 'bass',        // Bass Drum 1
    38: 'snare',       // Acoustic Snare
    40: 'snare',       // Electric Snare
    37: 'snare',       // Side Stick
    42: 'hihat_closed',// Closed Hi-Hat
    44: 'hihat_closed',// Pedal Hi-Hat
    46: 'hihat_open',  // Open Hi-Hat
    41: 'floor_tom',   // Low Floor Tom
    43: 'floor_tom',   // High Floor Tom
    45: 'mid_tom',     // Low Tom
    47: 'mid_tom',     // Low-Mid Tom
    48: 'high_tom',    // Hi-Mid Tom
    50: 'high_tom',    // High Tom
    49: 'crash',       // Crash Cymbal 1
    57: 'crash',       // Crash Cymbal 2
    51: 'ride',        // Ride Cymbal 1
    53: 'ride',        // Ride Bell
    59: 'ride',        // Ride Cymbal 2
  };

  public setOnHit(cb: MidiHitCallback) {
    this.onHitCallback = cb;
  }

  public setOnStateChange(cb: (state: MidiDeviceState) => void) {
    this.stateChangeCallback = cb;
    cb(this.currentState);
  }

  public async init(onHit?: MidiHitCallback, onStateChange?: (state: MidiDeviceState) => void): Promise<boolean> {
    if (onHit) this.onHitCallback = onHit;
    if (onStateChange) this.stateChangeCallback = onStateChange;

    if (this.hasInitialized || this.isRequesting) {
      return this.currentState.isConnected;
    }

    if (!this.currentState.isSupported) {
      this.updateState({ isSupported: false, isConnected: false });
      return false;
    }

    this.isRequesting = true;

    try {
      const nav = navigator as unknown as { requestMIDIAccess?: (opts?: { sysex: boolean }) => Promise<MidiAccessLike> };
      if (!nav.requestMIDIAccess) {
        this.isRequesting = false;
        return false;
      }

      this.midiAccess = await nav.requestMIDIAccess({ sysex: false });
      this.hasInitialized = true;
      this.isRequesting = false;
      
      this.midiAccess.onstatechange = () => {
        this.scanInputs();
      };

      this.scanInputs();
      return true;
    } catch (err) {
      console.warn('Web MIDI access request skipped or not granted:', err);
      this.hasInitialized = true;
      this.isRequesting = false;
      this.updateState({ isConnected: false });
      return false;
    }
  }

  private scanInputs() {
    if (!this.midiAccess) return;

    let foundConnected = false;
    let connectedName: string | null = null;

    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      if (input.state === 'connected') {
        foundConnected = true;
        connectedName = input.name || 'MIDI Drum Device';
        input.onmidimessage = this.handleMidiMessage.bind(this);
      }
    }

    this.updateState({
      isConnected: foundConnected,
      deviceName: connectedName,
    });
  }

  private handleMidiMessage(event: { data: Uint8Array | number[] }) {
    const data = event.data;
    if (!data || data.length < 3) return;

    const command = data[0] >> 4;
    const note = data[1];
    const velocity = data[2] / 127;

    // Note On command (command 9) with velocity > 0
    if (command === 9 && velocity > 0) {
      const instrument = this.noteToInstrumentMap[note] || (note < 40 ? 'bass' : 'snare');
      
      this.updateState({
        lastNote: note,
        lastVelocity: Math.round(velocity * 100),
      });

      if (this.onHitCallback) {
        this.onHitCallback(instrument, velocity);
      }
    }
  }

  private updateState(partial: Partial<MidiDeviceState>) {
    this.currentState = { ...this.currentState, ...partial };
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.currentState);
    }
  }

  public getState(): MidiDeviceState {
    return this.currentState;
  }
}

export const midiEngine = new MidiEngine();
