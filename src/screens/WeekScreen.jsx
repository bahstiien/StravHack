import { useMemo } from 'react';
import {
  INK, RED, RED_TINT, SURF, BAR, MUTED, MUTED_2, RULE, HAIR,
  kicker, title, button, typeColors,
} from '../lib/ui.js';
import { computeFreshness, dayShort, dayNum, fmtNum, isoDate } from '../data/model.js';
import { commentSession, commentWeek } from '../data/commentary.js';
import { planSummary } from '../data/plan.js';
import CheckinCard from '../components/CheckinCard.jsx';

const DAY = 86400000;

/** Monday of the week containing `d`. */
function weekStart(d) {
  const x = new Date(d);
  const offset = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  return new Date(x.getTime() - offset * DAY);
}

function frLabel(start) {
  const end = new Date(start.getTime() + 6 * DAY);
  const m = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${m[end.getMonth()]}`
    : `${start.getDate()} ${m[start.getMonth()]} – ${end.getDate()} ${m[end.getMonth()]}`;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - start) / DAY + 1) / 7);
}

export default function WeekScreen({
  snapshot, weekOffset, onShiftWeek, onOpenSession, generating, today, conflicts = [],
  checkin = null, onOpenCheckin, onEditCheckin, embedded = false,
}) {
  const { sessions } = snapshot;
  const ctx = useMemo(() => ({
    sessions, activities: snapshot.activities, load: snapshot.load,
    restingHr: snapshot.restingHr, laps: snapshot.laps, fitness: snapshot.fitness,
  }), [snapshot, sessions]);

  const start = useMemo(
    () => new Date(weekStart(today).getTime() + weekOffset * 7 * DAY),
    [today, weekOffset],
  );

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * DAY);
      const iso = isoDate(d);
      const onDate = sessions.filter((x) => x.date === iso);
      const s = onDate[0];
      out.push({
        iso,
        isToday: iso === isoDate(today),
        sessions: onDate,
        session: s || {
          id: `empty-${iso}`, date: iso, type: 'REPOS', title: 'Rien de prévu',
          meta: 'Aucune séance sur cette date.', load: 0,
          // Only a day that is fully past counts as done.
          done: iso < isoDate(today),
        },
      });
    }
    return out;
  }, [sessions, start, today]);

  const totalLoad = days.reduce((a, d) => a + (d.session.load || 0), 0);
  const totalDplus = days.reduce((a, d) => a + (d.session.dplus || 0), 0);
  // Bars are relative to the heaviest day of the week, not a fixed ceiling —
  // a light week should still read as a shape, not as seven stubs.
  const peak = Math.max(60, ...days.map((d) => d.session.load || 0));
  const freshness = computeFreshness(sessions, new Date(start.getTime() + 6 * DAY));

  // Résumé du plan quand la semaine affichée contient des séances planifiées.
  const plan = useMemo(
    () => (days.some((d) => d.session.planned) ? planSummary(
      days.map((d) => d.session).filter((s) => s.planned), isoDate(start),
    ) : null),
    [days, start],
  );

  return (
    <div style={{ padding: embedded ? '0' : '58px 0 0' }}>
      <header style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 12, padding: '0 18px 12px',
      }}>
        <div>
          <div style={kicker(MUTED, 9.5)}>
            SEMAINE {isoWeek(start)} · {plan ? 'PLANIFIÉE' : 'ENREGISTRÉE'}
          </div>
          <div style={{ ...title(30), marginTop: 7 }}>{frLabel(start)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            onClick={() => onShiftWeek(weekOffset - 1)}
            style={button({
              border: RULE, background: 'transparent', color: INK,
              font: '700 10px/1 Archivo', letterSpacing: '.1em', padding: '9px 10px',
            })}
          >◂ SEM. {isoWeek(new Date(start.getTime() - 7 * DAY))}</button>
          <button
            type="button"
            onClick={() => onShiftWeek(weekOffset + 1)}
            style={button({
              border: RULE, background: 'transparent', color: INK,
              font: '700 10px/1 Archivo', letterSpacing: '.1em', padding: '9px 10px',
            })}
          >SEM. {isoWeek(new Date(start.getTime() + 7 * DAY))} ▸</button>
        </div>
      </header>

      <div style={{ height: 2, background: INK }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: SURF }}>
        <Stat label="CHARGE SEM." value={`${fmtNum(totalLoad)} UC`} border />
        <Stat label="D+ PRÉVU" value={totalDplus ? `${fmtNum(totalDplus)} m` : '—'} border />
        <Stat
          label="FRAÎCHEUR"
          value={`${freshness > 0 ? '+' : ''}${freshness}`}
          color={freshness < 0 ? 'var(--color-accent-700)' : INK}
        />
      </div>

      <div style={{ height: 2, background: INK }} />

      {plan && (
        <div style={{ background: RED, color: '#fff', padding: '13px 18px', animation: 'rise .28s ease-out' }}>
          <div style={{ ...kicker('#fff'), opacity: .85 }}>
            {plan.easyWeek ? 'SEMAINE D’ASSIMILATION' : 'PLAN CALCULÉ SUR TA CHARGE RÉELLE'}
          </div>
          <div style={{ font: '800 14px/1.3 Archivo', marginTop: 6, textWrap: 'pretty' }}>
            {planLine(plan)}
          </div>
        </div>
      )}

      {generating && (
        <div style={{ padding: '16px 18px', background: SURF, overflow: 'hidden', position: 'relative' }}>
          <div style={{ font: '600 10px/1 Archivo', letterSpacing: '.12em', color: MUTED_2 }}>
            SYNCHRONISATION COROS…
          </div>
          <div style={{ marginTop: 10, height: 4, background: BAR, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: RED, animation: 'sweep 1s linear infinite' }} />
          </div>
        </div>
      )}

      {days.map(({ iso, isToday, session, sessions: daySessions }) => (
        <div key={iso}>
          {(daySessions.length ? daySessions : [session]).map((item, index) => (
            <SessionRow
              key={item.id}
              iso={iso}
              isToday={isToday && index === 0}
              session={item}
              peak={peak}
              conflicts={conflicts.filter((conflict) => conflict.sessionIds?.includes(item.id))}
              comment={item.planned ? null : commentSession(item, ctx)}
              onOpen={() => onOpenSession(item)}
            />
          ))}
          {/* Le point du jour vit sous la journée courante, jamais dans sa
              ligne : un bouton dans une ligne déjà cliquable est un piège. */}
          {isToday && onOpenCheckin && (
            <CheckinCard
              date={iso}
              entry={checkin}
              onOpen={onOpenCheckin}
              onEdit={onEditCheckin}
            />
          )}
        </div>
      ))}

      <div style={{ padding: 18, background: INK, color: 'var(--color-bg)' }}>
        <div style={kicker('var(--color-neutral-400)')}>LE MOT DU BLOC</div>
        <div style={{ font: '700 14px/1.4 Archivo', marginTop: 8, textWrap: 'pretty' }}>
          {commentWeek(days, ctx)}
        </div>
      </div>
      <div style={{ height: 74 }} />
    </div>
  );
}

/**
 * Le bandeau porte la charge *planifiée*, pas le total de la semaine — celui-ci
 * inclut ce qui est déjà couru et s'affiche dans « CHARGE SEM. ». Sans le mot
 * « planifiée », les deux chiffres se contredisaient à l'écran.
 */
function planLine(plan) {
  if (plan.saturated) {
    return `${fmtNum(plan.total)} de charge planifiée : la séance du club et la sortie longue remplissent la semaine à elles deux. Rien à ajouter.`;
  }
  if (plan.easyWeek) {
    return `${fmtNum(plan.total)} de charge planifiée, soit 30 % de moins. Le gain des trois semaines précédentes se fabrique ici.`;
  }
  return `${fmtNum(plan.total)} de charge planifiée, dont ${plan.clubShare} % pour le club, plus 2 séances de PPG.`;
}

function Stat({ label, value, border, color = INK }) {
  return (
    <div style={{ padding: '11px 14px', borderRight: border ? HAIR : undefined }}>
      <div style={kicker(MUTED)}>{label}</div>
      <div style={{ font: '800 20px/1 Archivo', marginTop: 6, color }}>{value}</div>
    </div>
  );
}

function SessionRow({ iso, isToday, session, peak, comment, conflicts = [], onOpen }) {
  const c = typeColors(session.type);
  const pct = Math.round(((session.load || 0) / peak) * 100);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{
        display: 'grid', gridTemplateColumns: '54px 1fr',
        borderBottom: HAIR, cursor: 'pointer',
        background: isToday ? RED_TINT : 'transparent',
      }}
    >
      <div style={{ borderRight: HAIR, padding: '14px 0 14px 18px' }}>
        <div style={{ font: '600 9px/1 Archivo', letterSpacing: '.1em', color: MUTED }}>
          {dayShort(iso)}
        </div>
        <div style={{
          font: '800 22px/1 Archivo', marginTop: 5, letterSpacing: '-.02em',
          color: isToday ? RED : (session.done ? 'var(--color-neutral-500)' : INK),
        }}>{dayNum(iso)}</div>
      </div>

      <div style={{ padding: '14px 18px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{
            font: '700 8.5px/1 Archivo', letterSpacing: '.12em',
            padding: '4px 6px', background: c.bg, color: c.fg,
          }}>{session.type}</span>
          {session.planned && session.load > 0 && (
            <span style={{ font: '700 9px/1 Archivo', letterSpacing: '.1em', color: MUTED }}>
              {session.status === 'VALIDÉE' ? '✓ VALIDÉE' : session.status || 'À VALIDER'}
            </span>
          )}
          {session.done && !session.planned && (
            <span style={{ font: '600 9px/1 Archivo', letterSpacing: '.1em', color: MUTED }}>✓ FAITE</span>
          )}
          {isToday && (
            <span style={{ font: '700 9px/1 Archivo', letterSpacing: '.1em', color: RED }}>AUJOURD’HUI</span>
          )}
          {comment?.flag === 'alert' && (
            <span style={{ font: '700 9px/1 Archivo', letterSpacing: '.1em', color: RED }}>À REVOIR</span>
          )}
          {comment?.flag === 'watch' && (
            <span style={{ font: '700 9px/1 Archivo', letterSpacing: '.1em', color: MUTED_2 }}>À SURVEILLER</span>
          )}
          {conflicts.length > 0 && (
            <span style={{ font: '700 9px/1 Archivo', letterSpacing: '.1em', color: RED }}>CONFLIT</span>
          )}
        </div>
        <div style={{ font: '700 15px/1.25 Archivo', marginTop: 8, letterSpacing: '-.01em' }}>
          {session.title}
        </div>
        <div style={{ font: '400 11.5px/1.4 Archivo', color: MUTED_2, marginTop: 4 }}>
          {session.meta}
        </div>
        {session.load > 0 && comment && (
          <div style={{ font: '400 11.5px/1.45 Archivo', color: INK, marginTop: 7, textWrap: 'pretty' }}>
            {comment.execution}
          </div>
        )}
        {session.planned && session.brief && (
          <div style={{ font: '400 11.5px/1.45 Archivo', color: MUTED_2, marginTop: 7, textWrap: 'pretty' }}>
            {session.brief}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1, height: 3, background: BAR }}>
            <div style={{ height: '100%', background: c.bar, width: `${pct}%` }} />
          </div>
          <span style={{ font: '600 9.5px/1 Archivo', color: MUTED, letterSpacing: '.06em' }}>
            {session.type === 'REPOS' ? 'REPOS' : `${session.load} UC`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The coach line is written from the week's own numbers. It is the one place
 * the app speaks in the second person, so it has to be specific — a generic
 * encouragement here would read as filler.
 */
function coachLine(days, totalLoad, freshness) {
  const quality = days.filter((d) => d.session.type === 'TRAIL' && d.session.load >= 70).length;
  const longest = days.reduce((a, d) => (d.session.load > (a?.session.load ?? 0) ? d : a), null);

  if (totalLoad === 0) {
    return 'Semaine vide. Soit c’est voulu, soit la synchro Coros n’a rien remonté.';
  }
  if (freshness < -25) {
    return `Tu es à ${freshness} de fraîcheur. La charge est en avance sur ta capacité à l’encaisser : coupe une séance de qualité.`;
  }
  if (quality >= 2 && longest) {
    return `${quality} séances de qualité et une sortie longue. Si tu dois en sauter une, ce n’est pas ${dayShort(longest.iso).toLowerCase()}.`;
  }
  if (freshness > 10) {
    return 'Assimilation. Le gain de tes trois dernières semaines se fabrique maintenant, pas en courant plus.';
  }
  return 'Semaine équilibrée. Respecte les zones, surtout sur la sortie longue.';
}
