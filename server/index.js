// Standalone bridge, for production or for running the API on its own port.
//
// In development you do not need this: `npm run dev` mounts the same API on
// the Vite server (see vite.config.js), so there is one process and no proxy.

import { createServer } from 'node:http';
import { createApi } from './app.js';

const PORT = Number(process.env.PORT || 8787);
const api = createApi();

const server = createServer(async (req, res) => {
  const handled = await api.handle(req, res);
  if (!handled) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[denivele] bridge sur http://localhost:${PORT}`);
  logCorosStatus(api);
});

export function logCorosStatus({ configured, coros }) {
  if (!configured) {
    console.log('[denivele] Coros MCP non configuré — l’app tourne sur les données de démo.');
    console.log('[denivele] Renseigne coros.config.json ou COROS_MCP_URL. Voir README.md.');
    return;
  }
  coros.connect().then(
    () => {
      const d = coros.describe();
      console.log(`[denivele] Coros connecté (${d.transport}) — ${d.toolCount} outils`);
      for (const [cap, tool] of Object.entries(d.resolved)) {
        console.log(`  ${tool ? '✓' : '✗'} ${cap.padEnd(15)} ${tool || '(aucun outil correspondant)'}`);
      }
    },
    (err) => console.log(`[denivele] connexion Coros impossible : ${err.message}`),
  );
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await api.close(); server.close(() => process.exit(0)); });
}
