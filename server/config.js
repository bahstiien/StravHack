import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {Object} CorosConfig
 * @property {'http'|'sse'|'stdio'} transport
 * @property {string}  [url]      http/sse: the MCP endpoint.
 * @property {string}  [command]  stdio: the executable to spawn.
 * @property {string[]} [args]
 * @property {Record<string,string>} [env]
 * @property {Record<string,string>} [headers]
 * @property {Record<string,string>} [toolOverrides]
 * @property {number}  [lookbackDays]
 */

const DEFAULTS = {
  transport: 'http',
  url: '',
  args: [],
  env: {},
  headers: {},
  toolOverrides: {},
  lookbackDays: 42,
};

/**
 * Read coros.config.json, then let environment variables win — secrets belong
 * in the environment, not in a file that sits in OneDrive.
 *
 * COROS_MCP_URL, COROS_MCP_TRANSPORT, COROS_MCP_COMMAND, COROS_MCP_TOKEN.
 */
export function loadConfig() {
  const path = resolve(ROOT, 'coros.config.json');
  let file = {};
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new Error(`coros.config.json is not valid JSON: ${err.message}`);
    }
  }

  const cfg = { ...DEFAULTS, ...file };

  if (process.env.COROS_MCP_TRANSPORT) cfg.transport = process.env.COROS_MCP_TRANSPORT;
  if (process.env.COROS_MCP_URL) cfg.url = process.env.COROS_MCP_URL;
  if (process.env.COROS_MCP_COMMAND) cfg.command = process.env.COROS_MCP_COMMAND;
  if (process.env.COROS_MCP_ARGS) {
    // JSON array, or a plain space-separated string.
    try {
      const parsed = JSON.parse(process.env.COROS_MCP_ARGS);
      cfg.args = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      cfg.args = process.env.COROS_MCP_ARGS.split(/\s+/).filter(Boolean);
    }
  }
  if (process.env.COROS_MCP_TOKEN) {
    cfg.headers = { ...cfg.headers, authorization: `Bearer ${process.env.COROS_MCP_TOKEN}` };
  }

  // Expand ${VAR} placeholders so the config file can reference the
  // environment without ever holding a secret itself.
  cfg.headers = expand(cfg.headers);
  cfg.env = expand(cfg.env);

  return cfg;
}

function expand(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = String(v).replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
  }
  return out;
}

export function isConfigured(cfg) {
  return Boolean(cfg.transport === 'stdio' ? cfg.command : cfg.url);
}

export { ROOT };
