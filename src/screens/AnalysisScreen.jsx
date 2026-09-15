import { useEffect, useState } from 'react';
import {
  INK, RED, SURF, BAR, MUTED, MUTED_2, BODY, RULE, HAIR, HAIR_SOFT,
  kicker, title, button, deltaColor, linePath, areaPath,
} from '../lib/ui.js';
import { fmtClock, dateSentence } from '../data/model.js';
import { RPE_NOTES } from '../data/fixtures.js';
import { commentSession } from '../data/commentary.js';

export default function AnalysisScreen({
  snapshot, activityId, onPick, feedback = null, feedbackOutcome = null,
  onValidateFeedback = null,
}) {
  const { activities, athlete } = snapshot;
  const [rpe, setRpe] = useState(8);
  const [completion, setCompletion] = useState('complete');
  const [pain, setPain] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const idx = Math.max(0, activities.findIndex((a) => a.id === activityId));
  const a = activities[idx] || activities[0] || null;
  const currentFeedback = feedback?.activityId === a?.id ? feedback : null;

  useEffect(() => {
    setRpe(currentFeedback?.rpe ?? 8);
    setCompletion(currentFeedback?.completion ?? 'complete');
    setPain(currentFeedback?.pain ?? false);
    setNote(currentFeedback?.note ?? '');
    setSaveError('');
  }, [a?.id, currentFeedback?.validatedAt]);

  if (!a) {
    return (
      <Empty>
        Aucune activité remontée. Lance le pont Coros (<code>npm run server</code>) ou
        écris un instantané avec <code>npm run sync:coros</code>.
      </Empty>
    );
  }

  async function validateFeedback() {
    if (!onValidateFeedback || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onValidateFeedback({ activityId: a.id, rpe, completion, pain, note });
    } catch (error) {
      setSaveError(error?.message || 'Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  // Le commentaire est recalculé à l'affichage : il dépend de la charge des
  // jours précédents, donc il change quand le snapshot change.
  const session = snapshot.sessions.find((s) => s.activityId === a.id);
  const comment = session ? commentSession(session, {
    sessions: snapshot.sessions, activities, load: snapshot.load,
    restingHr: snapshot.restingHr, laps: snapshot.laps, fitness: snapshot.fitness,
  }) : null;

  return (
    <div style={{ padding: '58px 0 0' }}>
      <header style={{ padding: '0 18px 12px' }}>
        <div style={kicker(MUTED, 9.5)}>ANALYSE · {a.device || athlete.device}</div>
        <div style={{ ...title(27), marginTop: 7 }}>{a.title}</div>
        <div style={{ font: '400 11.5px/1 Archivo', color: MUTED_2, marginTop: 6 }}>
          {dateSentence(a.date)}
          {a.location ? ` · ${a.location}` : ''}
        </div>
      </header>

      <nav style={{ display: 'flex', overflow: 'auto', borderTop: RULE, borderBottom: RULE }}>
        {activities.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => onPick(x.id)}
            style={button({
              flex: 'none', borderRight: HAIR,
              background: i === idx ? INK : 'transparent',
              color: i === idx ? 'var(--color-bg)' : MUTED_2,
              font: '700 9.5px/1 Archivo', letterSpacing: '.1em', padding: '11px 13px',
            })}
          >{tabLabel(x.date)}</button>
        ))}
      </nav>

      {comment && (
        <>
          <div style={{ padding: '13px 18px', background: SURF, borderBottom: HAIR }}>
            <div style={kicker(MUTED, 8.5)}>CE QUE TU AVAIS DANS LES JAMBES</div>
            <div style={{ font: '400 12.5px/1.5 Archivo', color: BODY, marginTop: 6, textWrap: 'pretty' }}>
              {comment.context}
            </div>
          </div>

          <div style={{ background: RED, color: '#fff', padding: '15px 18px' }}>
            <div style={{ ...kicker('#fff'), opacity: .85 }}>VERDICT</div>
            <div style={{ font: '800 15px/1.35 Archivo', marginTop: 7, textWrap: 'pretty' }}>
              {comment.execution}
            </div>
          </div>

          <div style={{ padding: '13px 18px', background: INK, color: 'var(--color-bg)' }}>
            <div style={{ ...kicker('var(--color-neutral-400)', 8.5) }}>ON ADAPTE LA SUITE</div>
            <div style={{ font: '700 13px/1.45 Archivo', marginTop: 6, textWrap: 'pretty' }}>
              {comment.next}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: HAIR }}>
        {a.metrics.map((m) => (
          <div key={m.k} style={{ padding: '12px 14px', borderRight: HAIR, borderTop: HAIR }}>
            <div style={kicker(MUTED, 8.5)}>{m.k}</div>
            <div style={{ font: '800 18px/1 Archivo', marginTop: 6, letterSpacing: '-.01em' }}>{m.v}</div>
          </div>
        ))}
      </div>

      <Section label="FRÉQUENCE CARDIAQUE / ALTITUDE" />
      <div style={{ padding: '0 18px 16px' }}>
        {a.streams.hr.length ? (
          <>
            <svg
              viewBox="0 0 360 110" width="100%" height="110" preserveAspectRatio="none"
              style={{ display: 'block', borderBottom: RULE }}
              role="img"
              aria-label={`Fréquence cardiaque et altitude sur ${fmtClock(a.durationSec)}`}
            >
              <path d={areaPath(a.streams.altitude, 110)} fill={BAR} />
              <path d={linePath(a.streams.hr, 110)} fill="none" stroke={RED} strokeWidth="2" />
            </svg>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              font: '600 9px/1 Archivo', letterSpacing: '.08em', color: MUTED, marginTop: 7,
            }}>
              <span>0:00</span><span>{fmtClock(a.durationSec)}</span>
            </div>
          </>
        ) : (
          <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, borderBottom: RULE, paddingBottom: 14 }}>
            Pas de flux de données pour cette séance.
          </div>
        )}
      </div>

      <div style={{ height: 2, background: INK }} />
      <Section label="INTERVALLES" />
      <div style={{ padding: '0 18px 18px' }}>
        {a.intervals.length ? (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr .8fr',
              borderBottom: RULE, paddingBottom: 7, marginTop: 10,
            }}>
              {['BLOC', 'DURÉE', 'ALLURE', 'FC'].map((h) => (
                <div key={h} style={kicker(MUTED, 8.5)}>{h}</div>
              ))}
              <div style={{ ...kicker(MUTED, 8.5), textAlign: 'right' }}>Δ</div>
            </div>
            {a.intervals.map((i, n) => (
              <div key={`${i.name}-${n}`} style={{
                display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr .8fr',
                padding: '9px 0', borderBottom: HAIR_SOFT, alignItems: 'baseline',
              }}>
                <div style={{ font: '700 12px/1 Archivo' }}>{i.name}</div>
                <div style={{ font: '400 12px/1 Archivo', color: 'var(--color-neutral-800)' }}>{i.dur}</div>
                <div style={{ font: '400 12px/1 Archivo', color: 'var(--color-neutral-800)' }}>{i.pace}</div>
                <div style={{ font: '400 12px/1 Archivo', color: 'var(--color-neutral-800)' }}>{i.hr}</div>
                <div style={{ font: '700 12px/1 Archivo', textAlign: 'right', color: deltaColor(i.delta) }}>
                  {i.delta}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, paddingTop: 10 }}>
            Séance continue — aucun tour enregistré.
          </div>
        )}
      </div>

      <div style={{ height: 2, background: INK }} />
      <div style={{ padding: '16px 18px 18px', background: SURF }}>
        <div style={kicker(MUTED)}>RÉPARTITION PAR ZONE</div>
        {a.zones.length ? a.zones.map((z) => (
          <div key={z.z} style={{
            display: 'grid', gridTemplateColumns: '28px 1fr 54px',
            alignItems: 'center', gap: 10, marginTop: 9,
          }}>
            <div style={{ font: '700 11px/1 Archivo' }}>{z.z}</div>
            <div style={{ height: 12, background: BAR }}>
              <div style={{
                height: '100%', width: `${z.pct}%`,
                background: z.z === 'Z4' || z.z === 'Z5' ? RED : INK,
              }} />
            </div>
            <div style={{
              font: '600 10.5px/1 Archivo', color: 'var(--color-neutral-800)', textAlign: 'right',
            }}>{z.time}</div>
          </div>
        )) : (
          <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, marginTop: 10 }}>
            Pas de répartition par zone pour cette séance.
          </div>
        )}
      </div>

      <div style={{ height: 2, background: INK }} />
      <div style={{ padding: '16px 18px 22px' }}>
        <div style={kicker(MUTED)}>TON RESSENTI (RPE)</div>
        <div style={{ display: 'flex', marginTop: 11, border: RULE }} role="radiogroup" aria-label="RPE">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rpe}
              disabled={saving}
              onClick={() => setRpe(n)}
              style={button({
                flex: 1, minWidth: 0,
                borderRight: '1px solid color-mix(in srgb, var(--color-text) 30%, transparent)',
                background: n === rpe ? RED : 'transparent',
                color: n === rpe ? '#fff' : INK,
                font: '700 12px/1 Archivo', padding: '12px 0', textAlign: 'center',
              })}
            >{n}</button>
          ))}
        </div>
        <div style={{ font: '400 12px/1.5 Archivo', color: BODY, marginTop: 11, textWrap: 'pretty' }}>
          {rpeNote(rpe, a)}
        </div>

        <div style={{ marginTop: 15 }}>
          <div style={kicker(MUTED, 8.5)}>RÉALISATION</div>
          <div style={{ display: 'flex', border: RULE, marginTop: 8 }}>
            {[['complete', 'COMPLÈTE'], ['partial', 'PARTIELLE'], ['skipped', 'NON FAITE']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setCompletion(value)} disabled={saving}
                style={button({ flex: 1, padding: '11px 4px', borderRight: HAIR, background: completion === value ? INK : 'transparent', color: completion === value ? 'var(--color-bg)' : INK, font: '700 8.5px/1 Archivo' })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" role="checkbox" aria-checked={pain} onClick={() => setPain((value) => !value)}
          disabled={saving} style={button({ width: '100%', marginTop: 10, padding: 12, border: RULE, background: pain ? RED : 'transparent', color: pain ? '#fff' : INK, textAlign: 'left' })}>
          {pain ? '✓' : '○'} DOULEUR INHABITUELLE PENDANT OU APRÈS
        </button>

        <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={saving}
          aria-label="Note post-séance" placeholder="Note facultative…" rows={2}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, padding: 11, border: RULE, background: 'transparent', color: INK, font: '400 12px/1.4 Archivo', resize: 'vertical' }} />

        {feedbackOutcome && (
          <div role="status" style={{ marginTop: 12, padding: 12, background: SURF, borderLeft: `3px solid ${RED}`, font: '700 11.5px/1.45 Archivo' }}>
            PLAN ADAPTÉ — {feedbackOutcome.message}
          </div>
        )}
        {saveError && <div role="alert" style={{ color: RED, marginTop: 10, font: '600 11px/1.4 Archivo' }}>{saveError}</div>}
        <button
          type="button"
          onClick={validateFeedback}
          disabled={saving || !onValidateFeedback}
          style={button({
            marginTop: 14, width: '100%',
            background: currentFeedback ? INK : RED, color: '#fff',
            padding: 16, opacity: saving || !onValidateFeedback ? .45 : 1,
          })}
        >{saving ? 'ENREGISTREMENT…' : currentFeedback ? 'METTRE À JOUR LE RESSENTI' : 'VALIDER LA SÉANCE'}</button>
        {currentFeedback && (
          <div style={{ ...kicker(MUTED, 8.5), marginTop: 8, textAlign: 'center' }}>✓ SÉANCE VALIDÉE · RPE {currentFeedback.rpe}</div>
        )}
      </div>
      <div style={{ height: 74 }} />
    </div>
  );
}

