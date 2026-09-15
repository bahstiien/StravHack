import { useEffect, useMemo, useState, useCallback } from 'react';
import WeekScreen from './screens/WeekScreen.jsx';
import PlanningScreen from './screens/PlanningScreen.jsx';
import AnalysisScreen from './screens/AnalysisScreen.jsx';
import PpgScreen, { ExerciseSheet } from './screens/PpgScreen.jsx';
import SessionScreen from './screens/SessionScreen.jsx';
import { initialSnapshot, loadSnapshot } from './data/provider.js';
import { INK, RULE, HAIR, MUTED, button } from './lib/ui.js';
import { isoDate } from './data/model.js';
import { buildPlan } from './data/plan.js';
import SettingsScreen from './screens/SettingsScreen.jsx';
import { DEFAULT_EQUIPMENT } from './data/goals.js';
import SyncBar from './components/SyncBar.jsx';
import GuidedSession from './screens/GuidedSession.jsx';
import { fromPpgSession } from './data/workout-plan.js';
import { importLocalStorageToSupabase } from './data/supabase-import.js';
import {
  validateSession, rejectSession, rescheduleSession, modifySession,
  restoreProposal, undoLastDecision,
} from './data/planning-decisions.js';
import { applyDecisionLayer } from './data/planning-conflicts.js';
import { effectiveAvailability } from './data/planning-availability.js';
import DailyCheckin from './components/DailyCheckin.jsx';
import CheckinCard, { CheckinResult } from './components/CheckinCard.jsx';
import { buildCheckinContext } from './data/checkin-context.js';
import { evaluateCheckin } from './data/checkin-engine.js';
import { adaptSession } from './data/checkin-adapt.js';
import {
  createEntry, reviseEntry, decideEntry, emptyAnswers, attachCompletedSession,
} from './data/checkin-model.js';
import {
  loadCheckinFor, saveCheckinEntry, loadCheckinHistory, clearCheckinHistory,
  loadCheckinDraft, saveCheckinDraft, clearCheckinDraft,
} from './data/checkin-store.js';
import { createWorkoutFeedback, applyWorkoutFeedback } from './data/post-workout-feedback.js';
import { normalizeLoadLevel } from './data/load-level.js';
import { buildGoalProjection } from './data/planning-calendar.js';
import { REMINDER_PREFERENCES_DEFAULTS } from './data/supabase-repository.js';

