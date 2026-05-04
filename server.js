/**
 * server.js
 *
 * Entry point for the md-renderer API server.
 *
 * Responsibilities:
 *  - Bootstrap Express with compression middleware
 *  - Mount the render router
 *  - Attach a global 404 and 500 handler
 *  - Bind to PORT (env or 3000)
 *  - Graceful shutdown on SIGTERM / SIGINT
 *
 * Usage:
 *   node server.js
 *   PORT=8080 node server.js
 */

'use strict';

const express     = require('express');
const compression = require('compression');

const renderRouter = require('./routes/render');

// ─────────────────────────────────────────────────────────────────────────────
// App configuration
// ─────────────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();

// ── Gzip/Brotli compression for all text responses ───────────────────────────
// Significantly reduces payload on large Markdown docs rendered to HTML.
app.use(
  compression({
    // Only compress responses > 1 KB (pointless below that)
    threshold: 1024,
    // Compression level 6: good balance of speed vs ratio on low-end CPUs
    level: 6,
    // Compress HTML, JSON, CSS, plain-text
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

// ── Remove the "X-Powered-By: Express" fingerprint header ────────────────────
app.disable('x-powered-by');

// ── Trust proxy headers if running behind nginx / Caddy / Fly / Vercel ──────
app.set('trust proxy', 1);

// ── Security headers applied to every response ───────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Prevent browsers from MIME-sniffing the response
  res.setHeader('X-Download-Options', 'noopen');
  next();
});

// ── Reject unexpectedly large request bodies early ───────────────────────────
// (We only handle GET requests; POST bodies should not exist.)
app.use(express.json({ limit: '4kb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use('/', renderRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 404 fallback — any path not matched above
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  const { renderErrorPage } = require('./services/renderer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(
    renderErrorPage(404, `Route "${req.path}" does not exist on this server.`)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler — catches any unhandled Express errors
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Log the full stack in development; suppress in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('[UNHANDLED ERROR]', err);
  } else {
    console.error('[UNHANDLED ERROR]', err.message);
  }

  const { renderErrorPage } = require('./services/renderer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(500).send(
    renderErrorPage(500, 'An unexpected internal error occurred. Please try again.')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Start listening
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n  md-renderer running`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/?md=<github_raw_url>&theme=<theme>`);
  console.log(`  → http://localhost:${PORT}/health\n`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n  Received ${signal}. Shutting down gracefully…`);
  server.close(() => {
    console.log('  HTTP server closed. Goodbye.\n');
    process.exit(0);
  });

  // Force-exit if shutdown takes more than 5 seconds
  setTimeout(() => {
    console.error('  Forced exit after timeout.');
    process.exit(1);
  }, 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections so the process doesn't silently die
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

module.exports = app; // export for testing