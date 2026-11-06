import React from 'react';
import { useSwitchChain, useChainId } from 'wagmi';
import { SUPPORTED_CHAINS } from '../config/wagmi';
import { CHAIN_ICONS } from '../data/tokens';
import { X, Check, Loader2 } from 'lucide-react';
import { getTronNetworkConfig } from '../config/tron';

interface NetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTron?: () => void;
  isTronActive?: boolean;
}

export const NetworkModal: React.FC<NetworkModalProps> = ({
  isOpen,
  onClose,
  onSelectTron,
  isTronActive = false,
}) => {
  const { switchChain, isPending } = useSwitchChain();
  const chainId = useChainId();
  const tronConfig = getTronNetworkConfig();

  if (!isOpen) return null;

  const handleSwitchEvm = (targetChainId: number) => {
    if (targetChainId === chainId) { onClose(); return; }
    switchChain({ chainId: targetChainId as any });
    onClose();
  };

  const handleSelectTron = () => {
    onSelectTron?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full sm:max-w-[390px] bg-[#13141E] rounded-t-[24px] sm:rounded-[24px] border border-white/[0.1] shadow-2xl p-5 sm:p-6 flex flex-col gap-4 max-h-[90dvh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* Drag handle */}
        <div className="flex justify-center sm:hidden mb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Select a network</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── TRON Network (TRC-20) ─────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#9B9DB5] px-1">
            TRON Network
          </div>
          <button
            onClick={handleSelectTron}
            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
              isTronActive
                ? 'bg-[#1B1C2A] border-[#eb0029]/60'
                : 'bg-[#191B28] border-white/[0.07] hover:border-white/[0.15] hover:bg-[#1B1C2A]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#eb0029] flex items-center justify-center text-white font-black text-sm">
                TRX
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>TRON Network</span>
                  <span className="text-[10px] bg-[#eb0029]/20 text-[#eb0029] px-1.5 py-0.5 rounded font-bold">
                    TRC-20
                  </span>
                </div>
                <div className="text-xs text-[#9B9DB5] mt-0.5">
                  {tronConfig.name} • USDT
                </div>
              </div>
            </div>
            {isTronActive ? (
              <div className="w-6 h-6 rounded-full bg-[#eb0029] flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
              </div>
            ) : null}
          </button>
        </div>

        {/* ── EVM Chains ───────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#9B9DB5] px-1">
            Ethereum & EVM Chains
          </div>
          {SUPPORTED_CHAINS.map((chain) => {
            const isActive = !isTronActive && chain.id === chainId;
            const icon = CHAIN_ICONS[chain.id];
            return (
              <button
                key={chain.id}
                onClick={() => handleSwitchEvm(chain.id)}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1B1C2A] border-[#FC077D]/40'
                    : 'bg-[#191B28] border-white/[0.07] hover:border-white/[0.15] hover:bg-[#1B1C2A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img src={icon} alt={chain.name} className="w-8 h-8 rounded-full object-cover" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">{chain.name}</div>
                    <div className="text-xs text-[#9B9DB5] mt-0.5">
                      {chain.id === 11155111 ? 'Testnet' : 'Mainnet'}
                    </div>
                  </div>
                </div>
                {isActive ? (
                  <div className="w-6 h-6 rounded-full bg-[#FC077D] flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  </div>
                ) : isPending ? (
                  <Loader2 className="w-4 h-4 text-[#9B9DB5] animate-spin" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
