const TABLE = 'user_documents';
const VERSION = 1;

export const DOCUMENT_TYPES = Object.freeze({
  goals: 'goals',
  equipment: 'equipment',
  planningDecisions: 'planning_decisions',
  planningAvailability: 'planning_availability',
  planningExceptions: 'planning_exceptions',
  planningDrafts: 'planning_drafts',
  guidedRun: 'guided_run',
  workoutHistory: 'workout_history',
  checkinHistory: 'checkin_history',
  checkinDraft: 'checkin_draft',
  workoutFeedback: 'workout_feedback',
  trainingLoadLevel: 'training_load_level',
  reminderPreferences: 'reminder_preferences',
});

const clone = (value) => value == null ? value : structuredClone(value);

export const REMINDER_PREFERENCES_DEFAULTS = Object.freeze({
  enabled: true,
  preferredTime: '08:00',
  beforeSessionMinutes: 60,
  dailyCheckin: true,
  planningAlerts: true,
  recoveryAlerts: true,
  goalReminders: true,
  quietDays: Object.freeze([]),
});

const validTime = (value) => typeof value === 'string'
  && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeReminderPreferences(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const booleanValue = (key) => typeof source[key] === 'boolean'
    ? source[key]
    : REMINDER_PREFERENCES_DEFAULTS[key];
  const validQuietDays = new Set(['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']);
  const quietDays = Array.isArray(source.quietDays)
    ? [...new Set(source.quietDays.filter((day) => validQuietDays.has(day)))]
    : [...REMINDER_PREFERENCES_DEFAULTS.quietDays];

  return Object.freeze({
    enabled: booleanValue('enabled'),
    preferredTime: validTime(source.preferredTime)
      ? source.preferredTime
      : REMINDER_PREFERENCES_DEFAULTS.preferredTime,
    beforeSessionMinutes: Number.isInteger(source.beforeSessionMinutes)
      && source.beforeSessionMinutes >= 0 && source.beforeSessionMinutes <= 1440
      ? source.beforeSessionMinutes
      : REMINDER_PREFERENCES_DEFAULTS.beforeSessionMinutes,
    dailyCheckin: booleanValue('dailyCheckin'),
    planningAlerts: booleanValue('planningAlerts'),
    recoveryAlerts: booleanValue('recoveryAlerts'),
    goalReminders: booleanValue('goalReminders'),
    quietDays: Object.freeze(quietDays),
  });
}

export class DataStoreError extends Error {
  constructor(operation, cause) {
    const detail = cause?.message || String(cause || 'erreur inconnue');
    super(`Supabase — ${operation} impossible : ${detail}`);
    this.name = 'DataStoreError';
    this.operation = operation;
    this.code = cause?.code;
    this.cause = cause;
  }
}

function assertClient(client) {
  if (!client?.auth?.getUser || !client?.from) {
    throw new TypeError('Un client Supabase valide est requis.');
  }
}

