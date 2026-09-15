const KEYS = Object.freeze({
  goals: 'denivele.goals.v1',
  equipment: 'denivele.equipment.v1',
  decisions: 'denivele.planning.decisions.v1',
  availability: 'denivele.planning.availability.v1',
  exceptions: 'denivele.planning.exceptions.v1',
  drafts: 'denivele.planning.drafts.v1',
  guidedRun: 'denivele.guided.run.v1',
  history: 'denivele.guided.history.v1',
  checkinHistory: 'denivele.checkin.history.v1',
  checkinDraft: 'denivele.checkin.draft.v1',
});

function read(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}

const unwrapPlanning = (value) => value?.version === 1 ? value.data : value;
const unwrapCheckin = (value) => value?.version === 1 ? value.data : value;

function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value != null;
}

const preferLocalWhenRemoteEmpty = (local, remote) => (
  local !== undefined && !hasContent(remote) ? local : remote
);

export async function importLocalStorageToSupabase({ repository, storage = globalThis.localStorage } = {}) {
  if (!repository) throw new TypeError('Le repository Supabase est requis pour importer les données locales.');

  // Supabase gagne toujours sur une ancienne copie de navigateur. Cela rend
  // l'import one-shot et empêche un appareil ancien d'écraser les changements
  // effectués depuis un autre appareil.
  if (repository.hasUserDocuments && await repository.hasUserDocuments()) {
    return { imported: false, skipped: true, reason: 'Données Supabase déjà présentes.' };
  }

  const goals = read(storage, KEYS.goals);
  const equipment = read(storage, KEYS.equipment);
  const decisions = unwrapPlanning(read(storage, KEYS.decisions));
  const availability = unwrapPlanning(read(storage, KEYS.availability));
  const exceptions = unwrapPlanning(read(storage, KEYS.exceptions));
  const drafts = unwrapPlanning(read(storage, KEYS.drafts));
  const guidedRun = read(storage, KEYS.guidedRun);
  const history = read(storage, KEYS.history);
  const checkinHistory = unwrapCheckin(read(storage, KEYS.checkinHistory));
  const checkinDraft = unwrapCheckin(read(storage, KEYS.checkinDraft));
  const hasSettings = Array.isArray(goals) || Array.isArray(equipment);
  const hasPlanning = decisions !== undefined || availability !== undefined
    || exceptions !== undefined || drafts !== undefined;
  const hasCheckins = checkinHistory !== undefined || checkinDraft !== undefined;

  // Stable document keys make every retry an upsert of the same rows. Local
  // values are deliberately retained as a rollback copy until the UI chooses
  // to offer an explicit cleanup action. If Supabase already has content, it
  // wins: importing a second browser must not roll the account back.
  if (hasSettings) {
    const remote = await repository.loadSettings();
    await repository.saveSettings({
      goals: Array.isArray(goals) ? preferLocalWhenRemoteEmpty(goals, remote.goals) : remote.goals,
      equipment: Array.isArray(equipment) ? preferLocalWhenRemoteEmpty(equipment, remote.equipment) : remote.equipment ?? [],
      loadLevel: remote.loadLevel ?? 4,
    });
  }
  if (hasPlanning) {
    const remote = await repository.loadPlanning();
    await repository.savePlanning({
      decisions: Array.isArray(decisions) ? preferLocalWhenRemoteEmpty(decisions, remote.decisions) : remote.decisions,
      availability: availability && typeof availability === 'object' ? preferLocalWhenRemoteEmpty(availability, remote.availability) : remote.availability,
      exceptions: Array.isArray(exceptions) ? preferLocalWhenRemoteEmpty(exceptions, remote.exceptions) : remote.exceptions,
      drafts: drafts && typeof drafts === 'object' ? preferLocalWhenRemoteEmpty(drafts, remote.drafts) : remote.drafts,
    });
  }
  if (guidedRun?.definition && guidedRun?.state && !hasContent(await repository.loadGuidedRun())) {
    await repository.saveGuidedRun(guidedRun);
  }
  if (Array.isArray(history)) {
    const remote = await repository.loadWorkoutHistory();
    if (!hasContent(remote)) await repository.saveWorkoutHistory(history);
  }
  if (hasCheckins && repository.loadCheckins && repository.saveCheckins) {
    const remote = await repository.loadCheckins();
    await repository.saveCheckins({
      history: checkinHistory && typeof checkinHistory === 'object'
        ? preferLocalWhenRemoteEmpty(checkinHistory, remote.history)
        : remote.history,
      draft: checkinDraft && typeof checkinDraft === 'object'
        ? preferLocalWhenRemoteEmpty(checkinDraft, remote.draft)
        : remote.draft,
    });
  }

  return {
    imported: true,
    settings: hasSettings,
    planning: hasPlanning,
    guidedRun: Boolean(guidedRun?.definition && guidedRun?.state),
    history: Array.isArray(history) ? history.length : 0,
  };
}