const TABS = [
  { id: 'week', label: 'PLANNING', icon: <><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  { id: 'ana', label: 'ANALYSE', icon: <path d="M2 16l5-9 4 6 3.5-11L18 16l4-6" /> },
  { id: 'ppg', label: 'PPG', icon: <path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" /> },
  { id: 'set', label: 'RÉGLAGES', icon: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V22a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7.5 20l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2 14.6H2a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 3.7 8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.7V2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H22a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1.2z" /></> },
];

export default function App({ repository }) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot());
  const [syncing, setSyncing] = useState(true);
  const [tab, setTab] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [activityId, setActivityId] = useState(null);
  const [openSession, setOpenSession] = useState(null);
  const [openExercise, setOpenExercise] = useState(null);
  const [goals, setGoals] = useState([]);
  const [equipment, setEquipment] = useState(DEFAULT_EQUIPMENT);
  const [loadLevel, setLoadLevel] = useState(4);
  const [library, setLibrary] = useState(null);
  const [planning, setPlanning] = useState({ decisions: [], availability: {}, exceptions: [], drafts: {} });
  const [dataReady, setDataReady] = useState(false);
  const [reminderPreferences, setReminderPreferences] = useState(REMINDER_PREFERENCES_DEFAULTS);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState('');

  // Le mode guidé : une séance en cours de déroulement, et la proposition de
  // reprendre celle qu'une fermeture accidentelle a laissée en plan.
  const [guided, setGuided] = useState(null);
  const [pendingRun, setPendingRun] = useState(null);
  const [workoutFeedback, setWorkoutFeedback] = useState([]);
  const [feedbackOutcome, setFeedbackOutcome] = useState(null);
  const [sessionAction, setSessionAction] = useState(null);

  const today = new Date();
  const todayKey = isoDate(today);
  const [checkin, setCheckin] = useState(() => loadCheckinFor(todayKey));
  const [checkinDraft, setCheckinDraft] = useState(() => loadCheckinDraft(todayKey));
  const [checkinCount, setCheckinCount] = useState(() => Object.keys(loadCheckinHistory()).length);
  const [checkinView, setCheckinView] = useState(null);
  const [checkinEditing, setCheckinEditing] = useState(false);
  const [checkinError, setCheckinError] = useState('');

  const refresh = useCallback(async (currentGoals, currentEquipment, forceRemote = false, currentLoadLevel) => {
    setSyncing(true);
    try {
      let data = forceRemote ? null : await repository.loadLatestSnapshot();
      if (!data) {
        data = await loadSnapshot();
        await repository.saveSnapshot(data, data?.meta?.source === 'coros-mcp' ? 'coros' : 'legacy');
      }

      // Le calendrier du club est une saisie manuelle : le club annonce ses
      // séances, la montre ne les connaît pas. Absent, le plan retombe sur la
      // médiane des mardis passés.
      const catalogs = await repository.loadCatalogs();
      const clubData = catalogs.club_sessions ?? null;
      const ppgData = catalogs.ppg_library ?? null;
      setLibrary(ppgData);

      // Le plan est reconstruit à chaque chargement, jamais stocké : il dépend
      // de la charge réellement encaissée, donc le figer le rendrait faux dès
      // la première séance qui s'écarte de ce qui était prévu.
      const plan = buildPlan({
        sessions: data.sessions,
        load: data.load,
        fitness: data.fitness,
        goals: currentGoals ?? goals,
        club: clubData,
        ppgLibrary: ppgData?.exercises || [],
        equipment: currentEquipment ?? equipment,
        loadLevel: currentLoadLevel ?? loadLevel,
        today: new Date(),
        weeks: planningHorizonWeeks(currentGoals ?? goals, new Date()),
      });

      const feedbackApplied = applyWorkoutFeedback(plan, workoutFeedback, data.sessions);
      setFeedbackOutcome(feedbackApplied.summary);
      const calculated = applyDecisionLayer(
        feedbackApplied.sessions, planning.decisions, data.sessions, planning.availability, planning.exceptions,
      );
      const merged = calculated.sessions;
      setSnapshot((prev) => ({
        ...data,
        sessions: merged,
        planningConflicts: calculated.conflicts,
        planningHistory: calculated.history,
        weeklyPlannedLoad: calculated.weeklyLoad,
        // Coros has no PPG library; keep the local one when the bridge
        // returns an empty list rather than emptying the screen.
        exercises: data.exercises?.length ? data.exercises : prev.exercises,
      }));
      setActivityId((id) => id ?? data.activities[0]?.id ?? null);
      setWeekOffset((current) => (current === 0 ? openingWeekOffset(merged) : current));
    } finally {
      setSyncing(false);
    }
    // `goals` est volontairement hors des dépendances : le plan est
    // recalculé explicitement par onGoalsChange, pas par une boucle d'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planning, repository, workoutFeedback, loadLevel]);

  useEffect(() => {
    let active = true;
    (async () => {
      await importLocalStorageToSupabase({ repository });
      const [settings, storedPlanning, run, storedFeedback, storedReminderPreferences] = await Promise.all([
        repository.loadSettings(), repository.loadPlanning(), repository.loadGuidedRun(),
        repository.loadWorkoutFeedback(), repository.loadReminderPreferences(),
      ]);
      if (!active) return;
      setGoals(settings.goals);
      setEquipment(settings.equipment?.length ? settings.equipment : DEFAULT_EQUIPMENT);
      setLoadLevel(normalizeLoadLevel(settings.loadLevel));
      setPlanning(storedPlanning);
      setPendingRun(run);
      setWorkoutFeedback(storedFeedback);
      setReminderPreferences(storedReminderPreferences);
      setDataReady(true);
    })().catch((error) => { console.error(error); setDataReady(true); });
    return () => { active = false; };
  }, [repository]);

  const onReminderPreferencesChange = useCallback((next) => {
    setReminderPreferences(next);
    setReminderSaving(true);
    setReminderError('');
    repository.saveReminderPreferences(next)
      .then(setReminderPreferences)
      .catch(() => setReminderError('Impossible d’enregistrer les rappels. Vérifie ta connexion puis réessaie.'))
      .finally(() => setReminderSaving(false));
  }, [repository]);

  const goalProjection = useMemo(() => buildGoalProjection({
    sessions: snapshot.sessions,
    goals,
    today,
  }), [snapshot.sessions, goals, todayKey]);

  useEffect(() => { if (dataReady) refresh(); }, [dataReady, refresh]);

  // Toute modification d'objectif reconstruit le plan immédiatement — c'est la
  // promesse de l'écran : on change la date, la semaine change.
  const onGoalsChange = useCallback((next) => {
    setGoals(next);
    repository.saveSettings({ goals: next, equipment, loadLevel }).catch(console.error);
    refresh(next);
  }, [refresh, repository, equipment, loadLevel]);

  // Le matériel change le contenu des séances de PPG, donc le plan.
  const onEquipmentChange = useCallback((next) => {
    setEquipment(next);
    repository.saveSettings({ goals, equipment: next, loadLevel }).catch(console.error);
    refresh(undefined, next);
  }, [refresh, repository, goals, loadLevel]);

  const onLoadLevelChange = useCallback((value) => {
    const next = normalizeLoadLevel(value);
    setLoadLevel(next);
    repository.saveSettings({ goals, equipment, loadLevel: next }).catch(console.error);
    refresh(undefined, undefined, false, next);
  }, [equipment, goals, refresh, repository]);

  // Une séance de PPG planifiée se déroule avec le même moteur qu'un WOD : elle
  // passe par la même conversion, et le lecteur ne sait pas d'où elle vient.
  const startGuidedPpg = useCallback((session) => {
    setOpenSession(null);
    setGuided({ definition: fromPpgSession(session), resumeState: null });
  }, []);

  // La séance du jour : celle qui reste à faire, en écartant les jours de repos
  // — on ne « fait pas le point » sur un repos pour se le voir raccourcir.
  const todaySession = useMemo(() => {
    const onToday = snapshot.sessions.filter((item) => item.date === todayKey && !item.done);
    return onToday.find((item) => item.type !== 'REPOS') || onToday[0] || null;
  }, [snapshot.sessions, todayKey]);

  // La proposition d'adaptation se recalcule à partir du contexte *figé* dans
  // l'entrée, pas du contexte d'aujourd'hui : c'est ce qui a été montré à
  // l'utilisateur au moment où il a répondu.
  const checkinProposal = useMemo(() => (checkin && todaySession
    ? adaptSession(todaySession, {
      answers: checkin.answers,
      recommendation: checkin.recommendation,
      context: checkin.context,
    })
    : null), [checkin, todaySession]);

  // La séance réellement faite n'est connue qu'après la synchro Coros. Quand
  // elle arrive, elle vient se rattacher au questionnaire du jour : c'est ce
  // qui rendra lisible, plus tard, l'écart entre ce qui a été conseillé et ce
  // qui a été fait. La recommandation, elle, n'est pas retouchée.
  useEffect(() => {
    if (!checkin || checkin.completedSessionId) return;
    const done = snapshot.sessions.find((item) => item.date === todayKey && item.done && item.load > 0);
    if (!done) return;
    const next = attachCompletedSession(checkin, done.id);
    saveCheckinEntry(next);
    setCheckin(next);
  }, [checkin, snapshot.sessions, todayKey]);

  const openCheckinForm = useCallback((editing = false) => {
    setCheckinEditing(Boolean(editing));
    setCheckinError('');
    setCheckinView('form');
  }, []);

  const openCheckin = useCallback(() => {
    setCheckinError('');
    setCheckinView(checkin ? 'result' : 'form');
    if (!checkin) setCheckinEditing(false);
  }, [checkin]);

  // Chaque frappe est un brouillon : un onglet recyclé ne doit pas coûter les
  // six réponses déjà données.
  const onCheckinChange = useCallback((answers, step) => {
    const draft = { date: todayKey, step, answers, updatedAt: new Date().toISOString() };
    setCheckinDraft(draft);
    const saved = saveCheckinDraft(draft);
    if (!saved.ok) setCheckinError(saved.reason);
  }, [todayKey]);

  const submitCheckin = useCallback((answers) => {
    const context = buildCheckinContext({ snapshot, date: todayKey, session: todaySession });
    const recommendation = evaluateCheckin(answers, context);
    // Modifier ses réponses ne réécrit pas la recommandation précédente : elle
    // descend dans les révisions, avec le contexte qui l'avait produite.
    const entry = checkin
      ? reviseEntry(checkin, { answers, context, recommendation })
      : createEntry({ date: todayKey, answers, context, recommendation });

    const saved = saveCheckinEntry(entry);
    setCheckin(entry);
    setCheckinError(saved.ok ? '' : saved.reason);
    setCheckinCount(Object.keys(loadCheckinHistory()).length);
    clearCheckinDraft();
    setCheckinDraft(null);
    setCheckinEditing(false);
    setCheckinView('result');
  }, [snapshot, todayKey, todaySession, checkin]);

  const recordCheckinDecision = useCallback((action, details = {}) => {
    setCheckin((current) => (current ? decideEntry(current, { action, ...details }) : current));
    if (checkin) {
      const saved = saveCheckinEntry(decideEntry(checkin, { action, ...details }));
      if (!saved.ok) setCheckinError(saved.reason);
    }
  }, [checkin]);

  const startGuidedWod = useCallback((definition) => {
    setGuided({ definition, resumeState: null });
  }, []);

  const goAnalyse = useCallback((id) => {
    setActivityId(id);
    setOpenSession(null);
    setTab('ana');
  }, []);

  const saveActivityFeedback = useCallback(async (input) => {
    const activity = snapshot.activities.find((item) => item.id === input.activityId);
    const session = snapshot.sessions.find((item) => item.activityId === input.activityId);
    const entry = createWorkoutFeedback({
      ...input,
      sessionId: session?.id ?? null,
      date: activity?.date,
    });
    const next = await repository.appendWorkoutFeedback(entry);
    setWorkoutFeedback(next);
    return entry;
  }, [repository, snapshot.activities, snapshot.sessions]);

  const updateDecisions = useCallback((makeNext) => {
    setPlanning((current) => {
      const next = makeNext(current.decisions);
      const updated = { ...current, decisions: next };
      repository.savePlanning(updated).catch(console.error);
      return updated;
    });
  }, [repository]);

  const decide = useCallback((sessionId, factory) => {
    const session = snapshot.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    updateDecisions((current) => [...current, factory(session)]);
    setOpenSession(null);
  }, [snapshot.sessions, updateDecisions]);

  const planningActions = {
    onValidate: (id) => decide(id, (session) => validateSession(session)),
    onMove: (id, date, details) => {
      decide(id, (session) => rescheduleSession(session, date, details));
      setSessionAction(null);
      // Le questionnaire a proposé le déplacement ; c'est ici qu'il devient un
      // fait, et c'est ici qu'on le note dans la journée.
      if (checkin && id === todaySession?.id) recordCheckinDecision('move', { sessionId: id, date });
    },
    onModify: (id, changes) => decide(id, (session) => modifySession(session, normalizeSessionChanges(changes))),
    onReject: (id, details) => decide(id, (session) => rejectSession(session, details)),
    onRestore: (id) => { updateDecisions((current) => restoreProposal(current, id)); setOpenSession(null); },
    onUndo: () => { updateDecisions(undoLastDecision); setOpenSession(null); },
  };

  /**
   * Appliquer l'adaptation proposée.
   *
   * Elle passe par la même décision « modifier » que la modification manuelle :
   * même validation, même verrouillage, même historique. Le questionnaire ne
   * dispose d'aucun chemin privilégié pour écrire dans le planning.
   */
  const applyCheckinAdaptation = useCallback((proposal) => {
    if (!todaySession || !proposal?.applicable || !proposal.changes) return;
    try {
      updateDecisions((current) => [...current, modifySession(todaySession, proposal.changes)]);
      recordCheckinDecision('apply', { sessionId: todaySession.id });
      setCheckinError('');
      setCheckinView(null);
    } catch (error) {
      setCheckinError(error.message);
    }
  }, [todaySession, updateDecisions, recordCheckinDecision]);

  const keepPlannedSession = useCallback(() => {
    recordCheckinDecision('keep', { sessionId: todaySession?.id ?? null });
    setCheckinView(null);
  }, [recordCheckinDecision, todaySession]);

  const moveFromCheckin = useCallback(() => {
    if (!todaySession) return;
    setCheckinView(null);
    setSessionAction('move');
    setOpenSession(todaySession);
  }, [todaySession]);

  const clearCheckins = useCallback(() => {
    clearCheckinHistory();
    clearCheckinDraft();
    setCheckin(null);
    setCheckinDraft(null);
    setCheckinCount(0);
    setCheckinView(null);
  }, []);

  const saveWeeklyAvailability = useCallback((weekly) => {
    const next = availabilityForEngine(weekly);
    setPlanning((current) => {
      const updated = { ...current, availability: next };
      repository.savePlanning(updated).catch(console.error);
      return updated;
    });
  }, [repository]);

  const addException = useCallback((constraint) => {
    const nextItem = {
      ...constraint, id: constraint.id || `exception-${Date.now()}`,
      available: !['indisponibilite', 'repos'].includes(constraint.type),
    };
    setPlanning((current) => {
      const next = [...current.exceptions, nextItem];
      const updated = { ...current, exceptions: next };
      repository.savePlanning(updated).catch(console.error);
      return updated;
    });
  }, [repository]);

  const removeException = useCallback((id) => {
    setPlanning((current) => {
      const next = current.exceptions.filter((item) => item.id !== id);
      const updated = { ...current, exceptions: next };
      repository.savePlanning(updated).catch(console.error);
      return updated;
    });
  }, [repository]);

  return (
    <main className="app-shell">
      <div className="app-container">
        <div className="app-sync-status">
          <SyncBar meta={snapshot.meta} syncing={syncing} onSync={() => refresh(undefined, undefined, true)} />
        </div>
        <div className="app-viewport">
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
            overflow: 'hidden', background: 'var(--color-bg)', color: INK,
            fontFamily: 'Archivo, system-ui', position: 'relative',
          }}>
            <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {tab === 'week' && (
                <PlanningScreen
                  sessions={snapshot.sessions}
                  goals={goals}
                  conflicts={snapshot.planningConflicts || []}
                  mountainBlocks={mountainBlocksFrom(snapshot.sessions)}
                  projection={goalProjection}
                  today={today}
                  onOpenSession={setOpenSession}
                  renderWeek={() => (
                    <WeekScreen
                      snapshot={snapshot}
                      weekOffset={weekOffset}
                      onShiftWeek={setWeekOffset}
                      onOpenSession={setOpenSession}
                      generating={syncing}
                      today={today}
                      conflicts={snapshot.planningConflicts || []}
                      checkin={checkin}
                      onOpenCheckin={openCheckin}
                      onEditCheckin={() => openCheckinForm(true)}
                    />
                  )}
                />
              )}
              {tab === 'ana' && (
                <AnalysisScreen
                  snapshot={snapshot}
                  activityId={activityId}
                  onPick={setActivityId}
                  feedback={workoutFeedback.find((item) => item.activityId === activityId) ?? null}
                  feedbackOutcome={feedbackOutcome?.activityId === activityId ? feedbackOutcome : null}
                  onValidateFeedback={saveActivityFeedback}
                />
              )}
              {tab === 'ppg' && (
                <PpgScreen
                  snapshot={snapshot}
                  library={library}
                  equipment={equipment}
                  onOpenExercise={setOpenExercise}
                  onStartGuided={startGuidedWod}
                  checkinAnswers={checkin?.answers || null}
                />
              )}
              {tab === 'set' && (
                <SettingsScreen
                  goals={goals}
                  onGoalsChange={onGoalsChange}
                  equipment={equipment}
                  onEquipmentChange={onEquipmentChange}
                  loadLevel={loadLevel}
                  onLoadLevelChange={onLoadLevelChange}
                  library={library}
                  checkinCount={checkinCount}
                  onClearCheckins={clearCheckins}
                  longRunPace={(snapshot.fitness?.thresholdPaceSecPerKm || 241) + 95}
                  weeklyAvailability={availabilityForUi(planning.availability)}
                  datedConstraints={planning.exceptions}
                  onSaveWeeklyAvailability={saveWeeklyAvailability}
                  onAddConstraint={addException}
                  onRemoveConstraint={removeException}
                  reminderPreferences={reminderPreferences}
                  onReminderPreferencesChange={onReminderPreferencesChange}
                  reminderSaving={reminderSaving}
                  reminderError={reminderError}
                />
              )}
            </div>

            {openExercise && (
              <ExerciseSheet
                exercise={openExercise}
                onClose={() => setOpenExercise(null)}
                onAdd={() => setOpenExercise(null)}
                addLabel="AJOUTER À LA PROCHAINE PPG"
              />
            )}

            {openSession && (
              <SessionScreen
                session={openSession}
                onClose={() => { setOpenSession(null); setSessionAction(null); }}
                onAnalyse={goAnalyse}
                onOpenExercise={setOpenExercise}
                onStartGuided={startGuidedPpg}
                planningActions={planningActions}
                dateOptions={dateOptionsFor(openSession, snapshot.sessions, planning, snapshot.planningConflicts || [])}
                canRestore={planning.decisions.some((item) => item.sessionId === openSession.id)}
                canUndo={planning.decisions.length > 0}
                initialAction={sessionAction}
                checkin={openSession.date === todayKey ? checkin : null}
                onOpenCheckin={openSession.date === todayKey
                  ? () => { setOpenSession(null); openCheckin(); }
                  : null}
              />
            )}

            {checkinView === 'form' && (
              <DailyCheckin
                date={todayKey}
                editing={checkinEditing}
                initialAnswers={
                  (checkinEditing ? checkin?.answers : checkinDraft?.answers)
                  ?? checkin?.answers ?? emptyAnswers()
                }
                initialStep={checkinEditing ? 0 : (checkinDraft?.step ?? 0)}
                saveError={checkinError}
                onChange={onCheckinChange}
                onValidate={submitCheckin}
                onClose={() => setCheckinView(null)}
              />
            )}

            {checkinView === 'result' && checkin && (
              <CheckinSheet onClose={() => setCheckinView(null)}>
                <CheckinResult
                  entry={checkin}
                  proposal={checkinProposal}
                  session={todaySession}
                  decisionError={checkinError}
                  onApply={applyCheckinAdaptation}
                  onKeep={keepPlannedSession}
                  onMove={moveFromCheckin}
                  onEdit={() => openCheckinForm(true)}
                  onClose={() => setCheckinView(null)}
                />
              </CheckinSheet>
            )}

            {guided && (
              <GuidedSession
                repository={repository}
                definition={guided.definition}
                resumeState={guided.resumeState}
                onClose={() => { setGuided(null); setPendingRun(null); }}
                onFinished={() => setPendingRun(null)}
              />
            )}

            {!guided && pendingRun && (
              <ResumePrompt
                run={pendingRun}
                onResume={() => {
                  setGuided({ definition: pendingRun.definition, resumeState: pendingRun.state });
                  setPendingRun(null);
                }}
                onDiscard={() => {
                  repository.clearGuidedRun().then(() => setPendingRun(null)).catch(console.error);
                }}
              />
            )}

            <nav className="app-tab-bar" style={{
              flex: 'none', borderTop: RULE, background: 'var(--color-bg)',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            }}>
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => setTab(t.id)}
                  style={button({
                    borderRight: i < TABS.length - 1 ? HAIR : undefined,
                    background: tab === t.id ? INK : 'transparent',
                    color: tab === t.id ? 'var(--color-bg)' : MUTED,
                    padding: '12px 0 12px 11px',
                    display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start',
                  })}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    {t.icon}
                  </svg>
                  <span style={{ font: '700 8.5px/1 Archivo', letterSpacing: '.06em' }}>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

      </div>
    </main>
  );
}

