import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function Login() {
  const [step, setStep] = useState('password');
  const [form, setForm] = useState({ email: '', password: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const submitPassword = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.login(form);
      if (res.mfaRequired) {
        // No session yet - the server issued only a scoped interim token.
        setStep('mfa');
        return;
      }
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.mfaChallenge(code);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="form-narrow">
      <h1>Sign in</h1>

      {error && <div className="alert error" role="alert">{error}</div>}

      {step === 'password' ? (
        <form onSubmit={submitPassword}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })} required />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} required />

          <button type="submit">Continue</button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <div className="alert success" role="status">
            Password accepted. Enter the six-digit code from your authenticator app.
          </div>
          <label htmlFor="code">Authentication code</label>
          <input id="code" inputMode="numeric" pattern="\d{6}" maxLength={6}
                 value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          <button type="submit">Verify</button>
        </form>
      )}

      <p className="muted">No account? <Link to="/register">Register</Link></p>
    </div>
  );
}