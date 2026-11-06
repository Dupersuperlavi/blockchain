import React, { createContext, useContext, useState } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { X, AlertCircle, Shield, ArrowRight, Loader2, Sparkles, ExternalLink } from 'lucide-react';

interface Web3ModalCtx {
  openModal: () => void;
  closeModal: () => void;
}
const Web3ModalContext = createContext<Web3ModalCtx>({ openModal: () => {}, closeModal: () => {} });
export const useWeb3Modal = () => useContext(Web3ModalContext);

export const Web3ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <Web3ModalContext.Provider value={{ openModal: () => setOpen(true), closeModal: () => setOpen(false) }}>
      {children}
      {open && <ConnectWalletModal onClose={() => setOpen(false)} />}
    </Web3ModalContext.Provider>
  );
};

const WALLET_OPTIONS = [
  {
    id: 'metaMask',
    name: 'MetaMask',
    description: 'Connect using browser extension',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    popular: true,
    requiresExtension: true,
    badge: undefined as string | undefined,
  },
  {
    id: 'coinbaseWallet',
    name: 'Coinbase Wallet',
    description: 'Passkey, phone & extension',
    icon: 'https://www.coinbase.com/img/favicon/favicon-32x32.png',
    popular: false,
    requiresExtension: false,
    badge: undefined as string | undefined,
  },
  {
    id: 'injected',
    name: 'Browser Wallet',
    description: 'Any injected EIP-1193 provider',
    icon: null,
    popular: false,
    requiresExtension: true,
    badge: undefined as string | undefined,
  },
  {
    id: 'mock',
    name: 'Sandbox Demo Wallet',
    description: 'Instant preview without extension',
    icon: null,
    popular: false,
    requiresExtension: false,
    badge: 'Demo Mode',
  },
];

interface ConnectWalletModalProps {
  onClose: () => void;
}

const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({ onClose }) => {
  const { connect, connectors, isPending, error } = useConnect();
  const { isConnected } = useAccount();
  const [connecting, setConnecting] = useState<string | null>(null);

  React.useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  const hasInjected = typeof window !== 'undefined' && Boolean((window as any).ethereum);

  const handleConnect = async (walletId: string) => {
    setConnecting(walletId);

    try {
      let targetConnector;
      if (walletId === 'mock') {
        targetConnector = connectors.find(c => c.id === 'mock');
      } else if (walletId === 'metaMask') {
        targetConnector = connectors.find(c => c.id === 'metaMask' || c.id === 'injected' || c.name === 'MetaMask');
      } else if (walletId === 'coinbaseWallet') {
        targetConnector = connectors.find(c => c.id === 'coinbaseWallet' || c.name === 'Coinbase Wallet');
      } else {
        targetConnector = connectors.find(c => c.id === 'injected');
      }

      if (!targetConnector) {
        targetConnector = connectors.find(c => c.id === 'mock') || connectors[0];
      }

      await connect({ connector: targetConnector });
    } catch (e: any) {
      console.error('Connection failed:', e);
      if (e?.name === 'ProviderNotFoundError' || e?.message?.includes('Provider not found')) {
        const mockConn = connectors.find(c => c.id === 'mock');
        if (mockConn) await connect({ connector: mockConn });
      }
    } finally {
      setConnecting(null);
    }
  };

  const formatErrorMessage = (err: Error | null) => {
    if (!err) return null;
    const msg = err.message || '';
    if (msg.includes('Provider not found') || msg.includes('ProviderNotFoundError')) {
      return (
        <div className="flex flex-col gap-1.5">
          <span>MetaMask or injected Web3 provider was not found in this browser.</span>
          <div className="flex items-center gap-2 mt-1">
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-[11px] border border-amber-500/30 transition-all"
            >
              <span>Install MetaMask Extension</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleConnect('mock')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FC077D]/20 hover:bg-[#FC077D]/30 text-[#FC077D] font-semibold text-[11px] border border-[#FC077D]/30 transition-all cursor-pointer"
            >
              <span>Try Sandbox Demo Wallet</span>
            </button>
          </div>
        </div>
      );
    }
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
      return 'Permission request was cancelled in your wallet.';
    }
    return msg.slice(0, 120);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full sm:max-w-[420px] bg-[#13141E] rounded-t-[24px] sm:rounded-[24px] border border-white/[0.1] shadow-2xl shadow-black/80 p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 max-h-[90dvh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* Drag handle — visible on mobile only */}
        <div className="flex justify-center sm:hidden mb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Connect a wallet</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#9B9DB5] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detection Status */}
        <div className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 ${
          hasInjected
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
        }`}>
          {hasInjected ? (
            <>
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Web3 extension detected! Click <strong>MetaMask</strong> below to request connection permissions.</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span>No Web3 extension detected in this browser window.</span>
                <span className="block mt-1 text-[#9B9DB5]">
                  Install <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-amber-300 underline font-semibold">MetaMask</a> or use <strong>Sandbox Demo Wallet</strong> below to test.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {formatErrorMessage(error)}
          </div>
        )}

        {/* Wallet Options */}
        <div className="flex flex-col gap-2">
          {WALLET_OPTIONS.map((wallet) => {
            const isCurrentlyConnecting =
              (connecting === wallet.id && isPending) ||
              (connecting === wallet.id);

            return (
              <button
                key={wallet.id}
                onClick={() => handleConnect(wallet.id)}
                disabled={isPending}
                className="group flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer bg-[#1B1C2A] border-white/[0.08] hover:bg-[#222436] hover:border-[#FC077D]/30"
              >
                <div className="flex items-center gap-3.5">
                  {/* Icon */}
                  {wallet.icon ? (
                    <img src={wallet.icon} alt={wallet.name} className="w-9 h-9 rounded-xl object-contain" />
                  ) : wallet.id === 'mock' ? (
                    <div className="w-9 h-9 rounded-xl bg-[#FC077D]/15 flex items-center justify-center text-[#FC077D]">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-[#2A2B3D] flex items-center justify-center text-[#9B9DB5] text-lg">
                      🌐
                    </div>
                  )}

                  <div className="text-left">
                    <div className="text-sm font-semibold text-white group-hover:text-[#FC077D] transition-colors flex items-center gap-1.5">
                      {wallet.name}
                      {wallet.popular && (
                        <span className="text-[9px] font-mono bg-[#FC077D]/15 text-[#FC077D] px-1.5 py-0.5 rounded-full border border-[#FC077D]/20 uppercase tracking-wide">
                          Popular
                        </span>
                      )}
                      {wallet.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                          {wallet.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#9B9DB5] mt-0.5">
                      {wallet.description}
                    </div>
                  </div>
                </div>

                {/* Right indicator */}
                {isCurrentlyConnecting ? (
                  <Loader2 className="w-4 h-4 text-[#FC077D] animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-[#9B9DB5] group-hover:text-[#FC077D] group-hover:translate-x-0.5 transition-all" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#9B9DB5] leading-relaxed border-t border-white/[0.06] pt-4">
          By connecting, you agree to Uniswap Labs'{' '}
          <a href="https://uniswap.org/terms-of-service" target="_blank" rel="noreferrer" className="text-white hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="https://uniswap.org/privacy-policy" target="_blank" rel="noreferrer" className="text-white hover:underline">
            Privacy Policy
          </a>.
        </p>
      </div>
    </div>
  );
};
