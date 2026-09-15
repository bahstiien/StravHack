import { HAIR, INK, MUTED, MUTED_2, RED, RED_TINT, RULE, SURF, button, kicker, title, typeColors } from '../lib/ui.js';
import { groupSessionsByDay, monthlyStats } from '../data/planning-calendar.js';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function monthDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + index));
}

function fmt(value) { return new Intl.NumberFormat('fr-FR').format(value || 0); }
function duration(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes ? `${minutes} min` : ''}`.trim() : `${minutes} min`;
}

export default function MonthView({
  month = new Date(), today = new Date(), sessions = [], goals = [], mountainBlocks = [], conflicts = [],
  stats = null, error = '', onPreviousMonth, onNextMonth, onCurrentMonth, onSelectDay, onOpenProjection,
}) {
  if (error) return <Message role="alert" title="Calendrier indisponible">{error}. Réessaie dans quelques instants.</Message>;
  const days = monthDays(month);
  const groupedDays = groupSessionsByDay(sessions);
  const computed = stats || monthlyStats(sessions, month, { today });

  return (
    <section aria-labelledby="month-heading">
      <header style={{ padding: '18px 18px 12px' }}>
        <div style={kicker(MUTED)}>VUE MENSUELLE</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginTop: 6 }}>
          <h2 id="month-heading" style={{ ...title(27), margin: 0 }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
          <button type="button" onClick={onCurrentMonth} style={button({ padding: '9px 8px', border: RULE, background: 'transparent', color: INK, fontSize: 9 })}>MOIS ACTUEL</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <button type="button" aria-label="Mois précédent" onClick={onPreviousMonth} style={navButton}>◂ MOIS PRÉCÉDENT</button>
          <button type="button" aria-label="Mois suivant" onClick={onNextMonth} style={{ ...navButton, textAlign: 'right' }}>MOIS SUIVANT ▸</button>
        </div>
      </header>
      <div style={{ borderTop: RULE, borderBottom: RULE }}>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: SURF }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => <div key={`${label}-${index}`} style={{ ...kicker(MUTED, 8), padding: '8px 0', textAlign: 'center' }}>{label}</div>)}
        </div>
        <div role="grid" aria-label={`Calendrier de ${MONTHS[month.getMonth()]} ${month.getFullYear()}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {days.map((date) => {
            const dateIso = iso(date);
            const items = groupedDays[dateIso]?.sessions || [];
            const dayGoals = goals.filter((goal) => goal.date === dateIso);
            const block = mountainBlocks.some((item) => dateIso >= item.startDate && dateIso <= item.endDate);
            const conflict = conflicts.some((item) => item.date === dateIso || item.sessionIds?.some((id) => items.some((session) => session.id === id)));
            const isToday = dateIso === iso(today);
            const outside = date.getMonth() !== month.getMonth();
            const load = items.reduce((sum, session) => sum + (session.load || 0), 0);
            const descriptors = [items.length ? `${items.length} séance${items.length > 1 ? 's' : ''}` : 'aucune séance', load ? `${load} UC` : '', dayGoals.length ? 'objectif' : '', block ? 'bloc montagne' : '', conflict ? 'conflit' : ''].filter(Boolean);
            return (
              <button key={dateIso} type="button" role="gridcell" aria-current={isToday ? 'date' : undefined}
                aria-label={`${date.getDate()} ${MONTHS[date.getMonth()]}, ${descriptors.join(', ')}`} onClick={() => onSelectDay?.(dateIso)}
                style={button({ minHeight: 67, padding: '7px 4px', borderRight: HAIR, borderTop: HAIR, background: isToday ? RED_TINT : 'transparent', color: outside ? MUTED : INK, overflow: 'hidden' })}>
                <span style={{ display: 'flex', justifyContent: 'space-between', font: '800 12px/1 Archivo' }}><span>{date.getDate()}</span>{isToday && <span className="sr-only">Aujourd’hui</span>}<span style={{ font: '600 8px/1 Archivo', color: MUTED }}>{load || ''}</span></span>
                <span style={{ display: 'flex', gap: 2, marginTop: 8, minHeight: 6 }} aria-hidden="true">
                  {items.slice(0, 3).map((session) => <span key={session.id} style={{ width: 6, height: 6, background: typeColors(session.type).bar }} />)}
                </span>
                {items.length > 1 && <span style={marker}>{items.length} SÉANCES</span>}
                {dayGoals.length > 0 && <span style={{ ...marker, color: RED }}>OBJECTIF</span>}
                {block && <span style={marker}>BLOC MONTAGNE</span>}
                {conflict && <span style={{ ...marker, color: RED }}>CONFLIT</span>}
              </button>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="month-summary" style={{ padding: '16px 18px 18px' }}>
        <h3 id="month-summary" style={{ ...kicker(MUTED), margin: 0 }}>BILAN DU MOIS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: RULE, borderLeft: HAIR, marginTop: 10 }}>
          <Stat label="CHARGE PRÉVUE" value={`${fmt(computed.plannedLoad)} UC`} />
          <Stat label="DÉJÀ RÉALISÉE" value={`${fmt(computed.completedLoad)} UC`} />
          <Stat label="SÉANCES FAITES" value={computed.completedCount ?? computed.completedSessions ?? 0} />
          <Stat label="MANQUÉES" value={computed.missedCount ?? computed.missedSessions ?? 0} />
          <Stat label="DURÉE" value={duration(computed.durationSec)} />
          <Stat label="VOLUME" value={`${fmt(computed.distanceKm)} km`} />
          <Stat label="D+" value={`${fmt(computed.dplus ?? computed.elevationGainM)} m`} />
          <Stat label="VERS L’OBJECTIF" value={`${computed.goalProgressPct || 0} %`} />
        </div>
        {onOpenProjection && <button type="button" onClick={onOpenProjection} style={button({ width: '100%', padding: 14, marginTop: 12, background: INK, color: 'var(--color-bg)' })}>VOIR LA PROJECTION →</button>}
      </section>
    </section>
  );
}

const navButton = button({ padding: '10px 8px', border: RULE, background: 'transparent', color: INK, fontSize: 9 });
const marker = { display: 'block', marginTop: 4, font: '700 6.5px/1 Archivo', letterSpacing: '.04em', whiteSpace: 'nowrap' };
function Stat({ label, value }) { return <div style={{ padding: '10px 9px', borderRight: HAIR, borderBottom: HAIR }}><div style={kicker(MUTED, 7.5)}>{label}</div><div style={{ font: '800 16px/1 Archivo', marginTop: 5 }}>{value}</div></div>; }
function Message({ role, title: heading, children }) { return <div role={role} style={{ padding: '80px 18px 20px' }}><div style={kicker(RED)}>PLANNING</div><h2 style={{ ...title(26), margin: '8px 0' }}>{heading}</h2><p style={{ color: MUTED_2, font: '400 13px/1.5 Archivo' }}>{children}</p></div>; }
