import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BeatPattern, 
  DrumInstrumentId, 
  Hand, 
  Handedness, 
  HitFeedbackEvent, 
  PracticeStats, 
  SpeedTrainerConfig, 
  AccessibilityConfig 
} from './types/drum';
import { PRESET_BEATS, getInstrumentHand } from './data/beatLibrary';
import { getRankFromXp } from './data/careerLadder';
import { audioEngine } from './services/audioEngine';
import { midiEngine, MidiDeviceState } from './services/midiEngine';
import { micEngine, MicDetectorState } from './services/micEngine';
import { VisualMetronome } from './components/VisualMetronome';
import { RhythmHighway } from './components/RhythmHighway';
import { DrumKitVisualizer } from './components/DrumKitVisualizer';
import { PatternSequencer } from './components/PatternSequencer';
import { PracticeHUD } from './components/PracticeHUD';
import { AccessibilityControls } from './components/AccessibilityControls';
import { AirDrummingCamera } from './components/AirDrummingCamera';
import { TimingScatterPlot } from './components/TimingScatterPlot';
import { CareerProgressModal } from './components/CareerProgressModal';
import { 
  Drum, 
  Camera, 
  Sliders, 
  BarChart2, 
  Settings2, 
  Minimize2, 
  Maximize2, 
  Play, 
  Square, 
  RotateCcw,
  Sparkles,
  Mic,
  MicOff,
  Cable
} from 'lucide-react';

type ActiveTab = 'stage' | 'camera' | 'sequencer' | 'scatter' | 'settings';

