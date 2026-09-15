import { useState } from 'react';
import { IOSStatusBar } from '../components/ios-frame.jsx';
import { RULE, button, kicker } from '../lib/ui.js';
import { dateLong, fmtNum } from '../data/model.js';
import { pushToWatch } from '../data/provider.js';
import PlanningActions from '../components/PlanningActions.jsx';

// The session detail is the dark panel from the design's "carnet" direction:
// ink ground, display-size title, the run-through as a numbered list, and the
// one action that leaves the app — pushing the workout to the watch.

const PAPER = 'var(--color-bg)';
const DIM = 'var(--color-neutral-500)';
const SOFT = 'var(--color-neutral-300)';
const HAIR_ON_DARK = '1px solid color-mix(in srgb, var(--color-bg) 25%, transparent)';

export default function SessionScreen({
  session, onClose, onAnalyse, onOpenExercise, onStartGuided,
  planningActions, dateOptions, canRestore, canUndo, initialAction = null,
  checkin = null, onOpenCheckin = null,
}) {
  const [push, setPush] = useState({ state: 'idle', message: '' });
  if (!session) return null;

  const canPush = session.type !== 'REPOS' && !session.done;
  // Une séance de PPG à venir peut se dérouler en mode guidé : elle a la liste
  // d'exercices qu'il faut pour ça. Une sortie en trail ne l'a pas — on ne
  // propose donc pas le bouton plutôt que de le proposer sans rien derrière.
  const canGuide = Boolean(onStartGuided) && !session.done
    && session.type === 'PPG' && session.ppgExercises?.length > 0;

  async function send() {
    setPush({ state: 'sending', message: '' });
    const res = await pushToWatch(session);
    setPush({ state: res.ok ? 'done' : 'error', message: res.message });
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: 'var(--color-text)', color: PAPER,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Archivo, system-ui',
      animation: 'rise .22s ease-out',
    }}>
      {/* The panel covers the whole screen, so it carries its own status bar —
          the frame's is dark-on-light and would vanish against this ground. */}
      <div style={{ flex: 'none' }}>
        <IOSStatusBar dark />
      </div>

      <div style={{
        flex: 'none', padding: '4px 18px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ ...kicker(DIM, 9.5) }}>
          {session.type} · {dateLong(session.date)}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={button({
            flex: 'none', border: `2px solid ${PAPER}`, background: 'transparent',
            color: PAPER, font: '700 11px/1 Archivo', padding: '7px 9px',
          })}
        >✕</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '8px 18px 16px' }}>
          <div style={{
            font: '800 38px/1.02 Archivo', letterSpacing: '-.03em', textWrap: 'balance',
          }}>{session.title}</div>
          {session.brief && (
            <div style={{ font: '400 13px/1.5 Archivo', color: SOFT, marginTop: 10, textWrap: 'pretty' }}>
              {session.brief}
            </div>
          )}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          borderTop: HAIR_ON_DARK, borderBottom: HAIR_ON_DARK,
        }}>
          <Cell label="DURÉE" value={session.durationLabel || durLabel(session)} border />
          <Cell label="D+" value={session.dplus ? `${fmtNum(session.dplus)} m` : '—'} border />
          <Cell label="CIBLE" value={session.zone || '—'} />
        </div>

        {session.steps?.length > 0 && (
          <>
            <div style={{ padding: '18px 18px 0' }}>
              <div style={kicker(DIM)}>DÉROULÉ</div>
            </div>
            {session.steps.map((st, n) => {
              // Sur une séance de PPG, chaque étape est un exercice de la
              // bibliothèque : on montre son visuel et on ouvre sa fiche.
              const exo = session.ppgExercises?.[n];
              const open = exo && onOpenExercise ? () => onOpenExercise(exo) : null;

              return (
                <div
                  key={st.i}
                  role={open ? 'button' : undefined}
                  tabIndex={open ? 0 : undefined}
                  onClick={open || undefined}
                  onKeyDown={open ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                  } : undefined}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: exo ? '34px 52px 1fr 14px' : '34px 1fr',
                    gap: 12,
                    padding: '13px 18px',
                    borderBottom: '1px solid color-mix(in srgb, var(--color-bg) 18%, transparent)',
                    alignItems: exo ? 'center' : 'baseline',
                    cursor: open ? 'pointer' : undefined,
                  }}
                >
                  <div style={{ font: '800 13px/1 Archivo', color: 'var(--color-accent-400)' }}>{st.i}</div>

                  {exo && <ExoThumb exercise={exo} />}

                  <div>
                    <div style={{ font: '700 14px/1.25 Archivo' }}>{st.label}</div>
                    {st.detail && (
                      <div style={{ font: '400 11.5px/1.4 Archivo', color: 'var(--color-neutral-400)', marginTop: 3 }}>
                        {st.detail}
                      </div>
                    )}
                    {exo && (
                      <div style={{
                        font: '600 8.5px/1 Archivo', letterSpacing: '.1em',
                        color: 'var(--color-accent-400)', marginTop: 6,
                      }}>{exo.cat}</div>
                    )}
                  </div>

                  {exo && (
                    <div style={{ font: '700 13px/1 Archivo', color: DIM, textAlign: 'right' }}>›</div>
                  )}
                </div>
              );
            })}
          </>
        )}

        <div style={{ padding: '20px 18px 34px' }}>
          {canGuide && (
            <button
              type="button"
              onClick={() => onStartGuided(session)}
              style={button({
                width: '100%', marginBottom: 9, background: PAPER, color: 'var(--color-text)',
                padding: 17, font: '800 14px/1 Archivo', letterSpacing: '.1em',
              })}
            >DÉMARRER LA SÉANCE</button>
          )}

          {session.done && session.activityId ? (
            <button
              type="button"
              onClick={() => onAnalyse(session.activityId)}
              style={button({
                width: '100%', background: 'var(--color-accent)', color: '#fff',
                padding: 17, letterSpacing: '.1em',
              })}
            >VOIR L’ANALYSE</button>
          ) : canPush ? (
            <button
              type="button"
              onClick={send}
              disabled={push.state === 'sending' || push.state === 'done'}
              style={button({
                width: '100%',
                background: push.state === 'done' ? 'transparent' : 'var(--color-accent)',
                border: push.state === 'done' ? `2px solid ${PAPER}` : 0,
                color: '#fff', padding: 17, letterSpacing: '.1em',
                opacity: push.state === 'sending' ? .6 : 1,
              })}
            >
              {push.state === 'sending' ? 'ENVOI…'
                : push.state === 'done' ? '✓ ENVOYÉE'
                  : 'ENVOYER SUR LA COROS'}
            </button>
          ) : null}

          {push.message && (
            <div style={{
              font: '400 11px/1.5 Archivo', marginTop: 12,
              color: push.state === 'error' ? 'var(--color-accent-400)' : SOFT,
            }}>{push.message}</div>
          )}

          {session.coach && !push.message && (
            <div style={{ font: '400 11px/1.5 Archivo', color: DIM, marginTop: 12 }}>
              {session.coach}
            </div>
          )}

          {onOpenCheckin && !session.done && (
            <CheckinAccess checkin={checkin} onOpen={onOpenCheckin} />
          )}

          {session.planned && session.load > 0 && planningActions && (
            <PlanningActions
              session={{ ...session, completed: session.done, durationMin: Math.round((session.durationSec || 0) / 60) }}
              dateOptions={dateOptions}
              canRestore={canRestore}
              canUndo={canUndo}
              initialAction={initialAction}
              {...planningActions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Le point du jour, depuis la fiche de la séance.
 *
 * Le panneau est sombre : la carte claire de l'écran Semaine y serait illisible.
 * On n'y met donc que l'essentiel — l'invitation, ou le rappel de ce qui a
 * été conclu, et un seul chemin vers le détail.
 */
function CheckinAccess({ checkin, onOpen }) {
  const statut = checkin?.recommendation?.statusLabel;
  return (
    <div style={{ borderTop: HAIR_ON_DARK, marginBottom: 18, paddingTop: 16 }}>
      <div style={kicker(DIM)}>{checkin ? 'POINT DU JOUR' : 'AVANT DE COMMENCER'}</div>
      <div style={{ font: '700 13px/1.4 Archivo', marginTop: 7, textWrap: 'pretty' }}>
        {checkin
          ? statut || 'Réponses enregistrées.'
          : 'Dis comment tu es aujourd’hui, et cette séance s’ajuste à ce que tu as réellement.'}
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={button({
          width: '100%', marginTop: 12, border: `2px solid ${PAPER}`,
          background: 'transparent', color: PAPER, padding: 14, letterSpacing: '.1em',
        })}
      >{checkin ? 'VOIR LE POINT DU JOUR' : 'FAIRE LE POINT'}</button>
    </div>
  );
}

/**
 * La vignette d'un exercice dans le déroulé.
 *
 * Fond clair sur le panneau sombre : les visuels du dataset sont détourés sur
 * blanc, les poser directement sur l'encre les rendrait illisibles.
 */
function ExoThumb({ exercise }) {
  const [failed, setFailed] = useState(false);
  const src = exercise.imageUrl || exercise.gifUrl;
  if (!src || failed) return <div style={{ width: 52, height: 52, background: 'var(--color-neutral-700)' }} />;

  return (
    <div style={{ width: 52, height: 52, background: '#fff', overflow: 'hidden' }}>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function Cell({ label, value, border }) {
  return (
    <div style={{ padding: '13px 0 13px 18px', borderRight: border ? HAIR_ON_DARK : undefined }}>
      <div style={kicker(DIM, 8.5)}>{label}</div>
      <div style={{ font: '800 19px/1 Archivo', marginTop: 6 }}>{value}</div>
    </div>
  );
}

function durLabel(session) {
  const sec = session.durationSec;
  if (!sec) return '—';
  return sec >= 3600
    ? `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
    : `${Math.round(sec / 60)}′`;
}
