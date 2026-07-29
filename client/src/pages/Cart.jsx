import { useEffect, useState } from 'react';
import { api } from '../api';

const money = (cents) => `£${(cents / 100).toFixed(2)}`;

export default function Cart() {
  const [cart, setCart] = useState({ items: [], totalCents: 0 });
  const [address, setAddress] = useState('');
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);

  const load = async () => {
    try { setCart(await api.cart()); } catch (err) { setError(err.message); }
  };

  useEffect(() => { load(); }, []);

  const remove = async (productId) => {
    try { setCart(await api.removeFromCart(productId)); } catch (err) { setError(err.message); }
  };

  const checkout = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      // Only the address is sent. The order total is calculated by the
      // server from current catalogue prices.
      const res = await api.checkout(address);
      setPlaced(res.order);
      setCart({ items: [], totalCents: 0 });
    } catch (err) {
      setError(err.message);
    }
  };

  if (placed) {
    return (
      <div className="alert success" role="status">
        <strong>Order #{placed.id} placed.</strong>
        <p>Total charged: {money(placed.totalCents)} — status {placed.status}</p>
      </div>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      {error && <div className="alert error" role="alert">{error}</div>}

      {cart.items.length === 0 ? (
        <p className="muted">Your cart is empty.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Line total</th><th /></tr>
            </thead>
            <tbody>
              {cart.items.map((i) => (
                <tr key={i.productId}>
                  <td>{i.name} <span className="badge">{i.brand}</span></td>
                  <td>{money(i.unitPriceCents)}</td>
                  <td>{i.quantity}</td>
                  <td>{money(i.lineTotalCents)}</td>
                  <td><button className="danger" onClick={() => remove(i.productId)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ marginTop: '1.5rem' }}>Total: {money(cart.totalCents)}</h2>

          <form onSubmit={checkout} className="card form-narrow" style={{ marginTop: '1rem' }}>
            <label htmlFor="address">Shipping address</label>
            <textarea id="address" rows={3} value={address}
                      onChange={(e) => setAddress(e.target.value)} required minLength={10} />
            <button type="submit">Place order (simulated payment)</button>
          </form>
        </>
      )}
    </>
  );
}