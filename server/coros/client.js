// MCP client for the Coros server.
//
// MCP is a server-side protocol — a browser cannot speak it — so this module is
// the only thing in the project that talks to Coros, and it runs in Node.
//
// The exact tool names a Coros MCP server exposes are not something we can know
// ahead of time, and guessing them would produce a bridge that fails silently
// against a slightly different server. So instead of hard-coding names we
// *discover* them: connect, call tools/list, and resolve each capability we
// need against the advertised list (exact match, then the aliases in
// toolmap.js, then a scored fuzzy match). `coros.config.json` can pin any
// capability to an exact tool name when discovery picks wrong.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { CAPABILITIES, resolveCapability } from './toolmap.js';

/** @typedef {{name:string, description?:string, inputSchema?:object}} McpTool */

export class CorosClient {
  /** @param {import('../config.js').CorosConfig} config */
  constructor(config) {
    this.config = config;
    /** @type {Client|null} */
    this.client = null;
    /** @type {McpTool[]} */
    this.tools = [];
    /** @type {Record<string, string|null>} */
    this.resolved = {};
    this.connectedAt = null;
    this._connecting = null;
  }

  get connected() {
    return this.client !== null;
  }

  /** Connect once; concurrent callers share the same in-flight attempt. */
  async connect() {
    if (this.client) return this;
    if (this._connecting) return this._connecting;
    this._connecting = this._doConnect().finally(() => { this._connecting = null; });
    return this._connecting;
  }

  async _doConnect() {
    const transport = this._buildTransport();
    const client = new Client(
      { name: 'denivele-bridge', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
    this.client = client;

    const listed = await client.listTools();
    this.tools = listed.tools || [];

    // Resolve every capability the app needs against what this server offers.
    for (const cap of Object.keys(CAPABILITIES)) {
      const pinned = this.config.toolOverrides?.[cap];
      if (pinned) {
        this.resolved[cap] = this.tools.some((t) => t.name === pinned) ? pinned : null;
      } else {
        this.resolved[cap] = resolveCapability(cap, this.tools);
      }
    }

    this.connectedAt = new Date().toISOString();
    return this;
  }

  _buildTransport() {
    const { transport, url, command, args, env, headers } = this.config;

    if (transport === 'stdio') {
      if (!command) throw new Error('coros.config.json: "command" is required for stdio transport');
      return new StdioClientTransport({
        command,
        args: args || [],
        env: { ...process.env, ...(env || {}) },
      });
    }

    if (!url) throw new Error(`coros.config.json: "url" is required for ${transport} transport`);
    const requestInit = headers && Object.keys(headers).length ? { headers } : undefined;

    if (transport === 'sse') {
      return new SSEClientTransport(new URL(url), { requestInit });
    }
    return new StreamableHTTPClientTransport(new URL(url), { requestInit });
  }

  /**
   * Call a capability by its logical name. Returns null when the connected
   * server does not offer it — a missing capability degrades the screen that
   * needs it rather than failing the whole snapshot.
   *
   * @param {keyof typeof CAPABILITIES} capability
   * @param {object} args
   */
  async call(capability, args = {}) {
    await this.connect();
    const tool = this.resolved[capability];
    if (!tool) return null;

    const result = await this.client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      const text = (result.content || []).map((c) => c.text).filter(Boolean).join(' ');
      throw new Error(`${tool}: ${text || 'tool reported an error'}`);
    }
    return unwrap(result);
  }

  /** What we connected to and what we found — surfaced at /api/health. */
  describe() {
    return {
      connected: this.connected,
      connectedAt: this.connectedAt,
      transport: this.config.transport,
      target: this.config.url || this.config.command || null,
      toolCount: this.tools.length,
      tools: this.tools.map((t) => t.name),
      resolved: this.resolved,
      missing: Object.keys(CAPABILITIES).filter((c) => !this.resolved[c]),
    };
  }

  async close() {
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
  }
}

/**
 * Pull structured data out of an MCP tool result.
 *
 * Servers answer in one of three shapes: `structuredContent` (preferred),
 * a text block holding JSON, or plain prose. Return whatever we can parse,
 * and fall back to the raw text so a normaliser can still look at it.
 */
export function unwrap(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent;

  const blocks = result?.content || [];
  const texts = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
  if (!texts.length) return null;

  const joined = texts.join('\n').trim();
  try {
    return JSON.parse(joined);
  } catch {
    // Some servers wrap JSON in a fenced code block.
    const fenced = joined.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
    }
    return { text: joined };
  }
}
