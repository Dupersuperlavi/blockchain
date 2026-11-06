import React, { useState } from 'react';
import { X, ChevronLeft, Check, ArrowRight, Shield } from 'lucide-react';

interface IssueCardModalProps {
  onClose: () => void;
  onContinue: (selectedCard: string) => void;
}

const CARD_OPTIONS = [
  {
    id: 'white',
    name: 'White',
    description: 'Up to 5% cashback in BTC, ETH or stablecoins on every purchase.',
    cashback: '1% Crypto Cashback',
    annualFee: 'Free',
    badge: null,
    gradient: 'linear-gradient(135deg, #e8e8ef 0%, #c9c9d6 100%)',
    numberColor: '#555',
    textColor: '#333',
    chipColor: '#b8860b',
    lastFour: '0365',
  },
  {
    id: 'blue',
    name: 'Blue',
    description: 'Up to 8% cashback in BTC, ETH or stablecoins on every purchase.',
    cashback: '1% Crypto Cashback',
    annualFee: 'Free',
    badge: null,
    gradient: 'linear-gradient(135deg, #5b20e6 0%, #3a00b5 100%)',
    numberColor: '#fff',
    textColor: '#fff',
    chipColor: '#f5d06a',
    lastFour: '8492',
  },
  {
    id: 'gold',
    name: 'GOLD',
    description: 'Hold $20,000+ in your portfolio and get a physical GOLD card.',
    cashback: '1% Crypto Cashback',
    annualFee: 'Free',
    badge: '$20K+',
    gradient: 'linear-gradient(135deg, #c9a227 0%, #f5d06a 50%, #b8860b 100%)',
    numberColor: '#fff',
    textColor: '#fff',
    chipColor: '#fff8e0',
    lastFour: '9018',
  },
];

// Chip SVG
const ChipSvg: React.FC<{ color: string }> = ({ color }) => (
  <svg width="22" height="17" viewBox="0 0 22 17" fill="none">
    <rect x="0.5" y="0.5" width="21" height="16" rx="3.5" stroke={color} strokeOpacity="0.6" fill={color} fillOpacity="0.18" />
    <line x1="7" y1="0" x2="7" y2="17" stroke={color} strokeOpacity="0.5" strokeWidth="0.8" />
    <line x1="15" y1="0" x2="15" y2="17" stroke={color} strokeOpacity="0.5" strokeWidth="0.8" />
    <line x1="0" y1="6" x2="22" y2="6" stroke={color} strokeOpacity="0.5" strokeWidth="0.8" />
    <line x1="0" y1="11" x2="22" y2="11" stroke={color} strokeOpacity="0.5" strokeWidth="0.8" />
  </svg>
);

// Small card preview for the list
const CardPreview: React.FC<{ card: typeof CARD_OPTIONS[0] }> = ({ card }) => (
  <div
    style={{
      width: 64,
      height: 42,
      borderRadius: 6,
      background: card.gradient,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '5px 7px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      flexShrink: 0,
    }}
  >
    <div style={{ fontSize: 7, fontWeight: 800, color: card.textColor, letterSpacing: 0.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      TRUST
    </div>
    <div style={{ fontSize: 6, fontWeight: 600, color: card.textColor, fontFamily: 'monospace', letterSpacing: 1 }}>
      •••• {card.lastFour}
    </div>
  </div>
);

// Large card preview for the confirmation page
const CardPreviewLarge: React.FC<{ card: typeof CARD_OPTIONS[0] }> = ({ card }) => (
  <div
    style={{
      width: 200,
      height: 126,
      borderRadius: 14,
      background: card.gradient,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '16px 18px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Shine */}
    <div
      style={{
        position: 'absolute',
        top: -30,
        left: -30,
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)',
        pointerEvents: 'none',
      }}
    />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 900, color: card.textColor, letterSpacing: 0.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        TRUST
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color: card.textColor, opacity: 0.7, letterSpacing: 1 }}>
        VIRTUAL
      </span>
    </div>
    <div style={{ marginTop: 4 }}>
      <ChipSvg color={card.chipColor} />
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: card.textColor, fontFamily: 'monospace', letterSpacing: 2, opacity: 0.9 }}>
      .... {card.lastFour}
    </div>
  </div>
);

// Detail table row
const DetailRow: React.FC<{ label: string; value: string; isLast?: boolean }> = ({ label, value, isLast }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '13px 0',
      borderBottom: isLast ? 'none' : '1px solid #f0f0f5',
    }}
  >
    <span style={{ fontSize: 14, color: '#999', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: 14, color: '#111', fontWeight: 700 }}>{value}</span>
  </div>
);

