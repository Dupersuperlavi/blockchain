import React, { useState } from 'react';
import type { TokenInfo } from '../types';
import { TOKENS } from '../data/tokens';
import { X, Search, Check } from 'lucide-react';

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  currentToken: TokenInfo;
  otherToken: TokenInfo;
}

export const TokenSelectModal: React.FC<TokenSelectModalProps> = ({
  isOpen, onClose, onSelect, currentToken, otherToken
}) => {
  const [q, setQ] = useState('');

  if (!isOpen) return null;

  const filtered = TOKENS.filter(t =>
    t.symbol.toLowerCase().includes(q.toLowerCase()) ||
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    t.address.toLowerCase().includes(q.toLowerCase())
  );

  const popular = TOKENS.slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-[420px] bg-[#13141E] rounded-[24px] border border-white/[0.1] shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-base font-bold text-white">Select a token</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9DB5]" />
            <input
              autoFocus
              type="text"
              placeholder="Search name or paste address"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#191B28] text-white text-sm rounded-2xl border border-white/[0.08] focus:border-[#FC077D]/40 outline-none placeholder-[#9B9DB5] transition-colors"
            />
          </div>

          {/* Popular Tokens */}
          <div className="flex flex-wrap gap-2">
            {popular.map(t => {
              const isDisabled = t.symbol === otherToken.symbol;
              const isSelected = t.symbol === currentToken.symbol;
              return (
                <button
                  key={t.symbol}
                  disabled={isDisabled}
                  onClick={() => { onSelect(t); onClose(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-[#FC077D]/15 border-[#FC077D]/40 text-[#FC077D]'
                      : isDisabled
                      ? 'opacity-40 bg-[#191B28] border-transparent text-[#9B9DB5] cursor-not-allowed'
                      : 'bg-[#191B28] border-white/[0.08] text-white hover:border-white/[0.2]'
                  }`}
                >
                  <img src={t.iconUrl} alt={t.symbol} className="w-4 h-4 rounded-full object-contain" />
                  {t.symbol}
                </button>
              );
            })}
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="text-[11px] font-semibold text-[#9B9DB5] px-2 pb-2 uppercase tracking-widest">
            Token list
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#9B9DB5]">No tokens found</div>
          ) : (
            filtered.map(token => {
              const isSelected = token.symbol === currentToken.symbol;
              const isDisabled = token.symbol === otherToken.symbol;
              return (
                <button
                  key={token.address}
                  disabled={isDisabled}
                  onClick={() => { onSelect(token); onClose(); }}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-all ${
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#1B1C2A]'
                      : 'hover:bg-[#1B1C2A]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={token.iconUrl} alt={token.symbol} className="w-10 h-10 rounded-full object-contain" />
                    <div className="text-left">
                      <div className="font-bold text-[14px] text-white flex items-center gap-2">
                        {token.name}
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#FC077D]" />}
                      </div>
                      <div className="text-[12px] text-[#9B9DB5]">{token.symbol}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-mono text-[#9B9DB5]">
                      ${token.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