export const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('stage');

  // State
  const [currentPattern, setCurrentPattern] = useState<BeatPattern>(PRESET_BEATS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(PRESET_BEATS[0].defaultBpm);
  const [handedness, setHandedness] = useState<Handedness>('RIGHT_HANDED');
  const [invertHands, setInvertHands] = useState<boolean>(false);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(false);

  // Fullscreen & Buffer Countdown State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [autoFullscreenOnStart, setAutoFullscreenOnStart] = useState<boolean>(false);
  const [bufferCountdownEnabled, setBufferCountdownEnabled] = useState<boolean>(true);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(5);

  // Playback & Timing state
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [currentBar, setCurrentBar] = useState<number>(1);
  const [barsUntilIncrement, setBarsUntilIncrement] = useState<number>(4);
  const [isSpeedRampingDown, setIsSpeedRampingDown] = useState<boolean>(false);

  // Highway / animation time tracking
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const lastProcessedStepRef = useRef<number>(-1);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  // Countdown timer ref
  const countdownTimerRef = useRef<number | null>(null);

  // Active drum kit hits for animations
  const [activeHits, setActiveHits] = useState<{ instrument: DrumInstrumentId; hand: Hand; timestamp: number }[]>([]);
  const [recentHitFeedbacks, setRecentHitFeedbacks] = useState<HitFeedbackEvent[]>([]);

  // Gamified Career XP & Belt Rank
  const [xp, setXp] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('drum_trainer_xp');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isCareerModalOpen, setIsCareerModalOpen] = useState<boolean>(false);

  // Web MIDI & Practice Pad Mic States
  const [midiState, setMidiState] = useState<MidiDeviceState>(midiEngine.getState());
  const [micState, setMicState] = useState<MicDetectorState>(micEngine.getState());

  // Speed trainer config
  const [speedTrainer, setSpeedTrainer] = useState<SpeedTrainerConfig>({
    enabled: false,
    mode: 'linear_ramp',
    startBpm: 80,
    targetBpm: 140,
    bpmIncrement: 5,
    barsPerIncrement: 4,
  });

  // Accessibility config
  const [accessibility, setAccessibility] = useState<AccessibilityConfig>({
    highContrast: true,
    visualFlash: 'vibrant',
    showSubdivisions: true,
    colorScheme: 'default',
    soundEnabled: true,
    soundVolume: 0.8,
    countInBars: 1,
    hapticVibration: true,
    soundKit: 'studio_birch',
  });

  // Practice statistics
  const [stats, setStats] = useState<PracticeStats>({
    totalNotes: 0,
    perfect: 0,
    early: 0,
    late: 0,
    missed: 0,
    streak: 0,
    maxStreak: 0,
    accuracyPercentage: 100,
    hitHistory: [],
  });

  // Calculate loop and step durations
  const secondsPerBeat = 60 / bpm;
  const loopDuration = secondsPerBeat * (currentPattern.totalSteps / 4);
  const stepDuration = loopDuration / currentPattern.totalSteps;
  const currentBeat = Math.floor(currentStep / 4) % 4;

  // Persist XP to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('drum_trainer_xp', xp.toString());
    } catch {
      // Ignore if localStorage unavailable
    }
  }, [xp]);

  // Sync sound settings to audio engine
  useEffect(() => {
    audioEngine.setMuted(!accessibility.soundEnabled);
    audioEngine.setVolume(accessibility.soundVolume);
    audioEngine.setSoundKit(accessibility.soundKit);
    audioEngine.setHaptics(accessibility.hapticVibration);
  }, [accessibility]);

  // Sync Fullscreen state from browser events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Strictly prevent right-click context menu in any fullscreen mode or document-level fullscreen
      if (Boolean(document.fullscreenElement) || isFullscreen) {
        e.preventDefault();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  // Evaluate Strike Callback
  const evaluateUserStrike = useCallback(
    (hand: Hand) => {
      audioEngine.init();

      const floorBassHand = handedness === 'RIGHT_HANDED' ? (!invertHands ? 'RIGHT' : 'LEFT') : (!invertHands ? 'LEFT' : 'RIGHT');
      const isFloorBassStrike = hand === floorBassHand;

      if (isFloorBassStrike) {
        audioEngine.playInstrument('bass', 1.0);
        setActiveHits((prev) => [...prev.slice(-10), { instrument: 'bass', hand, timestamp: Date.now() }]);
      } else {
        audioEngine.playInstrument('snare', 1.0);
        setActiveHits((prev) => [...prev.slice(-10), { instrument: 'snare', hand, timestamp: Date.now() }]);
      }

      if (!isPlaying) return;

      const now = Date.now();
      const currentSec = currentPlaybackTime;

      let closestNoteFound: { step: number; instrument: DrumInstrumentId; timeDiffMs: number } | null = null;
      let minDiffMs = Infinity;

      [-loopDuration, 0, loopDuration].forEach((offset) => {
        currentPattern.notes.forEach((note) => {
          const noteHand = getInstrumentHand(note.instrument, handedness, invertHands);
          if (noteHand === hand) {
            const noteTargetSec = (note.step * stepDuration) + offset;
            const diffMs = (currentSec - noteTargetSec) * 1000;
            if (Math.abs(diffMs) < Math.abs(minDiffMs)) {
              minDiffMs = diffMs;
              closestNoteFound = { step: note.step, instrument: note.instrument, timeDiffMs: diffMs };
            }
          }
        });
      });

      if (closestNoteFound !== null && Math.abs(minDiffMs) <= 180) {
        let rating: 'PERFECT' | 'EARLY' | 'LATE' = 'PERFECT';
        let xpGained = 25;

        if (minDiffMs < -45) {
          rating = 'EARLY';
          xpGained = 10;
        } else if (minDiffMs > 45) {
          rating = 'LATE';
          xpGained = 10;
        }

        const validNote = closestNoteFound as { step: number; instrument: DrumInstrumentId; timeDiffMs: number };

        const feedback: HitFeedbackEvent = {
          id: now + Math.random(),
          timestamp: now,
          rating,
          hand,
          instrument: validNote.instrument,
          offsetMs: Math.round(minDiffMs),
        };

        setXp((prev) => prev + xpGained);
        setRecentHitFeedbacks((prev) => [...prev.slice(-6), feedback]);

        setStats((prev) => {
          const newTotal = prev.totalNotes + 1;
          const newPerf = rating === 'PERFECT' ? prev.perfect + 1 : prev.perfect;
          const newEarly = rating === 'EARLY' ? prev.early + 1 : prev.early;
          const newLate = rating === 'LATE' ? prev.late + 1 : prev.late;
          const newStreak = rating === 'PERFECT' ? prev.streak + 1 : 0;
          const newMaxStreak = Math.max(prev.maxStreak, newStreak);
          const accuracy = Math.round(((newPerf * 1.0 + (newEarly + newLate) * 0.6) / newTotal) * 100);

          return {
            totalNotes: newTotal,
            perfect: newPerf,
            early: newEarly,
            late: newLate,
            missed: prev.missed,
            streak: newStreak,
            maxStreak: newMaxStreak,
            accuracyPercentage: isNaN(accuracy) ? 100 : accuracy,
            hitHistory: [...prev.hitHistory.slice(-40), feedback],
          };
        });
      }
    },
    [isPlaying, currentPlaybackTime, loopDuration, stepDuration, currentPattern, handedness, invertHands]
  );

  // Ref to hold latest evaluateUserStrike to avoid re-triggering MIDI/Mic effects
  const evaluateUserStrikeRef = useRef(evaluateUserStrike);
  evaluateUserStrikeRef.current = evaluateUserStrike;

  const handednessRef = useRef(handedness);
  handednessRef.current = handedness;

  const invertHandsRef = useRef(invertHands);
  invertHandsRef.current = invertHands;

  // Stable Web MIDI callback update
  useEffect(() => {
    midiEngine.setOnHit((instrument, velocity) => {
      const hand = getInstrumentHand(instrument, handednessRef.current, invertHandsRef.current);
      audioEngine.playInstrument(instrument, velocity);
      setActiveHits((prev) => [...prev.slice(-10), { instrument, hand, timestamp: Date.now() }]);
      evaluateUserStrikeRef.current(hand);
    });
  }, []);

  // Initialize MIDI once on mount or when user clicks MIDI button
  const handleConnectMidi = useCallback(async () => {
    await midiEngine.init(
      (instrument, velocity) => {
        const hand = getInstrumentHand(instrument, handednessRef.current, invertHandsRef.current);
        audioEngine.playInstrument(instrument, velocity);
        setActiveHits((prev) => [...prev.slice(-10), { instrument, hand, timestamp: Date.now() }]);
        evaluateUserStrikeRef.current(hand);
      },
      (newMidiState) => {
        setMidiState(newMidiState);
      }
    );
  }, []);

  // Toggle Practice Pad Microphone Detection
  const handleToggleMic = async () => {
    if (micState.isActive) {
      micEngine.stop();
      setMicState(micEngine.getState());
    } else {
      const otherHand = handednessRef.current === 'RIGHT_HANDED' ? (!invertHandsRef.current ? 'LEFT' : 'RIGHT') : (!invertHandsRef.current ? 'RIGHT' : 'LEFT');
      await micEngine.start(
        () => {
          evaluateUserStrikeRef.current(otherHand);
        },
        (newMicState) => {
          setMicState(newMicState);
        }
      );
    }
  };

  // Main rhythm loop
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (!isPlayingRef.current) return;

      const now = performance.now() / 1000;
      const elapsed = now - playbackStartTimeRef.current;
      const loopTime = elapsed % loopDuration;
      setCurrentPlaybackTime(loopTime);

      const exactStep = Math.floor(loopTime / stepDuration);

      if (exactStep !== lastProcessedStepRef.current) {
        lastProcessedStepRef.current = exactStep;
        setCurrentStep(exactStep);

        if (exactStep === 0 && elapsed > 0.1) {
          setXp((prev) => prev + 50); // +50 XP per completed bar

          setCurrentBar((prev) => {
            const nextBar = prev + 1;
            if (speedTrainer.enabled) {
              setBarsUntilIncrement((barsLeft) => {
                if (barsLeft <= 1) {
                  setBpm((prevBpm) => {
                    if (speedTrainer.mode === 'pyramid_ladder') {
                      if (!isSpeedRampingDown) {
                        if (prevBpm + speedTrainer.bpmIncrement >= speedTrainer.targetBpm) {
                          setIsSpeedRampingDown(true);
                          return speedTrainer.targetBpm;
                        }
                        return prevBpm + speedTrainer.bpmIncrement;
                      } else {
                        if (prevBpm - speedTrainer.bpmIncrement <= speedTrainer.startBpm) {
                          setIsSpeedRampingDown(false);
                          return speedTrainer.startBpm;
                        }
                        return prevBpm - speedTrainer.bpmIncrement;
                      }
                    } else {
                      return Math.min(speedTrainer.targetBpm, prevBpm + speedTrainer.bpmIncrement);
                    }
                  });
                  return speedTrainer.barsPerIncrement;
                }
                return barsLeft - 1;
              });
            }
            return nextBar;
          });
        }

        const notesAtStep = currentPattern.notes.filter((n) => n.step === exactStep);
        if (notesAtStep.length > 0) {
          const newHits: { instrument: DrumInstrumentId; hand: Hand; timestamp: number }[] = [];

          notesAtStep.forEach((note) => {
            const hand = getInstrumentHand(note.instrument, handedness, invertHands);

            if (!isPracticeMode) {
              audioEngine.playInstrument(note.instrument, note.velocity || 1.0);
            }

            newHits.push({
              instrument: note.instrument,
              hand,
              timestamp: Date.now(),
            });
          });

          setActiveHits((prev) => [...prev.slice(-10), ...newHits]);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      playbackStartTimeRef.current = performance.now() / 1000 - (currentStep * stepDuration);
      lastProcessedStepRef.current = -1;
      animId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, bpm, loopDuration, stepDuration, currentPattern, handedness, invertHands, isPracticeMode, speedTrainer, isSpeedRampingDown]);

  // Start trainer execution
  const startTrainerExecution = useCallback(() => {
    audioEngine.init();
    setIsPlaying(true);
    setIsCountingDown(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    audioEngine.init();

    if (isCountingDown) {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setIsCountingDown(false);
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (autoFullscreenOnStart && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    if (bufferCountdownEnabled) {
      setIsCountingDown(true);
      setCountdownSeconds(5);
      audioEngine.playMetronomeTick(true);

      let remaining = 5;
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          setCountdownSeconds(remaining);
          audioEngine.playMetronomeTick(remaining === 1);
        } else {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          startTrainerExecution();
        }
      }, 1000);
    } else {
      startTrainerExecution();
    }
  }, [isCountingDown, isPlaying, autoFullscreenOnStart, bufferCountdownEnabled, startTrainerExecution]);

  const handleReset = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    setIsPlaying(false);
    setCurrentStep(0);
    setCurrentBar(1);
    setCurrentPlaybackTime(0);
    lastProcessedStepRef.current = -1;
    setBarsUntilIncrement(speedTrainer.barsPerIncrement);
    setIsSpeedRampingDown(false);
  };

  const handleSelectPattern = (pattern: BeatPattern) => {
    setCurrentPattern(pattern);
    setBpm(pattern.defaultBpm);
    handleReset();
  };

  const handleUpdateNotes = (newNotes: { step: number; instrument: DrumInstrumentId }[]) => {
    setCurrentPattern((prev) => ({
      ...prev,
      notes: newNotes,
    }));
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const key = e.key.toLowerCase();
      if (key === 'd' || key === 'f' || key === 'arrowleft') {
        evaluateUserStrike('LEFT');
      } else if (key === 'j' || key === 'k' || key === 'arrowright') {
        evaluateUserStrike('RIGHT');
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [evaluateUserStrike, handleTogglePlay]);

  const handleResetStats = () => {
    setStats({
      totalNotes: 0,
      perfect: 0,
      early: 0,
      late: 0,
      missed: 0,
      streak: 0,
      maxStreak: 0,
      accuracyPercentage: 100,
      hitHistory: [],
    });
  };

  const floorBassHand = handedness === 'RIGHT_HANDED' ? (!invertHands ? 'RIGHT' : 'LEFT') : (!invertHands ? 'LEFT' : 'RIGHT');
  const otherHand = floorBassHand === 'RIGHT' ? 'LEFT' : 'RIGHT';
  const { currentRank } = getRankFromXp(xp);

  return (
    <div className="h-screen max-h-screen w-screen max-w-full bg-[#070b14] text-slate-100 flex flex-col overflow-hidden select-none">
      
      {/* CAREER PROGRESS MODAL */}
      <CareerProgressModal
        xp={xp}
        streak={stats.streak}
        maxStreak={stats.maxStreak}
        totalHits={stats.totalNotes}
        accuracy={stats.accuracyPercentage}
        isOpen={isCareerModalOpen}
        onClose={() => setIsCareerModalOpen(false)}
      />

      {/* 5-SECOND BUFFER COUNTDOWN OVERLAY */}
      {isCountingDown && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="flex flex-col items-center max-w-lg text-center gap-4">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 text-xs font-mono-code font-bold">
              <Sparkles className="w-4 h-4 animate-spin" />
              GET READY • POSITION YOUR DRUMSTICKS OR INDEX FINGERS
            </div>

            <div className="relative flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-cyan-500 to-amber-500 p-1 flex items-center justify-center shadow-[0_0_60px_rgba(0,229,255,0.6)] animate-pulse">
                <div className="w-full h-full bg-[#0a0f1d] rounded-full flex items-center justify-center font-display font-black text-6xl text-white">
                  {countdownSeconds}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="flex flex-col items-center p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40">
                <span className="text-xs font-mono-code text-cyan-300 font-bold">{otherHand} HAND [D / F]</span>
                <span className="font-display font-bold text-xs text-white mt-0.5">SNARE & CYMBALS</span>
              </div>

              <div className="flex flex-col items-center p-2.5 rounded-xl bg-orange-950/40 border border-orange-500/40">
                <span className="text-xs font-mono-code text-orange-300 font-bold">{floorBassHand} HAND [J / K]</span>
                <span className="font-display font-bold text-xs text-white mt-0.5">FLOOR TOM & BASS</span>
              </div>
            </div>

            <button
              onClick={handleTogglePlay}
              className="px-5 py-1.5 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-mono-code font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 1. TOP COMPACT STATUS & METRONOME BAR (HEIGHT: ~42PX) */}
      <header className="shrink-0 h-11 bg-[#0d1424] border-b border-slate-800/80 px-2.5 flex items-center justify-between gap-2 shadow-sm">
        {/* Left: App Title & Belt Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-cyan-500 to-amber-500 p-0.5 flex items-center justify-center shadow-sm">
            <div className="w-full h-full bg-[#0b1020] rounded-[4px] flex items-center justify-center">
              <Drum className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>
          
          <span className="font-display font-black text-xs text-white tracking-wide hidden sm:inline">
            DRUMSTICK PRO
          </span>

          {/* Gamified Belt Rank Badge */}
          <button
            onClick={() => setIsCareerModalOpen(true)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono-code font-bold transition-all shadow-sm ${currentRank.badgeBg} ${currentRank.badgeBorder} ${currentRank.badgeText} hover:scale-105`}
            title="Open Career & Belt Ladder"
          >
            <span>{currentRank.iconEmoji}</span>
            <span className="truncate max-w-[80px] sm:max-w-none">{currentRank.name}</span>
            <span className="text-white/70">({xp} XP)</span>
          </button>
        </div>

        {/* Center: Slim Metronome Ticker */}
        <div className="flex flex-1 max-w-sm mx-1 justify-center">
          <VisualMetronome
            currentStep={currentStep}
            totalSteps={currentPattern.totalSteps}
            bpm={bpm}
            isPlaying={isPlaying}
            currentBar={currentBar}
            barsUntilIncrement={barsUntilIncrement}
          />
        </div>

        {/* Right: Master Play, Restart, Inputs & BPM */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Practice Pad Mic Toggle */}
          <button
            onClick={handleToggleMic}
            className={`p-1 rounded border transition-all ${
              micState.isActive
                ? 'bg-red-950/80 border-red-500/60 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={micState.isActive ? 'Acoustic Pad Mic: Active' : 'Enable Acoustic Pad Mic'}
          >
            {micState.isActive ? <Mic className="w-3.5 h-3.5 text-red-400 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>

          {/* Web MIDI Connection Button */}
          {midiState.isSupported && (
            <button
              onClick={handleConnectMidi}
              className={`p-1 rounded border transition-all ${
                midiState.isConnected
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={midiState.isConnected ? `MIDI E-Kit: ${midiState.deviceName || 'Connected'}` : 'Click to connect USB/MIDI Electronic Drum Kit'}
            >
              <Cable className="w-3.5 h-3.5" />
            </button>
          )}

          {/* BPM Stepper */}
          <div className="flex items-center bg-black/60 px-1.5 py-0.5 rounded border border-slate-800 text-[11px] font-mono-code gap-1">
            <span className="text-slate-300 font-bold">{bpm}</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setBpm((b) => Math.max(30, b - 5))}
                className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-[9px]"
              >
                -
              </button>
              <button
                onClick={() => setBpm((b) => Math.min(240, b + 5))}
                className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-[9px]"
              >
                +
              </button>
            </div>
          </div>

          {/* Master Start / Pause */}
          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-display font-bold shadow transition-all ${
              isPlaying
                ? 'bg-amber-500 text-black shadow-[0_0_8px_#FFD700]'
                : 'bg-emerald-500 text-black shadow-[0_0_8px_#10B981]'
            }`}
            title={isPlaying ? 'Pause Trainer' : 'Start Trainer'}
          >
            {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isPlaying ? 'PAUSE' : 'START'}</span>
          </button>

          {/* Instant Restart Button */}
          <button
            onClick={handleReset}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm active:scale-95"
            title="Restart from Beginning (Step 0 / Bar 1)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>
        </div>
      </header>

      {/* 2. TOUCH TAB SELECTOR BAR (HEIGHT: ~36PX) */}
      <nav className="shrink-0 h-9 bg-[#090e1c] border-b border-slate-800/80 px-2 flex items-center justify-between gap-1 overflow-hidden">
        <div className="flex items-center gap-1 w-full h-full py-0.5">
          <button
            onClick={() => setActiveTab('stage')}
            className={`flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg font-display font-black text-[11px] sm:text-xs transition-all ${
              activeTab === 'stage'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Drum className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">1. DRUM STAGE</span>
          </button>

          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg font-display font-black text-[11px] sm:text-xs transition-all ${
              activeTab === 'camera'
                ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">2. AIR DRUMMING</span>
          </button>

          <button
            onClick={() => setActiveTab('sequencer')}
            className={`flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg font-display font-black text-[11px] sm:text-xs transition-all ${
              activeTab === 'sequencer'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">3. BEAT MATRIX</span>
          </button>

          <button
            onClick={() => setActiveTab('scatter')}
            className={`flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg font-display font-black text-[11px] sm:text-xs transition-all ${
              activeTab === 'scatter'
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">4. TIMING & AUDIO</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg font-display font-black text-[11px] sm:text-xs transition-all ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-sky-400 to-cyan-500 text-black shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">5. SOUND KITS</span>
          </button>
        </div>
      </nav>

      {/* 3. DYNAMIC ACTIVE SCREEN VIEWPORT (STRICT ZERO SCROLLBAR) */}
      <main className="flex-1 min-h-0 w-full h-full p-2 flex flex-col overflow-hidden relative">
        {/* TAB 1: MAIN DRUM STAGE (RHYTHM HIGHWAY + REALISTIC ACOUSTIC KIT) */}
        {activeTab === 'stage' && (
          <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-2 items-center overflow-hidden">
            {/* Left: Waterfall Canvas Highway */}
            <div className="md:col-span-6 h-full flex flex-col justify-center overflow-hidden">
              <RhythmHighway
                pattern={currentPattern}
                currentPlaybackTime={currentPlaybackTime}
                loopDuration={loopDuration}
                isPlaying={isPlaying}
                handedness={handedness}
                invertHands={invertHands}
                recentHits={recentHitFeedbacks}
                onManualHitPad={evaluateUserStrike}
              />
            </div>

            {/* Right: Standardized 3D Acoustic Drum Kit */}
            <div className="md:col-span-6 h-full flex flex-col justify-center overflow-hidden">
              <DrumKitVisualizer
                activeHits={activeHits}
                handedness={handedness}
                invertHands={invertHands}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                bpm={bpm}
                patternTitle={currentPattern.title}
                currentBeat={currentBeat}
                onToggleHandedness={() =>
                  setHandedness((prev) => (prev === 'RIGHT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED'))
                }
                onToggleInvertHands={() => setInvertHands((prev) => !prev)}
                onPadClick={(inst) => {
                  const hand = getInstrumentHand(inst, handedness, invertHands);
                  audioEngine.playInstrument(inst, 1.0);
                  setActiveHits((prev) => [...prev.slice(-10), { instrument: inst, hand, timestamp: Date.now() }]);
                }}
              />
            </div>
          </div>
        )}

        {/* TAB 2: AIR DRUMMING MOTION SENSOR VIEWPORT */}
        {activeTab === 'camera' && (
          <div className="w-full h-full flex-1 flex flex-col min-h-0 max-w-7xl mx-auto overflow-hidden">
            <AirDrummingCamera
              onAirStrike={(instrument, hand) => {
                audioEngine.playInstrument(instrument, 1.0);
                setActiveHits((prev) => [...prev.slice(-10), { instrument, hand, timestamp: Date.now() }]);
                evaluateUserStrike(hand);
              }}
              handedness={handedness}
              invertHands={invertHands}
            />
          </div>
        )}

        {/* TAB 3: STEP SEQUENCER & BEAT LIBRARY MATRIX */}
        {activeTab === 'sequencer' && (
          <div className="w-full h-full flex flex-col justify-center max-w-5xl mx-auto overflow-hidden">
            <PatternSequencer
              currentPattern={currentPattern}
              onSelectPattern={handleSelectPattern}
              onUpdateNotes={handleUpdateNotes}
              handedness={handedness}
              invertHands={invertHands}
              currentStep={currentStep}
              isPlaying={isPlaying}
            />
          </div>
        )}

        {/* TAB 4: RUSH/DRAG TIMING SCATTER & AUDIO TAKE RECORDER */}
        {activeTab === 'scatter' && (
          <div className="w-full h-full flex flex-col justify-center max-w-3xl mx-auto overflow-hidden">
            <TimingScatterPlot
              hitHistory={stats.hitHistory}
              onClearHistory={() => setStats((p) => ({ ...p, hitHistory: [] }))}
            />
          </div>
        )}

        {/* TAB 5: STUDIO SOUND KITS & MASTER HUD SETTINGS */}
        {activeTab === 'settings' && (
          <div className="w-full h-full flex flex-col justify-center max-w-4xl mx-auto gap-2 overflow-hidden">
            <AccessibilityControls
              config={accessibility}
              onChange={(updated) => setAccessibility((prev) => ({ ...prev, ...updated }))}
            />

            <PracticeHUD
              isPlaying={isPlaying}
              isCountingDown={isCountingDown}
              onTogglePlay={handleTogglePlay}
              onReset={handleReset}
              bpm={bpm}
              onBpmChange={(newBpm) => setBpm(newBpm)}
              handedness={handedness}
              onToggleHandedness={() =>
                setHandedness((prev) => (prev === 'RIGHT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED'))
              }
              invertHands={invertHands}
              onToggleInvertHands={() => setInvertHands((prev) => !prev)}
              isPracticeMode={isPracticeMode}
              onTogglePracticeMode={() => setIsPracticeMode((prev) => !prev)}
              speedTrainer={speedTrainer}
              onUpdateSpeedTrainer={(upd) => setSpeedTrainer((prev) => ({ ...prev, ...upd }))}
              accessibility={accessibility}
              onUpdateAccessibility={(upd) => setAccessibility((prev) => ({ ...prev, ...upd }))}
              stats={stats}
              onResetStats={handleResetStats}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              autoFullscreenOnStart={autoFullscreenOnStart}
              onToggleAutoFullscreen={setAutoFullscreenOnStart}
              bufferCountdownEnabled={bufferCountdownEnabled}
              onToggleBufferCountdown={setBufferCountdownEnabled}
            />
          </div>
        )}
      </main>
    </div>
  );
};
export default App;
