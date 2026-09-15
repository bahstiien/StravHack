// Capability -> tool-name resolution.
//
// The app needs six things from Coros. Each capability lists the tool names
// we have seen used for it, plus the keywords a fuzzy match scores against.
// When your Coros MCP server is connected, `GET /api/health` prints both the
// tools it actually advertises and what each capability resolved to — if a
// capability resolved to null or to the wrong tool, pin it in
// coros.config.json under "toolOverrides" and nothing else has to change.

export const CAPABILITIES = {
  athlete: {
    what: 'Athlete profile: name, HR max/rest, weight, device.',
    aliases: ['get_athlete_profile', 'get_user_profile', 'athlete_profile', 'get_profile', 'user_info', 'me'],
    keywords: ['athlete', 'profile', 'user', 'account'],
  },
  zones: {
    what: 'Heart-rate / pace zone boundaries.',
    aliases: ['get_athlete_zones', 'get_zones', 'training_zones', 'get_heart_rate_zones'],
    keywords: ['zone', 'threshold', 'heart', 'hr'],
  },
  activities: {
    what: 'List of recorded activities over a date range.',
    aliases: ['list_activities', 'get_activities', 'query_activities', 'activity_list', 'search_activities'],
    keywords: ['activit', 'workout', 'session', 'list', 'history'],
  },
  activityDetail: {
    what: 'One activity in full: splits/laps, zone distribution, summary metrics.',
    aliases: ['get_activity', 'get_activity_detail', 'get_activity_performance', 'activity_detail', 'get_workout_detail'],
    keywords: ['activit', 'detail', 'performance', 'summary', 'lap', 'split'],
  },
  streams: {
    what: 'Per-sample series for one activity: heart rate, altitude, pace.',
    aliases: ['get_activity_streams', 'get_streams', 'get_activity_samples', 'activity_records', 'get_datapoints'],
    keywords: ['stream', 'sample', 'record', 'series', 'datapoint', 'track'],
  },
  plan: {
    what: 'Planned/scheduled workouts pushed to the watch.',
    aliases: ['get_training_plan', 'list_planned_workouts', 'get_calendar', 'get_schedule', 'training_plan'],
    keywords: ['plan', 'schedul', 'calendar', 'planned', 'upcoming'],
  },
  pushWorkout: {
    what: 'Send a structured workout to the watch.',
    aliases: ['create_workout', 'push_workout', 'upload_workout', 'schedule_workout', 'send_to_device'],
    keywords: ['create', 'push', 'upload', 'send', 'schedule', 'workout'],
  },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

/**
 * Pick the tool that best serves a capability.
 *
 * Exact alias match wins outright. Otherwise score each tool on how many of
 * the capability's keywords appear in its name (weighted) and description
 * (lighter), and take the best — but only if it clears a floor, so an
 * unrelated server resolves to null instead of to nonsense.
 *
 * @param {keyof CAPABILITIES} capability
 * @param {{name:string, description?:string}[]} tools
 * @returns {string|null}
 */
export function resolveCapability(capability, tools) {
  const spec = CAPABILITIES[capability];
  if (!spec || !tools?.length) return null;

  const byName = new Map(tools.map((t) => [norm(t.name), t.name]));
  for (const alias of spec.aliases) {
    const hit = byName.get(norm(alias));
    if (hit) return hit;
  }

  let best = null;
  let bestScore = 0;
  for (const tool of tools) {
    const name = norm(tool.name);
    const desc = String(tool.description || '').toLowerCase();
    let score = 0;
    for (const kw of spec.keywords) {
      if (name.includes(kw)) score += 3;
      else if (desc.includes(kw)) score += 1;
    }
    // A tool whose name merely mentions the domain is a weak candidate;
    // require at least one strong (name-level) hit.
    if (score > bestScore) { bestScore = score; best = tool.name; }
  }

  return bestScore >= 3 ? best : null;
}