/**
 * The RPE note reads the gap between what you felt and what the watch measured.
 * That disagreement is the whole point of asking — a high RPE on a light
 * session is the early signal that matters.
 */
function rpeNote(rpe, activity) {
  if (rpe <= 5) return RPE_NOTES.low;
  if (rpe <= 8) return RPE_NOTES.mid;
  if (activity.driftPct != null && activity.driftPct < 3) {
    return `RPE ${rpe} alors que la dérive cardiaque est restée sous les 3 % : la fatigue est nerveuse, pas cardiaque. Dors.`;
  }
  return RPE_NOTES.high;
}

function Section({ label }) {
  return (
    <div style={{ padding: '16px 18px 6px' }}>
      <div style={kicker(MUTED)}>{label}</div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: '92px 18px 0' }}>
      <div style={kicker(MUTED, 9.5)}>ANALYSE</div>
      <div style={{ ...title(27), marginTop: 7 }}>Rien à analyser</div>
      <div style={{ font: '400 12.5px/1.6 Archivo', color: MUTED_2, marginTop: 14, textWrap: 'pretty' }}>
        {children}
      </div>
    </div>
  );
}

function tabLabel(iso) {
  const d = new Date(iso);
  const j = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][d.getDay()];
  return `${j} ${String(d.getDate()).padStart(2, '0')}`;
}
