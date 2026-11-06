import React from 'react';
import { X, ShieldAlert, ShieldCheck, Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';

interface WriteAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: string | null;
  networkName: string;
  isRequesting: boolean;
  onAuthorize: () => Promise<boolean>;
}

export const WriteAccessModal: React.FC<WriteAccessModalProps> = ({
  isOpen,
  onClose,
  account,
  networkName,
  isRequesting,
  onAuthorize,
}) => {
  if (!isOpen || !account) return null;

  const truncatedAccount = `${account.slice(0, 6)}...${account.slice(-4)}`;

  const handleAuthorize = async () => {
    const success = await onAuthorize();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-[460px] bg-[#13141E] rounded-[24px] border border-white/[0.1] shadow-2xl p-6 flex flex-col gap-5 relative overflow-hidden">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#FC077D] via-[#A78BFA] to-[#38BDF8]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#FC077D]/15 border border-[#FC077D]/30 flex items-center justify-center text-[#FC077D]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Write Access Authorization</h3>
              <p className="text-xs text-[#9B9DB5]">Account Permission Level</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connected Account Card */}
        <div className="bg-[#191B28] rounded-2xl border border-white/[0.08] p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold font-mono">
              0x
            </div>
            <div>
              <div className="text-xs text-[#9B9DB5]">Target Account</div>
              <div className="text-sm font-bold text-white font-mono">{truncatedAccount}</div>
            </div>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-[#1B1C2A] border border-white/[0.08] text-[11px] font-semibold text-white">
            {networkName}
          </div>
        </div>

        {/* Permission Comparison Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Read Permission (Granted) */}
          <div className="bg-[#191B28]/80 border border-emerald-500/20 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Read Access</span>
            </div>
            <ul className="text-[#9B9DB5] text-[11px] space-y-1">
              <li>• Public address</li>
              <li>• Token balances</li>
              <li>• Tx history</li>
            </ul>
            <div className="mt-auto pt-1 text-[10px] font-semibold text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded-full text-center">
              Active by Default
            </div>
          </div>

          {/* Write Permission (Pending Approval) */}
          <div className="bg-[#191B28]/80 border border-[#FC077D]/30 rounded-2xl p-3 flex flex-col gap-2 relative">
            <div className="flex items-center gap-1.5 text-[#FC077D] font-bold">
              <ShieldAlert className="w-4 h-4" />
              <span>Write Access</span>
            </div>
            <ul className="text-[#9B9DB5] text-[11px] space-y-1">
              <li>• Token swaps</li>
              <li>• Spend approvals</li>
              <li>• Tx signatures</li>
            </ul>
            <div className="mt-auto pt-1 text-[10px] font-semibold text-[#FC077D] bg-[#FC077D]/10 px-2 py-0.5 rounded-full text-center">
              Requires Confirmation
            </div>
          </div>
        </div>

        {/* Security Assurance Banner */}
        <div className="p-3 rounded-2xl bg-[#191B28] border border-white/[0.06] flex items-start gap-2.5 text-xs text-[#9B9DB5]">
          <Lock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-white font-semibold">Security Promise:</span> Authorizing Write Access sends a standard signature request (`personal_sign`). Private keys & seed phrases are <strong className="text-white">never shared</strong>.
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={handleAuthorize}
            disabled={isRequesting}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-[#FC077D] to-[#E0006C] hover:from-[#E0006C] hover:to-[#C0005C] text-white transition-all shadow-xl shadow-[#FC077D]/25 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing Authorization in Wallet...</span>
              </>
            ) : (
              <>
                <span>Authorize Write Access</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={isRequesting}
            className="w-full py-2.5 rounded-2xl bg-[#1B1C2A] hover:bg-[#222436] text-[#9B9DB5] hover:text-white font-semibold text-xs border border-white/[0.08] transition-all cursor-pointer"
          >
            Stay in Read-Only Mode
          </button>
        </div>
      </div>
    </div>
  );
};
