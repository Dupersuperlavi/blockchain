import { useState, type FormEvent } from 'react';
import { adminLogin } from './AdminApi';

interface AdminLoginProps {
  onLogin: () => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await adminLogin(username, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="login-brand-icon">Z</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Zenith Blockchain</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-dim)' }}>Admin Dashboard</div>
          </div>
        </div>

        <h1>Sign In</h1>
        <p className="login-subtitle">Enter your credentials to access the admin panel</p>

        {error && <div className="admin-login-error">⚠️ {error}</div>}

        <div className="admin-login-field">
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoFocus
            required
          />
        </div>

        <div className="admin-login-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            required
          />
        </div>

        <button className="admin-login-btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
