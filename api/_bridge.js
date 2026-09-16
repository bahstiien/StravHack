import { createApi } from '../server/app.js';

let api = null;

function getApi() {
  if (!api) api = createApi();
  return api;
}

export default async function handleVercelApi(req, res) {
  try {
    const handled = await getApi().handle(req, res);
    if (!handled && !res.writableEnded) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('Vercel Coros bridge failed', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Service Coros temporairement indisponible.' }));
    }
  }
}

export { handleVercelApi };
