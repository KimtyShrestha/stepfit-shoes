import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

/** Mirrors the server policy purely for live feedback. The server is authoritative. */
function scoreLocal(pw) {
  let s = 0;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['very weak', 'very weak', 'weak', 'fair', 'good', 'strong', 'very strong'];
  return labels[Math.min(s, 6)];
}

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState([]);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErrors([]);
    try {
      await api.register(form);
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setErrors(err.details || [err.message]);
    }
  };

  if (done) {
    return <div className="alert success" role="status">Account created. Redirecting to sign in…</div>;
  }

  return (
    <div className="form-narrow">
      <h1>Create an account</h1>

      {errors.length > 0 && (
        <div className="alert error" role="alert">
          <strong>Could not create your account:</strong>
          <ul>{errors.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
        </div>
      )}

      <form onSubmit={submit}>
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" value={form.fullName} onChange={update('fullName')} required />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={update('email')} required />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={form.password} onChange={update('password')} required />
        {form.password && (
          <p className="muted" style={{ marginTop: '-0.6rem' }}>
            Strength: <strong>{scoreLocal(form.password)}</strong>
          </p>
        )}
        <p className="muted">
          Minimum 12 characters with upper and lower case, a number and a symbol.
        </p>

        <button type="submit">Create account</button>
      </form>

      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </div>
  );
}