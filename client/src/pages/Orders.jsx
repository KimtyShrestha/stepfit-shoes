import { useEffect, useState } from 'react';
import { api } from '../api';

const money = (cents) => `£${(cents / 100).toFixed(2)}`;

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.orders().then((d) => setOrders(d.orders)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Order history</h1>
      {error && <div className="alert error" role="alert">{error}</div>}
      {orders.length === 0 ? (
        <p className="muted">You have not placed any orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Order</th><th>Placed</th><th>Total</th><th>Status</th><th>Reference</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td>{new Date(o.created_at).toLocaleString()}</td>
                <td>{money(o.total_cents)}</td>
                <td><span className="badge">{o.status}</span></td>
                <td className="muted">{o.payment_ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}