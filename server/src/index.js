const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { query } = require('./db');
const authRoutes = require('./routes/auth');
const helmet = require('helmet');
const { globalLimiter } = require('./middleware/rateLimit');
const app = express();
const mfaRoutes = require('./routes/mfa');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');

// Needed so req.ip shows the real client address when running behind
// Docker or a proxy. Rate limiting and audit logs both depend on this.
app.set('trust proxy', 1);
// Security response headers. Must come before any route.
app.use(
  helmet({
    // This API returns only JSON, never HTML, so a restrictive policy
    // costs nothing. It limits the damage if a response is ever
    // rendered in a browser context.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Allows the React dev server on a different port to read responses.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Force HTTPS for a year once deployed.
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(globalLimiter);

// Cap incoming request size. Without a limit, one huge POST request
// can exhaust server memory - a trivial denial-of-service.
app.use(express.json({ limit: '10kb' }));

app.use(cookieParser(process.env.COOKIE_SECRET));

// Only our own frontend may call this API.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  })
);

// Health check - confirms the server is up AND the database is reachable.

app.use('/api/auth', authRoutes);
app.use('/api/auth/mfa', mfaRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.get('/api/health', async (req, res) => {
  try {
    const result = await query('SELECT NOW() AS server_time');
    res.json({
      status: 'ok',
      database: 'connected',
      time: result.rows[0].server_time,
    });
  } catch (err) {
    // Full detail to the server console, generic message to the client.
    console.error('[health] database check failed:', err.message);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// Anything not matched above.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`StepFit API listening on http://localhost:${PORT}`);
});