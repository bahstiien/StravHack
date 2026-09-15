import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Mount the Coros bridge on the dev server itself.
 *
 * MCP is a server-side protocol, so the API has to live in Node — but it does
 * not have to live in a *second* Node. Running it here means `npm run dev` is
 * the whole setup: one process, no proxy, and no ECONNREFUSED stack traces in
 * the terminal when a bridge you never started isn't listening.
 */
function corosBridge() {
  return {
    name: 'coros-bridge',
    apply: 'serve',
    async configureServer(server) {
      // Only server/app.js — server/index.js starts a listener on import.
      const { createApi } = await import('./server/app.js');
      const api = createApi();

      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await api.handle(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });

      server.httpServer?.once('listening', () => {
        if (!api.configured) {
          server.config.logger.info(
            '  [2mcoros[22m   non configuré — données de démo (README.md § Connecter Coros)',
          );
          return;
        }
        api.coros.connect().then(
          () => {
            const d = api.coros.describe();
            const missing = d.missing.length ? ` · absents : ${d.missing.join(', ')}` : '';
            server.config.logger.info(
              `  [32mcoros[39m   connecté (${d.transport}) — ${d.toolCount} outils${missing}`,
            );
          },
          (err) => server.config.logger.warn(`  coros   connexion impossible : ${err.message}`),
        );
      });

      server.httpServer?.once('close', () => { api.close(); });
    },
  };
}

export default defineConfig({
  plugins: [react(), corosBridge()],
  server: { port: 5173 },
});
