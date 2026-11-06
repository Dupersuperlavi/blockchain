import React from 'react';
import type { SlippageSettings } from '../types';
import { X, Info } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SlippageSettings;
  onUpdate: (s: SlippageSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdate }) => {
  if (!isOpen) return null;

  const presets = [0.1, 0.5, 1.0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-[360px] bg-[#13141E] rounded-[24px] border border-white/[0.1] shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Transaction Settings</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Max Slippage */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9B9DB5] uppercase tracking-widest">
            <span>Max. slippage</span>
            <Info className="w-3.5 h-3.5 text-[#7780A0]" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdate({ ...settings, auto: true, value: 0.5 })}
              className={`px-3 py-2 rounded-2xl border text-xs font-semibold transition-all ${
                settings.auto
                  ? 'bg-[#FC077D]/15 border-[#FC077D]/40 text-[#FC077D]'
                  : 'bg-[#191B28] border-white/[0.08] text-[#9B9DB5] hover:text-white'
              }`}
            >
              Auto
            </button>
            {presets.map(v => (
              <button
                key={v}
                onClick={() => onUpdate({ ...settings, auto: false, value: v })}
                className={`px-3 py-2 rounded-2xl border text-xs font-semibold transition-all ${
                  !settings.auto && settings.value === v
                    ? 'bg-[#FC077D]/15 border-[#FC077D]/40 text-[#FC077D]'
                    : 'bg-[#191B28] border-white/[0.08] text-[#9B9DB5] hover:text-white'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Deadline */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9B9DB5] uppercase tracking-widest">
            <span>Transaction deadline</span>
            <Info className="w-3.5 h-3.5 text-[#7780A0]" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="60"
              value={settings.deadline}
              onChange={e => onUpdate({ ...settings, deadline: Math.max(1, parseInt(e.target.value) || 20) })}
              className="w-20 px-3 py-2 bg-[#191B28] text-white text-sm font-mono rounded-2xl border border-white/[0.08] focus:border-[#FC077D]/40 outline-none"
            />
            <span className="text-sm text-[#9B9DB5]">minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
};
