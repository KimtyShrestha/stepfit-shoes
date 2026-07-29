const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { query } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();

// Needed so req.ip shows the real client address when running behind
// Docker or a proxy. Rate limiting and audit logs both depend on this.
app.set('trust proxy', 1);

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