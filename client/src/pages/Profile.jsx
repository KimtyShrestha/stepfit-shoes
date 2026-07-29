import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const startSetup = async () => {
    setError(null);
    try { setSetup(await api.mfaSetup()); } catch (err) { setError(err.message); }
  };

  const confirmSetup = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.mfaVerifySetup(code);
      setMessage('Multi-factor authentication is now enabled.');
      setSetup(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1>Profile</h1>

      <div className="card form-narrow">
        <p><strong>Name:</strong> {user.fullName}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> <span className="badge">{user.role}</span></p>
        <p><strong>MFA:</strong> {user.mfaEnabled ? 'Enabled' : 'Not enabled'}</p>
      </div>

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}

      {!user.mfaEnabled && (
        <div className="card form-narrow">
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Enable two-factor authentication</h2>
          {!setup ? (
            <button onClick={startSetup}>Set up authenticator app</button>
          ) : (
            <form onSubmit={confirmSetup}>
              <p className="muted">Scan this code with Google Authenticator, Authy or similar.</p>
              <img src={setup.qrCode} alt="Two-factor authentication setup QR code"
                   style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 6 }} />
              <p className="muted">Or enter manually: <code>{setup.manualEntryKey}</code></p>

              <label htmlFor="code">Enter the six-digit code to confirm</label>
              <input id="code" inputMode="numeric" pattern="\d{6}" maxLength={6}
                     value={code} onChange={(e) => setCode(e.target.value)} required />
              <button type="submit">Confirm and enable</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}