import { useEffect, useState } from 'react';
import { api } from '../api';

const money = (cents) => `£${(cents / 100).toFixed(2)}`;

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [data, setData] = useState({ users: [], orders: [], logs: [] });
  const [error, setError] = useState(null);

  useEffect(() => {
    const loaders = { users: api.adminUsers, orders: api.adminOrders, logs: api.adminLogs };
    loaders[tab]()
      .then((d) => setData((prev) => ({ ...prev, ...d })))
      .catch((e) => setError(e.message));
  }, [tab]);

  return (
    <>
      <h1>Administration</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className={tab === 'users' ? '' : 'secondary'} onClick={() => setTab('users')}>Users</button>
        <button className={tab === 'orders' ? '' : 'secondary'} onClick={() => setTab('orders')}>Orders</button>
        <button className={tab === 'logs' ? '' : 'secondary'} onClick={() => setTab('logs')}>Activity log</button>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}

      {tab === 'users' && (
        <table>
          <thead><tr><th>ID</th><th>Email</th><th>Role</th><th>MFA</th><th>Failed logins</th></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td><td>{u.email}</td>
                <td><span className="badge">{u.role}</span></td>
                <td>{u.mfa_enabled ? 'Yes' : 'No'}</td>
                <td>{u.failed_login_attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'orders' && (
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td><td>{o.email}</td>
                <td>{money(o.total_cents)}</td>
                <td><span className="badge">{o.status}</span></td>
                <td>{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'logs' && (
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Status</th><th>IP</th></tr></thead>
          <tbody>
            {data.logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{l.user_id ?? '—'}</td>
                <td>{l.action}</td>
                <td><span className="badge">{l.status}</span></td>
                <td className="muted">{l.ip_address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}