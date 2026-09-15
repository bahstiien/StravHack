import { useEffect, useState } from 'react';
import { HAIR, INK, MUTED_2, RULE, button } from '../lib/ui.js';
import MonthView from '../components/MonthView.jsx';
import TrainingLogView from '../components/TrainingLogView.jsx';
import ProjectionView from '../components/ProjectionView.jsx';

const VIEWS = [['week', 'SEMAINE'], ['month', 'MOIS'], ['log', 'CARNET']];

export default function PlanningScreen({
  initialView = null, weekContent = null, renderWeek, sessions = [], goals = [], mountainBlocks = [], conflicts = [],
  projection = null, monthlyStats = null, month: controlledMonth, today = new Date(), onOpenSession, onViewChange,
}) {
  const [view, setView] = useState(() => {
    if (VIEWS.some(([key]) => key === initialView)) return initialView;
    try {
      const saved = globalThis.localStorage?.getItem('denivele.planning.view');
      return VIEWS.some(([key]) => key === saved) ? saved : 'week';
    } catch { return 'week'; }
  });
  const [month, setMonth] = useState(controlledMonth || new Date(today.getFullYear(), today.getMonth(), 1));
  const [showProjection, setShowProjection] = useState(false);
  useEffect(() => { if (controlledMonth) setMonth(controlledMonth); }, [controlledMonth]);

  function selectView(next) {
    setView(next);
    setShowProjection(false);
    try { globalThis.localStorage?.setItem('denivele.planning.view', next); } catch { /* La navigation reste utilisable sans stockage local. */ }
    onViewChange?.(next);
  }
  const shiftMonth = (delta) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return <div style={{ paddingTop: 58 }}>
    <nav role="tablist" aria-label="Vues du planning" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: RULE, borderBottom: RULE }}>
      {VIEWS.map(([key, label]) => <button key={key} id={`planning-tab-${key}`} type="button" role="tab" aria-selected={view === key} aria-controls="planning-active-panel" onClick={() => selectView(key)} style={button({ padding: '13px 10px', borderRight: HAIR, textAlign: 'center', background: view === key ? INK : 'transparent', color: view === key ? 'var(--color-bg)' : MUTED_2, fontSize: 9.5 })}>{label}</button>)}
    </nav>
    <main id="planning-active-panel" role="tabpanel" aria-labelledby={`planning-tab-${view}`} tabIndex={0}>
      {view === 'week' && (renderWeek?.() || weekContent || <EmptyWeek />)}
      {view === 'month' && !showProjection && <MonthView month={month} today={today} sessions={sessions} goals={goals} mountainBlocks={mountainBlocks} conflicts={conflicts} stats={monthlyStats} onPreviousMonth={() => shiftMonth(-1)} onNextMonth={() => shiftMonth(1)} onCurrentMonth={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} onSelectDay={(date) => sessions.find((session) => session.date === date) && onOpenSession?.(sessions.find((session) => session.date === date))} onOpenProjection={projection ? () => setShowProjection(true) : undefined} />}
      {view === 'month' && showProjection && <ProjectionView projection={projection} onClose={() => setShowProjection(false)} />}
      {view === 'log' && <TrainingLogView sessions={sessions} onOpenSession={onOpenSession} />}
    </main>
  </div>;
}

function EmptyWeek() { return <div style={{ padding: '36px 18px', font: '400 12.5px/1.5 Archivo', color: MUTED_2 }}>La vue de la semaine sera disponible après la synchronisation du planning.</div>; }
