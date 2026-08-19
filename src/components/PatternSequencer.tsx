import React, { useState } from 'react';
import { BeatPattern, DrumInstrumentId, Handedness } from '../types/drum';
import { DRUM_INSTRUMENTS, PRESET_BEATS, getInstrumentHand } from '../data/beatLibrary';
import { Sparkles, Plus, Trash2, Sliders, Layers } from 'lucide-react';

interface PatternSequencerProps {
  currentPattern: BeatPattern;
  onSelectPattern: (pattern: BeatPattern) => void;
  onUpdateNotes: (notes: { step: number; instrument: DrumInstrumentId }[]) => void;
  handedness: Handedness;
  invertHands: boolean;
  currentStep: number;
  isPlaying: boolean;
}

const HAND_2_INSTRUMENTS: DrumInstrumentId[] = [
  'crash',
  'ride',
  'hihat_open',
  'hihat_closed',
  'high_tom',
  'mid_tom',
  'snare',
];

const HAND_1_INSTRUMENTS: DrumInstrumentId[] = [
  'floor_tom',
  'bass',
];

export const PatternSequencer: React.FC<PatternSequencerProps> = ({
  currentPattern,
  onSelectPattern,
  onUpdateNotes,
  handedness,
  invertHands,
  currentStep,
  isPlaying,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Rock & Pop', 'Floor Tom Heavy', 'Stick Rudiments & Coordination', 'Polyrhythms & Independence', 'Pyramid Speed Drills'];

  const filteredBeats = selectedCategory === 'All'
    ? PRESET_BEATS
    : PRESET_BEATS.filter((b) => b.category === selectedCategory);

  const floorBassHand = handedness === 'RIGHT_HANDED' ? (!invertHands ? 'RIGHT' : 'LEFT') : (!invertHands ? 'LEFT' : 'RIGHT');
  const otherHand = floorBassHand === 'RIGHT' ? 'LEFT' : 'RIGHT';

  const handleToggleCell = (instrument: DrumInstrumentId, step: number) => {
    const existingIndex = currentPattern.notes.findIndex(
      (n) => n.instrument === instrument && n.step === step
    );

    let updatedNotes = [...currentPattern.notes];
    if (existingIndex >= 0) {
      updatedNotes.splice(existingIndex, 1);
    } else {
      updatedNotes.push({ step, instrument });
    }

    onUpdateNotes(updatedNotes);
  };

  const handleClearAll = () => {
    onUpdateNotes([]);
  };

  const handleCreateCustom = () => {
    const newCustom: BeatPattern = {
      id: `custom-${Date.now()}`,
      title: 'Custom Drum Sticking Pattern',
      category: 'Custom',
      difficulty: 'Intermediate',
      description: 'Standardized two-handed drum exercise.',
      defaultBpm: 100,
      timeSignature: '4/4',
      totalSteps: 16,
      tags: ['Custom', 'User'],
      notes: [],
    };
    onSelectPattern(newCustom);
  };

  const handleRandomizeGroove = () => {
    const randomNotes: { step: number; instrument: DrumInstrumentId }[] = [];
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 0 || (s % 2 === 1 && Math.random() > 0.6)) {
        randomNotes.push({ step: s, instrument: Math.random() > 0.4 ? 'bass' : 'floor_tom' });
      }
      if (s % 2 === 0) {
        randomNotes.push({ step: s, instrument: 'hihat_closed' });
      }
      if (s === 4 || s === 12) {
        randomNotes.push({ step: s, instrument: 'snare' });
      }
    }
    onUpdateNotes(randomNotes);
  };

  const renderInstrumentRow = (instId: DrumInstrumentId) => {
    const instDef = DRUM_INSTRUMENTS[instId];
    const instHand = getInstrumentHand(instId, handedness, invertHands);
    const isFloorOrBass = instId === 'bass' || instId === 'floor_tom';

    return (
      <div
        key={instId}
        className="grid grid-cols-[100px_repeat(16,1fr)] sm:grid-cols-[120px_repeat(16,1fr)] gap-0.5 sm:gap-1 items-center"
      >
        {/* Instrument Label */}
        <div
          className={`flex items-center justify-between px-1.5 py-0.5 rounded border text-left leading-none ${
            isFloorOrBass
              ? 'bg-orange-950/40 border-orange-500/40 text-orange-200'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <span className="font-display font-black text-[10px] sm:text-xs truncate">
            {instDef.shortName}
          </span>
          <span
            className={`text-[8px] font-mono-code font-bold px-1 py-0.2 rounded ${
              instHand === 'RIGHT' ? 'bg-orange-600 text-white' : 'bg-cyan-500 text-black'
            }`}
          >
            {instHand[0]}H
          </span>
        </div>

        {/* 16 Step Buttons */}
        {Array.from({ length: 16 }).map((_, stepIdx) => {
          const isActive = currentPattern.notes.some(
            (n) => n.instrument === instId && n.step === stepIdx
          );
          const isCurrent = isPlaying && currentStep % 16 === stepIdx;
          const isQuarter = stepIdx % 4 === 0;

          return (
            <button
              key={stepIdx}
              onClick={() => handleToggleCell(instId, stepIdx)}
              className={`h-5 sm:h-6 rounded-[4px] transition-all flex items-center justify-center border select-none ${
                isActive
                  ? isFloorOrBass
                    ? isCurrent
                      ? 'bg-orange-400 border-white shadow-[0_0_8px_#FF6D00] scale-105 z-10'
                      : 'bg-orange-600 border-orange-400'
                    : isCurrent
                    ? 'bg-cyan-300 border-white shadow-[0_0_8px_#00E5FF] scale-105 z-10'
                    : 'bg-cyan-500 border-cyan-300'
                  : isCurrent
                  ? 'bg-slate-800 border-amber-400'
                  : isQuarter
                  ? 'bg-slate-900 border-slate-700/80 hover:bg-slate-800'
                  : 'bg-slate-950/70 border-slate-800/50 hover:bg-slate-900'
              }`}
            >
              {isActive && (
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isFloorOrBass ? 'bg-white' : 'bg-black'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-b from-slate-900 via-[#10182b] to-[#0a101f] border border-slate-800 p-2.5 sm:p-3 shadow-xl overflow-hidden">
      {/* Top Header: Pattern Selector Dropdown & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        {/* Preset Selector Dropdown */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-400">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-display font-black text-xs text-white">SELECT GROOVE:</span>
            <select
              value={currentPattern.id}
              onChange={(e) => {
                const found = PRESET_BEATS.find((b) => b.id === e.target.value);
                if (found) onSelectPattern(found);
              }}
              className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-0.5 font-mono-code text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
            >
              {filteredBeats.map((beat) => (
                <option key={beat.id} value={beat.id}>
                  [{beat.category}] {beat.title} ({beat.defaultBpm} BPM)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRandomizeGroove}
            className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[10px] font-mono-code font-bold transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Random
          </button>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-[10px] font-mono-code font-bold transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>

          <button
            onClick={handleCreateCustom}
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 text-[10px] font-mono-code font-bold transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      {/* Category Filter Pills (Single Line) */}
      <div className="flex items-center gap-1 overflow-hidden">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-black font-bold'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 16-Step Matrix */}
      <div className="rounded-lg border border-slate-800 bg-[#070b16] p-2 flex flex-col gap-1 overflow-hidden">
        {/* Step Numbers Header */}
        <div className="grid grid-cols-[100px_repeat(16,1fr)] sm:grid-cols-[120px_repeat(16,1fr)] gap-0.5 sm:gap-1 mb-1 items-center text-center">
          <div className="text-[9px] font-mono-code font-bold text-slate-400 text-left pl-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span>ELEMENT</span>
          </div>
          {Array.from({ length: 16 }).map((_, stepIdx) => {
            const isCurrent = isPlaying && currentStep % 16 === stepIdx;
            const isQuarter = stepIdx % 4 === 0;
            const beatNum = Math.floor(stepIdx / 4) + 1;
            const subStr = ['1', 'e', '&', 'a'][stepIdx % 4];

            return (
              <div
                key={stepIdx}
                className={`py-0.5 rounded text-[9px] font-mono-code font-bold transition-colors ${
                  isCurrent
                    ? 'bg-amber-400 text-black shadow-[0_0_8px_#FFD700]'
                    : isQuarter
                    ? 'bg-slate-800 text-slate-200'
                    : 'text-slate-500'
                }`}
              >
                {beatNum}{subStr !== '1' ? subStr : ''}
              </div>
            );
          })}
        </div>

        {/* Section 1: Hand 2 Instruments (Snare, Cymbals, Rack Toms) */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[9px] font-mono-code font-bold text-cyan-400 px-1">
            • {otherHand} HAND: SNARE & CYMBALS
          </div>
          {HAND_2_INSTRUMENTS.map(renderInstrumentRow)}
        </div>

        {/* Section 2: Hand 1 Instruments (Floor Tom & Bass Drum) */}
        <div className="flex flex-col gap-0.5 mt-1 border-t border-slate-800/80 pt-1">
          <div className="text-[9px] font-mono-code font-bold text-orange-400 px-1">
            • {floorBassHand} HAND: FLOOR TOM & BASS DRUM
          </div>
          {HAND_1_INSTRUMENTS.map(renderInstrumentRow)}
        </div>
      </div>
    </div>
  );
};
