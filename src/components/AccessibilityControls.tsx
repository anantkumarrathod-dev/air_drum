import React from 'react';
import { AccessibilityConfig, SoundKitId } from '../types/drum';
import { SOUND_KITS } from '../data/beatLibrary';
import { Eye, Volume2, Sparkles, Smartphone, Music } from 'lucide-react';

interface AccessibilityControlsProps {
  config: AccessibilityConfig;
  onChange: (updated: Partial<AccessibilityConfig>) => void;
}

export const AccessibilityControls: React.FC<AccessibilityControlsProps> = ({
  config,
  onChange,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#090f1d] border border-slate-800 p-4 shadow-xl text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
        <div className="p-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
          <Eye className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-display font-black text-sm text-white">
            STUDIO SOUND KITS & ACCESSIBILITY
          </h3>
          <p className="text-[11px] font-mono-code text-slate-400">
            Deaf/HOH high-contrast visual cues, sound kits & haptics
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Sound Kit Switcher */}
        <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <label className="font-mono-code font-bold text-slate-300 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-cyan-400" />
            ACOUSTIC SOUND KIT:
          </label>
          <select
            value={config.soundKit || 'studio_birch'}
            onChange={(e) => onChange({ soundKit: e.target.value as SoundKitId })}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 font-mono-code text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
          >
            {SOUND_KITS.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name} — {kit.description}
              </option>
            ))}
          </select>
        </div>

        {/* Visual Metronome Flash Intensity */}
        <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <label className="font-mono-code font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            DOWNBEAT VISUAL FLASH:
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['off', 'subtle', 'vibrant'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onChange({ visualFlash: mode })}
                className={`py-1 rounded font-mono-code uppercase font-bold transition-all ${
                  config.visualFlash === mode
                    ? 'bg-amber-500 text-black shadow-[0_0_8px_#FFD700]'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Tactile Haptic Vibration Toggle */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <div className="flex flex-col">
              <span className="font-mono-code font-bold text-white">Tactile Haptics (Vibration)</span>
              <span className="text-[10px] text-slate-400">Vibrates device on kick and snare hits</span>
            </div>
          </div>
          <button
            onClick={() => onChange({ hapticVibration: !config.hapticVibration })}
            className={`px-3 py-1 rounded-lg font-mono-code font-bold transition-colors ${
              config.hapticVibration
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {config.hapticVibration ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Sound Volume Slider */}
        <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between font-mono-code">
            <span className="font-bold text-slate-300 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              MASTER SYNTH VOLUME:
            </span>
            <span className="text-cyan-400 font-bold">{Math.round(config.soundVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.soundVolume}
            onChange={(e) => onChange({ soundVolume: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};
