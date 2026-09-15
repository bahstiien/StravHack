#!/usr/bin/env node
// A stand-in Coros MCP server, for testing the bridge without the real one.
//
// It exposes the tool shapes a Coros-style server exposes and answers with
// plausible payloads, so `npm run sync:coros` can be exercised end to end:
//
//   COROS_MCP_TRANSPORT=stdio COROS_MCP_COMMAND=node \
//     node scripts/sync-coros.mjs            (see README § Tester sans Coros)
//
// Deliberately *not* a copy of our own field names — it uses camelCase Coros
// spellings, ms durations and a records-array stream shape, so the normaliser
// is tested on shapes it has to adapt to rather than ones it already matches.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const TOOLS = [
  { name: 'get_athlete_profile', description: 'Athlete profile and device', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_athlete_zones', description: 'Heart rate training zones', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_activities', description: 'List recorded activities in a date range', inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } } },
  { name: 'get_activity_performance', description: 'Detailed metrics and laps for one activity', inputSchema: { type: 'object', properties: { activityId: { type: 'string' } } } },
  { name: 'get_activity_streams', description: 'Per-sample records for one activity', inputSchema: { type: 'object', properties: { activityId: { type: 'string' } } } },
  { name: 'get_training_plan', description: 'Planned workouts on the calendar', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_workout', description: 'Push a structured workout to the watch', inputSchema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' } } } },
];

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19);
};

const ACTIVITIES = [
  { labelId: '901', name: 'Seuil 3 × 12′', sportType: 'trail_run', startTime: day(6), totalTime: 4702000, distance: 16400, totalAscent: 420, avgHeartRate: 156, maxHeartRate: 176, locationName: 'Boucle du lac' },
  { labelId: '902', name: 'VMA côte 10 × 45″', sportType: 'trail_run', startTime: day(4), totalTime: 4324000, distance: 13200, totalAscent: 680, avgHeartRate: 148, maxHeartRate: 182, locationName: 'Col de Porte' },
  { labelId: '903', name: 'Sortie longue', sportType: 'trail_run', startTime: day(1), totalTime: 9670000, distance: 24800, totalAscent: 1320, avgHeartRate: 132, maxHeartRate: 152, locationName: 'Charmant Som' },
];

const LAPS = {
  901: [
    { name: 'Bloc 1', totalTime: 720000, distance: 2857, avgHeartRate: 164 },
    { name: 'Bloc 2', totalTime: 720000, distance: 2800, avgHeartRate: 169 },
    { name: 'Bloc 3', totalTime: 720000, distance: 2735, avgHeartRate: 174 },
  ],
  902: [
    { name: 'R1–R3', totalTime: 45000, distance: 124, avgHeartRate: 171 },
    { name: 'R4–R6', totalTime: 45000, distance: 123, avgHeartRate: 176 },
    { name: 'R7–R8', totalTime: 45000, distance: 120, avgHeartRate: 179 },
    { name: 'R9–R10', totalTime: 45000, distance: 116, avgHeartRate: 182 },
  ],
  903: [
    { name: 'Montée', totalTime: 2300000, distance: 6350, avgHeartRate: 128 },
    { name: 'Crête', totalTime: 2710000, distance: 6860, avgHeartRate: 131 },
    { name: 'Descente', totalTime: 1680000, distance: 5380, avgHeartRate: 136 },
  ],
};

function records(id) {
  // Shape C: an array of per-sample objects, ms timestamps.
  const n = 600;
  const base = id === '903' ? 128 : id === '902' ? 140 : 150;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = i / n;
    out.push({
      t: i * 10000,
      heartRate: Math.round(base + p * 9 + Math.sin(i / 7) * (id === '902' ? 16 : 5)),
      altitude: Math.round(600 + Math.sin(p * Math.PI) * (id === '903' ? 720 : 300)),
    });
  }
  return out;
}

const server = new Server({ name: 'mock-coros', version: '0.0.1' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const id = String(args.activityId ?? args.activity_id ?? args.id ?? '');

  const data = {
    get_athlete_profile: () => ({ firstName: 'Bastien', maxHeartRate: 188, restHeartRate: 48, weight: 73, deviceName: 'COROS APEX 2 PRO' }),
    get_athlete_zones: () => ({ heartRate: [{ max: 128 }, { max: 145 }, { max: 160 }, { max: 172 }, { max: 188 }] }),
    list_activities: () => ({ activities: ACTIVITIES }),
    get_activity_performance: () => ({
      labelId: id,
      laps: LAPS[id] || [],
      zones: [
        { time: 564 }, { time: 1222 }, { time: 752 }, { time: 1974 }, { time: 190 },
      ],
    }),
    get_activity_streams: () => ({ records: records(id) }),
    create_workout: () => ({ accepted: true, workoutId: 'w-' + Math.random().toString(36).slice(2, 8), syncsAt: 'next watch sync' }),
    get_training_plan: () => ({
      workouts: [
        { id: 'p1', name: 'Gainage + proprioception', sportType: 'strength', date: day(-1), duration: 1800000 },
        { id: 'p2', name: 'Sortie longue 2h30', sportType: 'trail_run', date: day(-2), duration: 9000000, plannedAscent: 1400, targetZone: 'Z2' },
      ],
    }),
  }[name];

  if (!data) {
    return { isError: true, content: [{ type: 'text', text: `unknown tool ${name}` }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(data()) }] };
});

await server.connect(new StdioServerTransport());
