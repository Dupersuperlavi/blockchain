import React, { useState } from 'react';
import { useAccount, useBalance, useDisconnect, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import { X, Copy, ExternalLink, LogOut, Check, ArrowUpRight, History } from 'lucide-react';
import { CHAIN_ICONS } from '../data/tokens';
import { SUPPORTED_CHAINS } from '../config/wagmi';

interface AccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  onClearTxs: () => void;
}

export const AccountDrawer: React.FC<AccountDrawerProps> = ({ isOpen, onClose, transactions, onClearTxs }) => {
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !address) return null;

  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const explorerUrl = chain?.blockExplorers?.default?.url || 'https://etherscan.io';
  const chainIcon = CHAIN_ICONS[chainId] || CHAIN_ICONS[1];

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  const shortAddr = `${address.slice(0, 6)}...${address.slice(-6)}`;
  const balanceFormatted = balance ? parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4) : '0.0000';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-[#13141E] border-l border-white/[0.08] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base">Account</span>
            {connector && (
              <span className="text-[10px] font-mono text-[#9B9DB5] bg-[#191B28] px-2 py-0.5 rounded-full border border-white/[0.08] capitalize">
                {connector.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Info */}
        <div className="px-6 py-5">
          <div className="p-4 rounded-2xl bg-[#191B28] border border-white/[0.07] flex flex-col gap-4">
            {/* Avatar + Address */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FC077D] to-[#4C82FB] flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">{address.slice(2, 4).toUpperCase()}</span>
                </div>
                <div>
                  <div className="font-mono font-bold text-white text-sm">{shortAddr}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-[#9B9DB5]">Connected</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={handleCopy} className="p-2 rounded-xl bg-[#1B1C2A] hover:bg-[#222436] text-[#9B9DB5] hover:text-white border border-white/[0.08] transition-all" title="Copy address">
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <a href={`${explorerUrl}/address/${address}`} target="_blank" rel="noreferrer" className="p-2 rounded-xl bg-[#1B1C2A] hover:bg-[#222436] text-[#9B9DB5] hover:text-white border border-white/[0.08] transition-all" title="View on explorer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Balance */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <img src={chainIcon} alt={chain?.name} className="w-5 h-5 rounded-full" />
                <span className="text-xs text-[#9B9DB5]">{chain?.name || 'Ethereum'}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-white">
                  {balanceFormatted} {balance?.symbol || 'ETH'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="flex-1 overflow-y-auto px-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9B9DB5]">
              <History className="w-4 h-4" />
              <span>Recent activity</span>
            </div>
            {transactions.length > 0 && (
              <button onClick={onClearTxs} className="text-[11px] text-[#9B9DB5] hover:text-white transition-colors">
                Clear all
              </button>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-[#9B9DB5] text-sm">Your transactions will appear here.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {transactions.map(tx => (
                <div key={tx.id} className="p-3 rounded-2xl bg-[#191B28] border border-white/[0.07] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#FC077D]/15 text-[#FC077D] flex items-center justify-center">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">
                        Swap {tx.fromAmount} {tx.fromToken} → {tx.toToken}
                      </div>
                      <div className="text-[10px] text-[#9B9DB5] mt-0.5">
                        {new Date(tx.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono text-[10px]">
                    Confirmed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Disconnect */}
        <div className="px-6 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400 font-semibold text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
};
