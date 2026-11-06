import type { NetworkId, RequestType } from '../src/types/network.ts';
import type { PaymentStatus } from '../src/types/payment.ts';

// ─── In-Memory Payment Store ──────────────────────────────────────────────────
// Simple in-memory store for development. Replace with PostgreSQL for production.
// This module is used by server/paymentRoutes.ts via Vite middleware.

export interface PaymentRecord {
  id: string;
  network: NetworkId;
  asset: string;
  amount: string;
  walletA?: string;
  walletB: string;
  requestType: RequestType;
  status: PaymentStatus;
  transactionId?: string;
  createdAt: number;
  expiresAt: number;
  purpose: string;
}

// In-memory store — resets on server restart
const payments = new Map<string, PaymentRecord>();

// ── CRUD operations ───────────────────────────────────────────────────────────

export function createPayment(record: Omit<PaymentRecord, 'id' | 'createdAt'>): PaymentRecord {
  const id = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full: PaymentRecord = { ...record, id, createdAt: Date.now() };
  payments.set(id, full);
  return full;
}

export function getPayment(id: string): PaymentRecord | undefined {
  const record = payments.get(id);
  if (!record) return undefined;
  // Auto-expire
  if (Date.now() > record.expiresAt && record.status !== 'EXPIRED') {
    const expired = { ...record, status: 'EXPIRED' as PaymentStatus };
    payments.set(id, expired);
    return expired;
  }
  return record;
}

export function updatePayment(id: string, updates: Partial<PaymentRecord>): PaymentRecord | null {
  const record = payments.get(id);
  if (!record) return null;
  const updated = { ...record, ...updates };
  payments.set(id, updated);
  return updated;
}

export function getAllPayments(): PaymentRecord[] {
  return Array.from(payments.values());
}

export function deletePayment(id: string): boolean {
  return payments.delete(id);
}

// ── Wallet B config store ─────────────────────────────────────────────────────
// In production this would be a database table.
const walletBConfig = new Map<NetworkId, string>();

export function setWalletBAddress(network: NetworkId, address: string): void {
  walletBConfig.set(network, address);
}

export function getWalletBAddress(network: NetworkId): string | undefined {
  return walletBConfig.get(network);
}

export function getAllWalletBAddresses(): Record<string, string> {
  return Object.fromEntries(walletBConfig.entries());
}
