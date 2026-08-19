export type DrumInstrumentId = 
  | 'bass' 
  | 'floor_tom' 
  | 'snare' 
  | 'hihat_closed' 
  | 'hihat_open' 
  | 'high_tom' 
  | 'mid_tom' 
  | 'crash' 
  | 'ride';

export type Hand = 'LEFT' | 'RIGHT';

export type Handedness = 'RIGHT_HANDED' | 'LEFT_HANDED';

export type SoundKitId = 'studio_birch' | 'vintage_maple' | 'heavy_metal' | 'synth_808' | 'practice_pad';

export interface SoundKitDef {
  id: SoundKitId;
  name: string;
  description: string;
}

export interface DrumInstrumentDef {
  id: DrumInstrumentId;
  name: string;
  shortName: string;
  category: 'floor_bass' | 'rest';
  color: string;
  iconName: string;
  defaultHandRighty: Hand;
  frequency?: number;
}

export interface DrumNote {
  id: string;
  step: number;
  instrument: DrumInstrumentId;
  velocity?: number;
  hand: Hand;
}

export type BeatCategory = 
  | 'Rock & Pop' 
  | 'Floor Tom Heavy' 
  | 'Funk & Syncopation' 
  | 'Jazz & Swing' 
  | 'Latin & World' 
  | 'Metal & Speed' 
  | 'Stick Rudiments & Coordination' 
  | 'Polyrhythms & Independence'
  | 'Pyramid Speed Drills'
  | 'Custom';

export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';

export interface BeatPattern {
  id: string;
  title: string;
  category: BeatCategory;
  difficulty: DifficultyLevel;
  description: string;
  defaultBpm: number;
  timeSignature: '4/4' | '3/4' | '6/8';
  totalSteps: number;
  notes: { step: number; instrument: DrumInstrumentId; velocity?: number }[];
  tags: string[];
}

export type HitRating = 'PERFECT' | 'EARLY' | 'LATE' | 'MISS';

export interface HitFeedbackEvent {
  id: number;
  timestamp: number;
  rating: HitRating;
  hand: Hand;
  instrument: DrumInstrumentId;
  offsetMs: number; // Negative = Early, Positive = Late
}

export interface PracticeStats {
  totalNotes: number;
  perfect: number;
  early: number;
  late: number;
  missed: number;
  streak: number;
  maxStreak: number;
  accuracyPercentage: number;
  hitHistory: HitFeedbackEvent[];
}

export interface AccessibilityConfig {
  highContrast: boolean;
  visualFlash: 'off' | 'subtle' | 'vibrant';
  showSubdivisions: boolean;
  colorScheme: 'default' | 'high-contrast-neon' | 'protanopia' | 'deuteranopia';
  soundEnabled: boolean;
  soundVolume: number;
  countInBars: number;
  hapticVibration: boolean;
  soundKit: SoundKitId;
}

export interface SpeedTrainerConfig {
  enabled: boolean;
  mode: 'linear_ramp' | 'pyramid_ladder';
  startBpm: number;
  targetBpm: number;
  bpmIncrement: number;
  barsPerIncrement: number;
}
