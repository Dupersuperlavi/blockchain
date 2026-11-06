import React, { useState } from 'react';
import { useAccount, useBalance, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import { ChevronDown, Wallet, Menu, X } from 'lucide-react';
import { CHAIN_ICONS } from '../data/tokens';
import { SUPPORTED_CHAINS } from '../config/wagmi';

interface HeaderProps {
  onOpenNetworkModal: () => void;
  onOpenAccountDrawer: () => void;
  onConnectWallet: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenNetworkModal, onOpenAccountDrawer, onConnectWallet }) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const currentChain = SUPPORTED_CHAINS.find((chain) => chain.id === chainId);
  const chainIcon = CHAIN_ICONS[chainId] || CHAIN_ICONS[1];
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const formatAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
  const formatBalance = () => {
    if (!balance) return '0.000';
    return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(3);
  };

  const NavLinks = () => (
    <>
      <a href="#how-it-works" onClick={() => setMobileNavOpen(false)}>How it works</a>
      <a href="#benefits" onClick={() => setMobileNavOpen(false)}>Benefits</a>
      <a href="#faq" onClick={() => setMobileNavOpen(false)}>FAQ</a>
    </>
  );

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Bitwit Wallet home">
          <span className="brand-mark"><span /></span>
          <span>Bitwit</span>
        </a>

        {/* Desktop nav */}
        <nav className="site-nav" aria-label="Primary navigation"><NavLinks /></nav>

        <div className="header-actions">
          {isConnected && (
            <button className="network-button" onClick={onOpenNetworkModal} aria-label="Choose network">
              <img src={chainIcon} alt="" />
              <span className="network-name">{currentChain?.name || 'Ethereum'}</span>
              <ChevronDown size={15} />
            </button>
          )}
          {isConnected ? (
            <button className="account-button" onClick={onOpenAccountDrawer}>
              <span className="online-dot" />
              <span>{address ? formatAddress(address) : 'Connected'}</span>
              <small>{formatBalance()} {balance?.symbol || 'ETH'}</small>
            </button>
          ) : (
            <button className="header-cta" onClick={onConnectWallet}>
              <Wallet size={16} /> Get a card
            </button>
          )}

          {/* Mobile hamburger — shown only when no wallet connected */}
          {!isConnected && (
            <button
              className="sm:hidden p-2 rounded-xl bg-[#f5f4f8] text-[#292833] ml-1"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)}>
          <nav
            className="absolute top-0 right-0 w-64 h-full bg-white shadow-2xl flex flex-col pt-24 px-8 gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <a href="#how-it-works" className="text-lg font-bold text-[#0e0e11] hover:text-[#5600ff]" onClick={() => setMobileNavOpen(false)}>How it works</a>
            <a href="#benefits" className="text-lg font-bold text-[#0e0e11] hover:text-[#5600ff]" onClick={() => setMobileNavOpen(false)}>Benefits</a>
            <a href="#faq" className="text-lg font-bold text-[#0e0e11] hover:text-[#5600ff]" onClick={() => setMobileNavOpen(false)}>FAQ</a>
            <button
              className="mt-4 w-full py-3 px-5 bg-[#5600ff] text-white font-bold rounded-full text-sm flex items-center justify-center gap-2"
              onClick={() => { setMobileNavOpen(false); onConnectWallet(); }}
            >
              <Wallet size={16} /> Get a card
            </button>
          </nav>
        </div>
      )}
    </>
  );
};
