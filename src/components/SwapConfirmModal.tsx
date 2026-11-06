import React, { useState, useEffect } from 'react';
import type { TokenInfo } from '../types';
import { X, ArrowDown, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useChainId } from 'wagmi';
import { SUPPORTED_CHAINS } from '../config/wagmi';

interface SwapConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromAmount: string;
  toAmount: string;
  onSuccess: () => void;
}

export const SwapConfirmModal: React.FC<SwapConfirmModalProps> = ({
  isOpen, onClose, fromToken, toToken, fromAmount, toAmount, onSuccess
}) => {
  const chainId = useChainId();
  const [step, setStep] = useState<'review' | 'pending' | 'success'>('review');
  const [txHash, setTxHash] = useState('');

  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const explorerUrl = chain?.blockExplorers?.default?.url || 'https://etherscan.io';

  useEffect(() => {
    if (isOpen) { setStep('review'); setTxHash(''); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setStep('pending');
    await new Promise(r => setTimeout(r, 2000));
    const hash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setTxHash(hash);
    setStep('success');
    onSuccess();
  };

  const fromUsd = (parseFloat(fromAmount || '0') * fromToken.priceUsd).toFixed(2);
  const toUsd = (parseFloat(toAmount || '0') * toToken.priceUsd).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-[420px] bg-[#13141E] rounded-[24px] border border-white/[0.1] shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            {step === 'review' && 'Review swap'}
            {step === 'pending' && 'Confirm in wallet'}
            {step === 'success' && 'Swap submitted'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'review' && (
          <>
            <div className="bg-[#191B28] rounded-2xl border border-white/[0.07] p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#9B9DB5] mb-1">You pay</div>
                <div className="text-[28px] font-bold text-white font-mono">{fromAmount}</div>
                <div className="text-[12px] text-[#9B9DB5] font-mono">${fromUsd}</div>
              </div>
              <div className="flex items-center gap-2 bg-[#1B1C2A] px-3 py-2 rounded-2xl border border-white/[0.08]">
                <img src={fromToken.iconUrl} alt={fromToken.symbol} className="w-6 h-6 rounded-full" />
                <span className="font-bold text-white">{fromToken.symbol}</span>
              </div>
            </div>

            <div className="flex justify-center -my-2 relative z-10">
              <div className="w-8 h-8 rounded-xl bg-[#1B1C2A] border border-white/[0.08] flex items-center justify-center text-[#9B9DB5]">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-[#191B28] rounded-2xl border border-white/[0.07] p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#9B9DB5] mb-1">You receive</div>
                <div className="text-[28px] font-bold text-emerald-400 font-mono">{toAmount}</div>
                <div className="text-[12px] text-[#9B9DB5] font-mono">${toUsd}</div>
              </div>
              <div className="flex items-center gap-2 bg-[#1B1C2A] px-3 py-2 rounded-2xl border border-white/[0.08]">
                <img src={toToken.iconUrl} alt={toToken.symbol} className="w-6 h-6 rounded-full" />
                <span className="font-bold text-white">{toToken.symbol}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#191B28]/70 border border-white/[0.06] flex flex-col gap-1.5 text-[12px] text-[#9B9DB5]">
              <div className="flex justify-between">
                <span>Network cost</span>
                <span className="text-white font-mono">~$1.84</span>
              </div>
              <div className="flex justify-between">
                <span>Min. received</span>
                <span className="text-white font-mono">{(parseFloat(toAmount || '0') * 0.995).toFixed(4)} {toToken.symbol}</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-[#FC077D] to-[#E0006C] hover:from-[#E0006C] hover:to-[#C0005C] text-white transition-all shadow-xl shadow-[#FC077D]/20 active:scale-[0.98]"
            >
              Confirm swap
            </button>
          </>
        )}

        {step === 'pending' && (
          <div className="py-10 text-center flex flex-col items-center gap-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-[#FC077D]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-[#FC077D] border-t-transparent animate-spin" />
              <img src={fromToken.iconUrl} alt="" className="absolute inset-4 rounded-full object-contain" />
            </div>
            <div>
              <div className="font-bold text-white">Confirm in your wallet</div>
              <div className="text-sm text-[#9B9DB5] mt-1">
                Swapping {fromAmount} {fromToken.symbol} for {toToken.symbol}
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>
            <div>
              <div className="font-bold text-white text-lg">Swap submitted!</div>
              <div className="text-sm text-[#9B9DB5] mt-1">
                {fromAmount} {fromToken.symbol} → {toAmount} {toToken.symbol}
              </div>
            </div>
            <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#FC077D] font-semibold hover:underline">
              <span>View on {chain?.name || 'Etherscan'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-[#1B1C2A] hover:bg-[#222436] text-white font-semibold text-sm border border-white/[0.08] transition-all">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
