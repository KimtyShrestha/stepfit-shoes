import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const money = (cents) => `£${(cents / 100).toFixed(2)}`;

/**
 * Allow-lists acceptable image sources.
 *
 * Same-origin paths are permitted. Absolute URLs must use http or https,
 * which blocks javascript:, data: and vbscript: schemes from reaching
 * the src attribute. Allow-listing is used rather than blocking known-bad
 * schemes, since a blocklist is always incomplete.
 */
function safeImageUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;

  // Same-origin relative path: safe, and cannot carry a scheme.
  // The '//' check rejects protocol-relative URLs such as //evil.test.
  if (url.startsWith('/') && !url.startsWith('//')) return url;

  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const load = async (term = '') => {
    try {
      const data = await api.products(term);
      setProducts(data.products);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(search);
  };

  const addToCart = async (id, name) => {
    try {
      await api.addToCart(id, 1);
      setMessage(`${name} added to your cart.`);
      setError(null);
    } catch (err) {
      setError(err.message);
      setMessage(null);
    }
  };

  return (
    <>
      <h1>Shop</h1>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', maxWidth: 480 }}>
        <label htmlFor="search" className="sr-only" style={{ display: 'none' }}>Search products</label>
        <input
          id="search"
          type="text"
          placeholder="Search by name or brand"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        <button type="submit">Search</button>
      </form>

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="grid" style={{ marginTop: '1rem' }}>
        {products.map((p) => {
          const img = safeImageUrl(p.image_url);
          return (
            <article key={p.id} className="card">
              {img
                ? <img className="product-image" src={img} alt={`${p.brand} ${p.name}`} />
                : <div className="product-image" role="img" aria-label="No image available" />}
              <h2 style={{ fontSize: '1rem', margin: '0.75rem 0 0.25rem' }}>{p.name}</h2>
              <p className="muted" style={{ margin: 0 }}>{p.brand}</p>
              <p style={{ margin: '0.5rem 0' }}>{p.description}</p>
              <p style={{ fontWeight: 700 }}>{money(p.price_cents)}</p>
              <p className="muted">{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</p>
              {user ? (
                <button onClick={() => addToCart(p.id, p.name)} disabled={p.stock < 1}>
                  Add to cart
                </button>
              ) : (
                <p className="muted">Sign in to purchase</p>
              )}
            </article>
          );
        })}
      </div>
      {products.length === 0 && <p className="muted">No products found.</p>}
    </>
  );
}