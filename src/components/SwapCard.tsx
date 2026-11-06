import React, { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import type { TokenInfo, SlippageSettings } from '../types';
import { Settings, ArrowDownUp, ChevronDown, Sparkles, Layers } from 'lucide-react';
import { useWeb3Modal } from './ConnectWalletModal';

interface SwapCardProps {
  onOpenTokenSelect: (mode: 'from' | 'to') => void;
  onOpenSettings: () => void;
  onInitiateSwap: (fromToken: TokenInfo, toToken: TokenInfo, fromAmount: string, toAmount: string) => void;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  settings: SlippageSettings;
  hasWriteAccess?: boolean;
  onOpenWriteAccessModal?: () => void;
}

export const SwapCard: React.FC<SwapCardProps> = ({
  onOpenTokenSelect,
  onOpenSettings,
  onInitiateSwap,
  fromToken,
  toToken,
  settings,
  hasWriteAccess = false,
  onOpenWriteAccessModal = () => {},
}) => {
  const { isConnected, address } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const { openModal } = useWeb3Modal();

  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const ethBalanceStr = ethBalance ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4) : '0.0000';

  // Auto-calculate receive amount
  useEffect(() => {
    if (!fromAmount || isNaN(Number(fromAmount)) || Number(fromAmount) <= 0) {
      setToAmount('');
      return;
    }
    const usdValue = parseFloat(fromAmount) * fromToken.priceUsd;
    const toQty = usdValue / toToken.priceUsd;
    setToAmount(toQty.toFixed(6));
  }, [fromAmount, fromToken, toToken]);

  const handleFlip = () => {
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const handleMax = () => {
    if (fromToken.symbol === 'ETH' && ethBalance) {
      const formatted = formatUnits(ethBalance.value, ethBalance.decimals);
      const maxEth = Math.max(0, parseFloat(formatted) - 0.001);
      setFromAmount(maxEth.toFixed(6));
    }
  };

  const fromUsd = (parseFloat(fromAmount || '0') * fromToken.priceUsd).toFixed(2);
  const toUsd = (parseFloat(toAmount || '0') * toToken.priceUsd).toFixed(2);
  const rateStr = fromToken.priceUsd > 0 ? (fromToken.priceUsd / toToken.priceUsd).toFixed(6) : '0';
  const isZero = !fromAmount || parseFloat(fromAmount) <= 0;

  const getButton = () => {
    if (!isConnected) return { text: 'Connect Wallet', fn: openModal, disabled: false, style: 'pink' };
    if (!hasWriteAccess) return { text: 'Grant Write Access to Swap', fn: onOpenWriteAccessModal, disabled: false, style: 'pink' };
    if (isZero) return { text: 'Enter an amount', fn: () => {}, disabled: true, style: 'disabled' };
    return { text: 'Swap', fn: () => onInitiateSwap(fromToken, toToken, fromAmount, toAmount), disabled: false, style: 'pink' };
  };

  const btn = getButton();

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="bg-[#13141E] rounded-[24px] border border-white/[0.08] shadow-2xl shadow-black/60 p-4">
        {/* Card Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-white">Swap</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-semibold text-[#9B9DB5] bg-[#191B28] hover:bg-[#222436] rounded-2xl border border-white/[0.08] transition-all"
            >
              <span>{settings.auto ? 'Auto' : settings.value + '%'}</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="w-8 h-8 flex items-center justify-center rounded-2xl bg-[#191B28] hover:bg-[#222436] text-[#9B9DB5] hover:text-white border border-white/[0.08] transition-all"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* You Pay */}
        <div className="bg-[#191B28] rounded-[20px] border border-white/[0.07] p-4 focus-within:border-[#FC077D]/40 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-[#9B9DB5] font-medium">You pay</span>
            {isConnected && fromToken.symbol === 'ETH' && ethBalance && (
              <button
                onClick={handleMax}
                className="text-[11px] text-[#9B9DB5] hover:text-white transition-colors"
              >
                Balance: <span className="text-[#FC077D] font-semibold">{ethBalanceStr} ETH (Max)</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="0"
              min="0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="flex-1 bg-transparent text-[36px] font-bold text-white placeholder-[#3D4266] outline-none w-0"
            />
            <button
              onClick={() => onOpenTokenSelect('from')}
              className="flex items-center gap-2 bg-[#1B1C2A] hover:bg-[#222436] pl-2 pr-3 py-2 rounded-2xl border border-white/[0.08] shrink-0 transition-all cursor-pointer"
            >
              <img src={fromToken.iconUrl} alt={fromToken.symbol} className="w-6 h-6 rounded-full object-contain" />
              <span className="font-bold text-[15px] text-white">{fromToken.symbol}</span>
              <ChevronDown className="w-4 h-4 text-[#9B9DB5]" />
            </button>
          </div>
          <div className="mt-2 text-[12px] text-[#9B9DB5] font-mono">
            {fromAmount ? `$${fromUsd}` : '$0.00'}
          </div>
        </div>

        {/* Flip Button */}
        <div className="flex justify-center -my-3.5 relative z-10">
          <button
            onClick={handleFlip}
            className="w-9 h-9 rounded-[12px] bg-[#1B1C2A] hover:bg-[#2A2B3D] border border-white/[0.08] text-[#9B9DB5] hover:text-[#FC077D] transition-all group cursor-pointer flex items-center justify-center shadow-lg"
          >
            <ArrowDownUp className="w-4 h-4 group-hover:rotate-180 transition-transform duration-300" />
          </button>
        </div>

        {/* You Receive */}
        <div className="bg-[#191B28] rounded-[20px] border border-white/[0.07] p-4 focus-within:border-[#FC077D]/40 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-[#9B9DB5] font-medium">You receive</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              readOnly
              placeholder="0"
              value={toAmount}
              className="flex-1 bg-transparent text-[36px] font-bold text-white placeholder-[#3D4266] outline-none w-0 cursor-default"
            />
            <button
              onClick={() => onOpenTokenSelect('to')}
              className="flex items-center gap-2 bg-[#FC077D] hover:bg-[#E0006C] pl-2 pr-3 py-2 rounded-2xl shrink-0 transition-all cursor-pointer shadow-lg shadow-[#FC077D]/20"
            >
              <img src={toToken.iconUrl} alt={toToken.symbol} className="w-6 h-6 rounded-full object-contain" />
              <span className="font-bold text-[15px] text-white">{toToken.symbol}</span>
              <ChevronDown className="w-4 h-4 text-white/80" />
            </button>
          </div>
          <div className="mt-2 text-[12px] text-[#9B9DB5] font-mono">
            {toAmount ? `$${toUsd}` : '$0.00'}
          </div>
        </div>

        {/* Swap Details Accordion */}
        {fromAmount && parseFloat(fromAmount) > 0 && (
          <button
            onClick={() => setShowDetails(v => !v)}
            className="w-full mt-3 flex items-center justify-between px-3 py-2.5 rounded-2xl bg-[#191B28]/50 border border-white/[0.06] text-[12px] text-[#9B9DB5] cursor-pointer hover:text-white transition-colors"
          >
            <div className="flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>1 {fromToken.symbol} = {rateStr} {toToken.symbol}</span>
              <span className="text-[#7780A0]">(${fromToken.priceUsd.toLocaleString()})</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400">
              <span>~$1.84</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </div>
          </button>
        )}

        {showDetails && fromAmount && parseFloat(fromAmount) > 0 && (
          <div className="mt-1 px-3 py-3 rounded-2xl bg-[#191B28]/50 border border-white/[0.06] flex flex-col gap-2 text-[12px]">
            <div className="flex justify-between text-[#9B9DB5]">
              <span>Price impact</span>
              <span className="text-emerald-400 font-mono">&lt; 0.01%</span>
            </div>
            <div className="flex justify-between text-[#9B9DB5]">
              <span>Max. slippage</span>
              <span className="text-white font-mono">{settings.auto ? 'Auto' : settings.value + '%'}</span>
            </div>
            <div className="flex justify-between text-[#9B9DB5]">
              <span>Network cost</span>
              <span className="text-white font-mono">~$1.84</span>
            </div>
            <div className="flex justify-between text-[#9B9DB5]">
              <span>Route</span>
              <span className="text-[#FC077D] font-mono flex items-center gap-1">
                <Layers className="w-3 h-3" />
                V3 Auto Router
              </span>
            </div>
          </div>
        )}

        {/* Swap / Connect Button */}
        <button
          onClick={btn.fn}
          disabled={btn.disabled}
          className={`w-full mt-3 py-4 rounded-2xl font-bold text-[16px] transition-all ${
            btn.style === 'pink'
              ? 'bg-gradient-to-r from-[#FC077D] to-[#E0006C] hover:from-[#E0006C] hover:to-[#C0005C] text-white shadow-xl shadow-[#FC077D]/20 active:scale-[0.98] cursor-pointer'
              : 'bg-[#191B28] text-[#9B9DB5] cursor-not-allowed border border-white/[0.06]'
          }`}
        >
          {btn.text}
        </button>
      </div>
    </div>
  );
};
