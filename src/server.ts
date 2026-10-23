// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { loadConfig } from './config/config.js';
import app from './index.js';

const config = loadConfig();
const host = config.host;
const port = config.port;

const server = app.listen(port, host, () => {
  console.log(`[TorrGate] Server running at http://${host}:${port}/api/v2.0/indexers`);
  console.log(`[TorrGate] Interactive API documentation at http://${host}:${port}/docs`);
});

const shutdown = (): void => {
  console.log('\n[TorrGate] Stopping local server...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
