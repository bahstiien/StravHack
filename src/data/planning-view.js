export const PLANNING_VIEWS = Object.freeze(['week', 'month', 'log']);
export const PLANNING_VIEW_KEY = 'denivele.planning.view';

export function normalizePlanningView(value) {
  return PLANNING_VIEWS.includes(value) ? value : 'week';
}

export function loadPlanningView(storage = globalThis.localStorage) {
  try { return normalizePlanningView(storage?.getItem(PLANNING_VIEW_KEY)); }
  catch { return 'week'; }
}

export function savePlanningView(value, storage = globalThis.localStorage) {
  if (!PLANNING_VIEWS.includes(value)) return false;
  try { storage?.setItem(PLANNING_VIEW_KEY, value); return true; }
  catch { return false; }
}

export function nextPlanningView(current, direction) {
  const index = PLANNING_VIEWS.indexOf(normalizePlanningView(current));
  return PLANNING_VIEWS[(index + direction + PLANNING_VIEWS.length) % PLANNING_VIEWS.length];
}