/**
 * La feuille qui porte le résultat du point du jour.
 *
 * Elle ne fait que tenir le contenu : le résultat, lui, est un composant à part
 * qui se rend aussi bien dans un test que dans cet écran.
 */
function CheckinSheet({ children, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Point du jour"
      style={{
        position: 'absolute', inset: 0, zIndex: 118, background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column', animation: 'rise .22s ease-out',
      }}
    >
      <div style={{
        flex: 'none', padding: '52px 18px 12px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ font: '600 9.5px/1 Archivo', letterSpacing: '.14em', color: MUTED }}>
          POINT DU JOUR
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={button({
            flex: 'none', border: RULE, background: 'transparent', color: INK,
            font: '700 11px/1 Archivo', padding: '7px 9px',
          })}
        >✕</button>
      </div>
      <div style={{ height: 2, background: INK }} />
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px 40px' }}>{children}</div>
    </div>
  );
}

/**
 * « Une séance est en cours. Voulez-vous la reprendre ? »
 *
 * Posée au chargement, une seule fois, et seulement si ce qui a été relu est
 * réellement jouable — le stockage a déjà écarté les séances trop vieilles,
 * terminées ou devenues illisibles.
 */
function ResumePrompt({ run, onResume, onDiscard }) {
  const minutes = Math.round(run.definition.plannedDurationSeconds / 60);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reprendre la séance en cours"
      style={{
        position: 'absolute', inset: 0, zIndex: 115,
        background: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div style={{
        width: '100%', background: 'var(--color-bg)', borderTop: RULE,
        padding: '18px 18px 40px',
      }}>
        <div style={{ font: '600 9px/1 Archivo', letterSpacing: '.14em', color: MUTED }}>
          SÉANCE INTERROMPUE
        </div>
        <div style={{ font: '800 22px/1.15 Archivo', marginTop: 9, letterSpacing: '-.02em' }}>
          Une séance est en cours
        </div>
        <div style={{ font: '400 12.5px/1.55 Archivo', color: 'var(--color-neutral-900)', marginTop: 9, textWrap: 'pretty' }}>
          « {run.definition.title} », {minutes} min. Tout a été conservé : le temps
          écoulé, le bloc, l’exercice et les tours validés. Veux-tu la reprendre ?
        </div>

        <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
          <button type="button" onClick={onResume} style={button({
            width: '100%', background: 'var(--color-accent)', color: '#fff',
            padding: 17, letterSpacing: '.1em',
          })}>REPRENDRE LA SÉANCE</button>
          <button type="button" onClick={onDiscard} style={button({
            width: '100%', border: RULE, background: 'transparent', color: INK,
            padding: 15, letterSpacing: '.1em',
          })}>L’ABANDONNER</button>
        </div>
      </div>
    </div>
  );
}

const DAY = 86400000;

/**
 * Le réel gagne toujours sur le prévu.
 *
 * Une séance planifiée dont le jour est déjà couru disparaît : ce que la montre
 * a enregistré est la vérité, et laisser les deux côte à côte donnerait une
 * semaine qui compte deux fois la même sortie.
 */
function mergePlan(actual, plan) {
  const done = new Set(actual.filter((s) => s.load > 0).map((s) => s.date));
  const kept = plan.filter((p) => !done.has(p.date));
  const byDate = new Map(actual.map((s) => [s.date, s]));
  for (const p of kept) byDate.set(p.date, p);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Which week to open on.
 *
 * Opening on "this week" is right until the data is real: train on Thursday,
 * open the app on Monday, and you get seven empty rows. So if the current week
 * has nothing in it, fall back to the most recent week that does — and stay on
 * the current week whenever it has anything at all.
 */
function openingWeekOffset(sessions) {
  const withLoad = (sessions || []).filter((s) => s.load > 0);
  if (!withLoad.length) return 0;

  const monday = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return new Date(x.getTime() - ((x.getDay() + 6) % 7) * DAY);
  };
  const parse = (ymd) => {
    const [y, m, dd] = ymd.split('-').map(Number);
    return new Date(y, m - 1, dd);
  };

  const thisMonday = monday(new Date());
  const thisWeekEnd = isoDate(new Date(thisMonday.getTime() + 6 * DAY));
  const thisWeekStart = isoDate(thisMonday);
  if (withLoad.some((s) => s.date >= thisWeekStart && s.date <= thisWeekEnd)) return 0;

  const latest = withLoad.reduce((a, s) => (s.date > a ? s.date : a), withLoad[0].date);
  return Math.round((monday(parse(latest)) - thisMonday) / (7 * DAY));
}

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function availabilityForEngine(weekly = {}) {
  return Object.fromEntries(DAY_NAMES.map((name, day) => {
    const value = weekly[name] || weekly[day] || {};
    return [day, {
      available: value.available ?? true,
      maxDurationMin: value.maxDurationMin ?? value.durationMin ?? null,
      slot: value.slot || 'normal',
      runPossible: value.runPossible ?? value.canRun ?? true,
      ppgPossible: value.ppgPossible ?? value.canPpg ?? true,
      equipment: value.equipment || [],
      preferredTime: value.preferredTime || null,
      preference: value.preference || null,
    }];
  }));
}

function availabilityForUi(weekly = {}) {
  return Object.fromEntries(DAY_NAMES.map((name, day) => {
    const value = weekly[day] || {};
    return [name, {
      available: value.available ?? true,
      durationMin: value.maxDurationMin ?? 60,
      slot: value.slot || 'normal',
      canRun: value.runPossible ?? true,
      canPpg: value.ppgPossible ?? true,
      equipment: value.equipment || [],
      preferredTime: value.preferredTime || '',
      preference: value.preference || 'aucune',
    }];
  }));
}

function normalizeSessionChanges(changes) {
  const requestedType = String(changes.type || '').toLowerCase();
  const type = requestedType === 'ppg' ? 'PPG'
    : ['mobilité', 'récupération'].includes(requestedType) ? 'REPOS' : 'TRAIL';
  return {
    durationSec: changes.durationMin * 60,
    preferredTime: changes.time || null,
    type,
    intensity: changes.intensity,
    distanceM: changes.distanceKm == null ? null : Math.round(changes.distanceKm * 1000),
    dplus: changes.dplus,
    repetitions: changes.repetitions,
    ppgContent: changes.ppgContent,
    comment: changes.comment,
  };
}

function planningHorizonWeeks(goals, today) {
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const nextA = (goals || [])
    .filter((goal) => goal.priority === 'A' && goal.date)
    .map((goal) => new Date(`${goal.date}T12:00:00`))
    .filter((date) => date.getTime() >= todayTime)
    .sort((a, b) => a - b)[0];
  if (!nextA) return 12;
  return Math.max(2, Math.min(52, Math.ceil((nextA.getTime() - todayTime) / (7 * DAY)) + 1));
}

function mountainBlocksFrom(sessions) {
  const blocks = (sessions || []).filter((session) => session.weekendBlock).reduce((result, session) => {
    const id = session.blockId || session.date;
    const previous = result[id];
    return {
      ...result,
      [id]: previous
        ? { ...previous, startDate: previous.startDate < session.date ? previous.startDate : session.date, endDate: previous.endDate > session.date ? previous.endDate : session.date }
        : { id, startDate: session.date, endDate: session.date },
    };
  }, {});
  return Object.values(blocks);
}

function dateOptionsFor(session, sessions, planning, conflicts) {
  if (!session) return [];
  const origin = new Date(`${session.date}T12:00:00`);
  return Array.from({ length: 15 }, (_, index) => {
    const date = new Date(origin.getTime() + (index - 7) * DAY);
    const key = isoDate(date);
    const availability = effectiveAvailability(key, planning.availability, planning.exceptions);
    const warnings = conflicts
      .filter((conflict) => conflict.date === key)
      .map((conflict) => conflict.message);
    const occupied = sessions.filter((item) => item.date === key && item.id !== session.id);
    if (!availability.available) warnings.push('Jour indisponible');
    if (occupied.length) warnings.push('Créneau déjà occupé');
    return {
      date: key,
      sessions: occupied.map((item) => item.title),
      availability: {
        available: availability.available,
        durationMin: availability.maxDurationMin ?? 1440,
        equipment: availability.equipment,
      },
      compatibility: warnings.length ? 'Attention' : index === 7 ? 'Créneau actuel' : 'Recommandé',
      warnings: [...new Set(warnings)],
    };
  });
}
