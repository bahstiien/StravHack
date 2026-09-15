import { useState } from 'react';
import { HAIR, INK, MUTED, MUTED_2, RED, RULE, SURF, button, kicker, title, typeColors } from '../lib/ui.js';
import { groupSessionsByWeek } from '../data/planning-calendar.js';

const FILTERS = [['all', 'TOUTES'], ['trail', 'TRAIL'], ['ppg', 'PPG'], ['done', 'RÉALISÉES'], ['changed', 'MODIFIÉES OU MANQUÉES']];
const changedStatuses = ['PARTIELLE', 'REFUSÉE', 'DÉPLACÉE', 'MODIFIÉE', 'MANQUÉE'];
const dateLabel = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

export default function TrainingLogView({ sessions = [], initialFilter = 'all', onOpenSession, error = '' }) {
  const [filter, setFilter] = useState(initialFilter);
  if (error) return <State role="alert" title="Carnet indisponible">{error}. Tes séances n’ont pas été perdues.</State>;
  const filtered = sessions.filter((session) => filter === 'all'
    || (filter === 'trail' && session.type === 'TRAIL')
    || (filter === 'ppg' && session.type === 'PPG')
    || (filter === 'done' && (session.done || session.status === 'RÉALISÉE'))
    || (filter === 'changed' && (changedStatuses.includes(session.status)
      || ((session.plannedLoad ?? session.targetLoad) != null && session.load !== (session.plannedLoad ?? session.targetLoad)))));
  const weeks = groupSessionsByWeek(filtered);
  return (
    <section aria-labelledby="log-heading">
      <header style={{ padding: '18px 18px 12px' }}><div style={kicker(MUTED)}>HISTORIQUE</div><h2 id="log-heading" style={{ ...title(27), margin: '7px 0 0' }}>Carnet d’entraînement</h2></header>
      <div aria-label="Filtrer le carnet" role="tablist" style={{ display: 'flex', overflowX: 'auto', borderTop: RULE, borderBottom: RULE }}>
        {FILTERS.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} style={button({ flex: 'none', padding: '11px 12px', borderRight: HAIR, background: filter === value ? INK : 'transparent', color: filter === value ? 'var(--color-bg)' : MUTED_2, fontSize: 8.5 })}>{label}</button>)}
      </div>
      {!filtered.length ? <State title="Aucune séance">Aucune séance ne correspond à ce filtre pour le moment.</State> : Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a)).map(([start, items]) => (
        <section key={start} aria-label={`Semaine du ${dateLabel(start)}`}>
          <div style={{ ...kicker(MUTED), padding: '13px 18px', background: SURF }}>SEMAINE DU {dateLabel(start).toUpperCase()}</div>
          {[...items.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((session) => <LogEntry key={session.id} session={session} onOpen={() => onOpenSession?.(session)} />)}
        </section>
      ))}
    </section>
  );
}

function LogEntry({ session, onOpen }) {
  const planned = session.plannedLoad ?? session.targetLoad;
  const delta = planned == null ? '' : session.load - planned;
  return <button type="button" onClick={onOpen} aria-label={`Ouvrir ${session.title}, ${dateLabel(session.date)}`} style={button({ width: '100%', padding: '14px 18px', borderBottom: HAIR, background: 'transparent', color: INK })}>
    <span style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ ...kicker(typeColors(session.type).fg, 8), background: typeColors(session.type).bg, padding: '4px 6px' }}>{session.type}</span><span style={kicker(MUTED, 8)}>{dateLabel(session.date).toUpperCase()}</span><span style={{ ...kicker(changedStatuses.includes(session.status) ? RED : MUTED, 8), marginLeft: 'auto' }}>{session.status || (session.done ? 'RÉALISÉE' : 'PLANIFIÉE')}</span></span>
    <span style={{ display: 'block', font: '800 15px/1.25 Archivo', marginTop: 8 }}>{session.title}</span>
    <span style={{ display: 'block', font: '400 11.5px/1.5 Archivo', color: MUTED_2, marginTop: 5 }}>{metrics(session)}</span>
    {delta !== '' && <span style={{ display: 'block', font: '600 11px/1.4 Archivo', color: delta > 0 ? RED : MUTED_2, marginTop: 5 }}>{delta === 0 ? 'Conforme au prévu' : `${Math.abs(delta)} UC de ${delta > 0 ? 'plus' : 'moins'} que prévu`}</span>}
    {session.pain && <span style={{ display: 'block', color: RED, font: '700 10px/1.3 Archivo', marginTop: 5 }}>DOULEUR SIGNALÉE</span>}
    {session.adaptation && <span style={{ display: 'block', font: '600 11px/1.4 Archivo', marginTop: 5 }}>SUITE ADAPTÉE — {session.adaptation}</span>}
  </button>;
}
function metrics(s) { const bits = []; if (s.durationSec) bits.push(`${Math.round(s.durationSec / 60)} min`); if (s.load != null) bits.push(`${s.load} UC`); if (s.dplus || s.elevationGainM) bits.push(`${s.dplus || s.elevationGainM} m D+`); if (s.rpe) bits.push(`RPE ${s.rpe}`); return bits.join(' · ') || 'Aucune mesure disponible'; }
function State({ role, title: heading, children }) { return <div role={role} style={{ padding: '38px 18px' }}><h3 style={{ ...title(22), margin: 0 }}>{heading}</h3><p style={{ font: '400 12.5px/1.5 Archivo', color: MUTED_2 }}>{children}</p></div>; }