const IssueCardModal: React.FC<IssueCardModalProps> = ({ onClose, onContinue }) => {
  const [selected, setSelected] = useState<string>('white');
  const [step, setStep] = useState<1 | 2>(1);

  const selectedCard = CARD_OPTIONS.find((c) => c.id === selected) || CARD_OPTIONS[0];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
        animation: 'issueCardFadeIn 0.22s ease',
      }}
    >
      <div
        key={step}
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 420,
          padding: step === 2 ? '24px 24px 28px' : '28px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          position: 'relative',
          animation: 'issueCardSlideUp 0.25s ease',
        }}
      >

        {/* ─── STEP 1: Choose a card ─── */}
        {step === 1 && (
          <>
            <button
              onClick={onClose}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#333')}
              onMouseLeave={e => (e.currentTarget.style.color = '#999')}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: -0.5 }}>
                Issue a card
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#777', fontWeight: 500 }}>
                Choose a card to your taste.
              </p>
            </div>

            <div style={{ margin: '16px 0', padding: '10px 13px', background: '#f3f0ff', border: '1px solid #d6ccff', borderRadius: 10, fontSize: 13, color: '#5b00ff', fontWeight: 600, lineHeight: 1.45 }}>
              Card issuance is free. A wallet balance is required to activate and use the card.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CARD_OPTIONS.map((card) => {
                const isSelected = selected === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => setSelected(card.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 14px',
                      border: isSelected ? '2px solid #6b21ff' : '2px solid #e5e5ec',
                      borderRadius: 14,
                      background: isSelected ? '#faf8ff' : '#fff',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s ease', outline: 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#c4b5ff';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fdfcff';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e5ec';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fff';
                      }
                    }}
                  >
                    <CardPreview card={card} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                          {card.name}
                        </span>
                        {card.badge && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#b45309', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 5, padding: '1px 5px', letterSpacing: 0.3 }}>
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: '#666', lineHeight: 1.4 }}>
                        {card.description}
                      </p>
                    </div>
                    <div
                      style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: isSelected ? '2px solid #6b21ff' : '2px solid #d0d0dc',
                        background: isSelected ? '#6b21ff' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep(2)}
              style={{
                marginTop: 20, width: '100%', padding: '15px 0',
                background: '#6b21ff', color: '#fff', border: 'none', borderRadius: 13,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.18s, transform 0.15s',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                boxShadow: '0 6px 20px rgba(107,33,255,0.32)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#5a15e0';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#6b21ff';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              Continue
              <ArrowRight size={18} />
            </button>
          </>
        )}

        {/* ─── STEP 2: Verification / Confirmation ─── */}
        {step === 2 && (
          <>
            {/* Back */}
            <button
              onClick={() => setStep(1)}
              style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111')}
              onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#333')}
              onMouseLeave={e => (e.currentTarget.style.color = '#999')}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Title */}
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, color: '#111', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: -0.4, textAlign: 'center' }}>
              Verification
            </h2>

            {/* Large card */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <CardPreviewLarge card={selectedCard} />
            </div>

            {/* Ready badge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 20 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(34,197,94,0.35)',
                }}
              >
                <Check size={24} color="#fff" strokeWidth={2.5} />
              </div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: -0.3 }}>
                Ready to issue.
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#888', fontWeight: 500 }}>
                Check the details before issuing.
              </p>
            </div>

            {/* Info banner */}
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 9,
                padding: '10px 13px', background: '#f3f0ff', border: '1px solid #d6ccff',
                borderRadius: 10, fontSize: 13, color: '#5b00ff', fontWeight: 600,
                lineHeight: 1.45, marginBottom: 16,
              }}
            >
              <Shield size={15} style={{ marginTop: 1, flexShrink: 0 }} />
              Card issuance is free. A wallet balance is required to activate and use the card.
            </div>

            {/* Details table */}
            <div style={{ border: '1px solid #ebebf2', borderRadius: 12, padding: '0 16px', marginBottom: 20 }}>
              <DetailRow label="Card" value={selectedCard.name} />
              <DetailRow label="Cashback" value={selectedCard.cashback} />
              <DetailRow label="Annual fee" value={selectedCard.annualFee} isLast />
            </div>

            {/* Activate card */}
            <button
              onClick={() => onContinue(selected)}
              style={{
                width: '100%', padding: '15px 0',
                background: '#6b21ff', color: '#fff', border: 'none', borderRadius: 13,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.18s, transform 0.15s',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                boxShadow: '0 6px 20px rgba(107,33,255,0.32)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#5a15e0';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#6b21ff';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              Activate card
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes issueCardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes issueCardSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default IssueCardModal;
