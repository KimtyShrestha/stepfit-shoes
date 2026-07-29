import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

import Products from './pages/Products';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import Admin from './pages/Admin';

/**
 * Client-side route guard.
 *
 * This is a usability control, not a security control. It hides UI the
 * user cannot use. Every protected resource is independently enforced
 * by the server, which is what actually prevents access - a user who
 * edits their client state still gets 401 or 403 from the API.
 */
function Protected({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return (
      <div className="container">
        <div className="alert error">You do not have permission to view this page.</div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <nav>
        <Link to="/" className="brand">StepFit Shoes</Link>
        <Link to="/">Shop</Link>
        {user && <Link to="/cart">Cart</Link>}
        {user && <Link to="/orders">Orders</Link>}
        {user && <Link to="/profile">Profile</Link>}
        {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
        <span className="spacer" />
        {user ? (
          <>
            <span className="muted">{user.email}</span>
            <button className="secondary" onClick={handleSignOut}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>

      <main className="container">
        <Routes>
          <Route path="/" element={<Products />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/cart" element={<Protected><Cart /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/admin" element={<Protected role="admin"><Admin /></Protected>} />
        </Routes>
      </main>
    </>
  );
}