export function createSupabaseDataRepository(client, { now = () => new Date().toISOString() } = {}) {
  assertClient(client);

  async function userId(operation) {
    let result;
    try { result = await client.auth.getUser(); } catch (error) { throw new DataStoreError(operation, error); }
    if (result?.error) throw new DataStoreError(operation, result.error);
    if (!result?.data?.user?.id) throw new DataStoreError(operation, new Error('utilisateur non authentifié'));
    return result.data.user.id;
  }

  async function loadDocument(documentType, operation) {
    const id = await userId(operation);
    let result;
    try {
      result = await client.from(TABLE).select('payload').eq('user_id', id)
        .eq('document_type', documentType).maybeSingle();
    } catch (error) { throw new DataStoreError(operation, error); }
    if (result?.error) throw new DataStoreError(operation, result.error);
    return clone(result?.data?.payload ?? null);
  }

  async function saveDocument(documentType, payload, operation) {
    if (payload === undefined) throw new DataStoreError(operation, new Error('contenu manquant'));
    const id = await userId(operation);
    const record = {
      user_id: id,
      document_type: documentType,
      payload: clone(payload),
      schema_version: VERSION,
      updated_at: now(),
    };
    let result;
    try { result = await client.from(TABLE).upsert(record, { onConflict: 'user_id,document_type' }); }
    catch (error) { throw new DataStoreError(operation, error); }
    if (result?.error) throw new DataStoreError(operation, result.error);
    return clone(payload);
  }

  async function deleteDocument(documentType, operation) {
    const id = await userId(operation);
    let result;
    try {
      result = await client.from(TABLE).delete().eq('user_id', id).eq('document_type', documentType);
    } catch (error) { throw new DataStoreError(operation, error); }
    if (result?.error) throw new DataStoreError(operation, result.error);
  }

  return Object.freeze({
    async hasUserDocuments() {
      const id = await userId('hasUserDocuments');
      const result = await client.from(TABLE).select('document_type')
        .eq('user_id', id).limit(1);
      if (result.error) throw new DataStoreError('hasUserDocuments', result.error);
      return (result.data || []).length > 0;
    },
    async loadCatalogs() {
      const result = await client.from('shared_catalogs').select('catalog_type,payload');
      if (result.error) throw new DataStoreError('loadCatalogs', result.error);
      return Object.fromEntries((result.data || []).map((row) => [row.catalog_type, clone(row.payload)]));
    },
    async loadLatestSnapshot() {
      const id = await userId('loadLatestSnapshot');
      const result = await client.from('athlete_snapshots').select('payload')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw new DataStoreError('loadLatestSnapshot', result.error);
      return clone(result.data?.payload ?? null);
    },
    async saveSnapshot(payload, source = 'legacy') {
      const id = await userId('saveSnapshot');
      const result = await client.from('athlete_snapshots').insert({
        user_id: id, source, payload: clone(payload),
        source_fetched_at: payload?.meta?.fetchedAt ?? null,
      });
      if (result.error) throw new DataStoreError('saveSnapshot', result.error);
      return clone(payload);
    },
    async loadSettings() {
      const [goals, equipment, loadLevel] = await Promise.all([
        loadDocument(DOCUMENT_TYPES.goals, 'loadSettings'),
        loadDocument(DOCUMENT_TYPES.equipment, 'loadSettings'),
        loadDocument(DOCUMENT_TYPES.trainingLoadLevel, 'loadSettings'),
      ]);
      return { goals: goals ?? [], equipment: equipment ?? null, loadLevel: loadLevel ?? 4 };
    },
    async saveSettings(settings) {
      if (!settings || typeof settings !== 'object') throw new DataStoreError('saveSettings', new Error('réglages invalides'));
      await saveDocument(DOCUMENT_TYPES.goals, settings.goals ?? [], 'saveSettings');
      await saveDocument(DOCUMENT_TYPES.equipment, settings.equipment ?? [], 'saveSettings');
      await saveDocument(DOCUMENT_TYPES.trainingLoadLevel, settings.loadLevel ?? 4, 'saveSettings');
      return clone(settings);
    },
    async loadReminderPreferences() {
      const stored = await loadDocument(DOCUMENT_TYPES.reminderPreferences, 'loadReminderPreferences');
      return clone(normalizeReminderPreferences(stored ?? {}));
    },
    async saveReminderPreferences(preferences) {
      if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
        throw new DataStoreError('saveReminderPreferences', new Error('préférences de rappels invalides'));
      }
      const normalized = normalizeReminderPreferences(preferences);
      await saveDocument(
        DOCUMENT_TYPES.reminderPreferences,
        normalized,
        'saveReminderPreferences',
      );
      return clone(normalized);
    },
    async loadPlanning() {
      const [decisions, availability, exceptions, drafts] = await Promise.all([
        loadDocument(DOCUMENT_TYPES.planningDecisions, 'loadPlanning'),
        loadDocument(DOCUMENT_TYPES.planningAvailability, 'loadPlanning'),
        loadDocument(DOCUMENT_TYPES.planningExceptions, 'loadPlanning'),
        loadDocument(DOCUMENT_TYPES.planningDrafts, 'loadPlanning'),
      ]);
      return { decisions: decisions ?? [], availability: availability ?? {}, exceptions: exceptions ?? [], drafts: drafts ?? {} };
    },
    async savePlanning(planning) {
      if (!planning || typeof planning !== 'object') throw new DataStoreError('savePlanning', new Error('planning invalide'));
      await saveDocument(DOCUMENT_TYPES.planningDecisions, planning.decisions ?? [], 'savePlanning');
      await saveDocument(DOCUMENT_TYPES.planningAvailability, planning.availability ?? {}, 'savePlanning');
      await saveDocument(DOCUMENT_TYPES.planningExceptions, planning.exceptions ?? [], 'savePlanning');
      await saveDocument(DOCUMENT_TYPES.planningDrafts, planning.drafts ?? {}, 'savePlanning');
      return clone(planning);
    },
    loadGuidedRun: () => loadDocument(DOCUMENT_TYPES.guidedRun, 'loadGuidedRun'),
    saveGuidedRun: (run) => saveDocument(DOCUMENT_TYPES.guidedRun, run, 'saveGuidedRun'),
    clearGuidedRun: () => deleteDocument(DOCUMENT_TYPES.guidedRun, 'clearGuidedRun'),
    async loadWorkoutHistory() {
      return (await loadDocument(DOCUMENT_TYPES.workoutHistory, 'loadWorkoutHistory')) ?? [];
    },
    async saveWorkoutHistory(history) {
      if (!Array.isArray(history)) throw new DataStoreError('saveWorkoutHistory', new Error('historique invalide'));
      return saveDocument(DOCUMENT_TYPES.workoutHistory, history, 'saveWorkoutHistory');
    },
    async appendWorkoutResult(result, maximum = 50) {
      if (!result?.id) throw new DataStoreError('appendWorkoutResult', new Error('bilan sans identifiant'));
      const history = await this.loadWorkoutHistory();
      const next = [clone(result), ...history.filter((item) => item?.id !== result.id)].slice(0, maximum);
      await this.saveWorkoutHistory(next);
      return clone(next);
    },
    async loadWorkoutFeedback() {
      return (await loadDocument(DOCUMENT_TYPES.workoutFeedback, 'loadWorkoutFeedback')) ?? [];
    },
    async saveWorkoutFeedback(feedbacks) {
      if (!Array.isArray(feedbacks)) throw new DataStoreError('saveWorkoutFeedback', new Error('feedbacks invalides'));
      return saveDocument(DOCUMENT_TYPES.workoutFeedback, feedbacks, 'saveWorkoutFeedback');
    },
    async appendWorkoutFeedback(feedback, maximum = 100) {
      if (!feedback?.activityId) throw new DataStoreError('appendWorkoutFeedback', new Error('activité manquante'));
      const history = await this.loadWorkoutFeedback();
      const next = [clone(feedback), ...history.filter((item) => item?.activityId !== feedback.activityId)].slice(0, maximum);
      await this.saveWorkoutFeedback(next);
      return clone(next);
    },
    async loadCheckins() {
      const [history, draft] = await Promise.all([
        loadDocument(DOCUMENT_TYPES.checkinHistory, 'loadCheckins'),
        loadDocument(DOCUMENT_TYPES.checkinDraft, 'loadCheckins'),
      ]);
      return { history: history ?? {}, draft: draft ?? null };
    },
    async saveCheckins(checkins) {
      if (!checkins || typeof checkins !== 'object') throw new DataStoreError('saveCheckins', new Error('questionnaires invalides'));
      await saveDocument(DOCUMENT_TYPES.checkinHistory, checkins.history ?? {}, 'saveCheckins');
      if (checkins.draft == null) await deleteDocument(DOCUMENT_TYPES.checkinDraft, 'saveCheckins');
      else await saveDocument(DOCUMENT_TYPES.checkinDraft, checkins.draft, 'saveCheckins');
      return clone({ history: checkins.history ?? {}, draft: checkins.draft ?? null });
    },
  });
}
