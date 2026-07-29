const BASE_URL = 'http://localhost:4000/api';

/**
 * Wrapper around fetch for all API calls.
 *
 * credentials: 'include' is essential - it tells the browser to send
 * the httpOnly session cookie. Because the cookie is httpOnly, this
 * code cannot read the token, which is exactly the point: a successful
 * XSS attack still cannot exfiltrate the session.
 */
async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Empty or non-JSON body.
  }

  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed.');
    error.status = response.status;
    error.details = data?.details || null;
    error.mfaRequired = data?.mfaRequired || false;
    throw error;
  }

  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  mfaChallenge: (code) => request('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code }) }),
  mfaSetup: () => request('/auth/mfa/setup', { method: 'POST' }),
  mfaVerifySetup: (code) => request('/auth/mfa/verify-setup', { method: 'POST', body: JSON.stringify({ code }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  products: (search = '') => request(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  product: (id) => request(`/products/${id}`),

  cart: () => request('/cart'),
  addToCart: (productId, quantity = 1) =>
    request('/cart', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  removeFromCart: (productId) => request(`/cart/${productId}`, { method: 'DELETE' }),

  checkout: (shippingAddress) =>
    request('/orders/checkout', { method: 'POST', body: JSON.stringify({ shippingAddress }) }),
  orders: () => request('/orders'),

  adminUsers: () => request('/admin/users'),
  adminOrders: () => request('/admin/orders'),
  adminLogs: () => request('/admin/logs'),
  captcha: () => request('/auth/captcha'),
};