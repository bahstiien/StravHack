import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IOSStatusBar } from '../components/ios-frame.jsx';
import { RULE, button, kicker } from '../lib/ui.js';
import { createSignals, signalForPhase } from '../lib/signals.js';
import {
  createRun, tick, pause, resume, nextPhase, previousPhase, finishBlock,
  validateRound, recordPartial, addRecovery, substitute, reportPain,
  finish, abandon, view, buildResult,
} from '../data/workout-engine.js';

import { substitutesFor, validateDefinition } from '../data/workout-plan.js';
import { BODY_ZONES } from '../data/wod-movements.js';

/**
 * Le mode circuit guidé.
 *
 * L'écran ne sait pas ce qu'est un EMOM. Il demande au moteur où en est la
 * séance et affiche la réponse : c'est ce qui permet d'ajouter un format sans
 * toucher à ce fichier, et de tester le déroulé sans navigateur.
 *
 * Deux choses le distinguent des autres écrans de l'app :
 *
 *   Il tourne. Un intervalle de vingt secondes ne pardonne pas un rendu par
 *   seconde décalé d'une demi-seconde, donc on relit l'horloge quatre fois par
 *   seconde — et on redemande au moteur d'avancer à chaque fois, ce qui rattrape
 *   d'un coup un onglet resté en arrière-plan.
 *
 *   Il se lit à bout de bras. Le chronomètre et l'exercice en cours prennent la
 *   place ; tout le reste est petit, gris, et en bas.
 */

// Le panneau reprend la direction « carnet » de l'écran de séance : fond encre,
// texte papier — mêmes couleurs, mêmes règles de 2 px.
const PAPER = 'var(--color-bg)';
const DIM = 'var(--color-neutral-500)';
const SOFT = 'var(--color-neutral-300)';
const ACCENT = 'var(--color-accent)';
const ACCENT_LIGHT = 'var(--color-accent-400)';
const HAIR_ON_DARK = '1px solid color-mix(in srgb, var(--color-bg) 22%, transparent)';

const TICK_MS = 250;

/**
 * Arrêter la séance.
 *
 * Au dernier bloc, appuyer sur « terminer » veut dire « j'ai fini » ; avant,
 * ça veut dire « j'arrête ». Le bilan distingue les deux, donc il faut bien que
 * quelqu'un décide — et c'est l'endroit où on en sait le plus.
 */
const terminer = (definition, w) => (s, t) => (
  w?.isLastPhase ? finish(definition, s, t) : abandon(definition, s, t)
);

const mmss = (total) => {
  const s = Math.max(0, Math.round(total));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const KIND_LABELS = {
  decompte: 'Préparez-vous',
  liste: 'Échauffement',
  travail: 'Travail',
  recuperation: 'Récupération',
};

export default function GuidedSession({
  definition, resumeState, onClose, onFinished, repository,
}) {
  const invalide = useMemo(() => {
    const verdict = validateDefinition(definition);
    return verdict.ok ? null : verdict.errors[0];
  }, [definition]);

  const [state, setState] = useState(resumeState ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [sheet, setSheet] = useState(null);
  const [answers, setAnswers] = useState({
    rpe: '', cardio: '', muscular: '', technique: '', comment: '',
  });
  const [saved, setSaved] = useState(null);

  const signals = useRef(null);
  if (!signals.current) signals.current = createSignals({ enabled: true });

  // ── L'horloge ─────────────────────────────────────────────────────────────
  const actif = state && (state.status === 'running' || state.status === 'countdown');

  useEffect(() => {
    if (!actif) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setState((s) => (s ? tick(definition, s, t) : s));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [actif, definition]);

  // Revenir sur l'onglet doit rattraper le temps passé ailleurs tout de suite,
  // sans attendre le prochain battement.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      setNow(t);
      setState((s) => (s ? tick(definition, s, t) : s));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [definition]);

  // ── La sauvegarde ─────────────────────────────────────────────────────────
  // On écrit AUSSI l'état terminé : c'est lui qui empêche une séance arrêtée
  // mais dont le bilan n'a pas été enregistré de réapparaître au prochain
  // lancement comme si elle était encore en cours. `loadRun` écarte les états
  // terminés, donc écrire revient ici à ne plus rien proposer.
  useEffect(() => {
    if (!state) return;
    repository.saveGuidedRun({ savedAt: Date.now(), definition, state })
      .then(() => setSaveError(''))
      .catch((error) => setSaveError(error.message));
  }, [definition, state, repository]);

  useEffect(() => () => signals.current?.close(), []);

  const w = state ? view(definition, state, now) : null;

  // ── Les signaux ───────────────────────────────────────────────────────────
  const lastPhaseId = useRef(null);
  useEffect(() => {
    if (!w || w.status !== 'running') return;
    if (lastPhaseId.current === w.phase?.id) return;
    // Le premier passage après le décompte compte aussi comme un départ.
    if (lastPhaseId.current !== null || w.sessionElapsedSeconds === 0) {
      const nom = signalForPhase(w.phase, { isLast: false });
      if (nom) signals.current.emit(nom);
    }
    lastPhaseId.current = w.phase?.id ?? null;
  }, [w?.phase?.id, w?.status]);

  const lastBeep = useRef(null);
  useEffect(() => {
    if (!w) return;
    const reste = w.displaySeconds;
    const compteARebours = w.phase?.mode === 'countdown' || w.status === 'countdown';
    const cle = `${w.phase?.id}-${reste}`;
    if (!compteARebours || reste > 3 || reste < 1 || lastBeep.current === cle) return;
    lastBeep.current = cle;
    signals.current.emit('compte');
  }, [w?.displaySeconds, w?.phase?.id, w?.status]);

  const finie = state?.status === 'finished' || state?.status === 'abandoned';
  useEffect(() => {
    if (finie) signals.current.emit('finSeance');
  }, [finie]);

  // ── Les commandes ─────────────────────────────────────────────────────────
  const agir = useCallback((fn) => {
    const t = Date.now();
    setNow(t);
    setState((s) => (s ? fn(s, t) : s));
  }, []);

  const commencer = () => {
    const t = Date.now();
    setNow(t);
    signals.current.setEnabled(soundOn);
    setState(createRun(definition, t));
  };

  async function enregistrer() {
    const resultat = buildResult(definition, state, {
      rpe: Number(answers.rpe) || null,
      cardio: Number(answers.cardio) || null,
      muscular: Number(answers.muscular) || null,
      technique: Number(answers.technique) || null,
      comment: answers.comment,
    });
    try {
      await repository.appendWorkoutResult(resultat);
      await repository.clearGuidedRun();
      setSaved(true);
      setSaveError('');
      onFinished?.(resultat);
    } catch (error) {
      setSaveError(error.message);
      setSaved(false);
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 120,
      background: 'var(--color-text)', color: PAPER,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Archivo, system-ui',
    }}>
      <div style={{ flex: 'none' }}><IOSStatusBar dark /></div>

      {invalide ? (
        <Invalide message={invalide} onClose={onClose} />
      ) : !state ? (
        <Preparation
          definition={definition}
          soundOn={soundOn}
          onSound={(v) => { setSoundOn(v); signals.current.setEnabled(v); }}
          onStart={commencer}
          onClose={onClose}
        />
      ) : finie ? (
        <Bilan
          definition={definition}
          state={state}
          answers={answers}
          onAnswers={setAnswers}
          onSave={enregistrer}
          saved={saved}
          saveError={saveError}
          onClose={onClose}
        />
      ) : (
        <Entrainement
          w={w}
          state={state}
          definition={definition}
          soundOn={soundOn}
          saveError={saveError}
          sheet={sheet}
          onSheet={setSheet}
          onSound={(v) => { setSoundOn(v); signals.current.setEnabled(v); }}
          agir={agir}
          onClose={onClose}
        />
      )}
    </div>
  );
}

/* ── Séance invalide ─────────────────────────────────────────────────────── */

function Invalide({ message, onClose }) {
  return (
    <div style={{ padding: '24px 18px' }} role="alert">
      <div style={kicker(ACCENT_LIGHT, 9.5)}>SÉANCE INVALIDE</div>
      <div style={{ font: '800 26px/1.1 Archivo', marginTop: 10 }}>Impossible de la lancer</div>
      <div style={{ font: '400 13px/1.6 Archivo', color: SOFT, marginTop: 12, textWrap: 'pretty' }}>
        {message} Le chronomètre ne peut pas suivre une séance dont les durées ne
        tombent pas juste : mieux vaut ne rien lancer que compter faux.
      </div>
      <button type="button" onClick={onClose} style={button({
        marginTop: 20, width: '100%', border: `2px solid ${PAPER}`,
        background: 'transparent', color: PAPER, padding: 15, letterSpacing: '.1em',
      })}>FERMER</button>
    </div>
  );
}

/* ── 1. Préparation ──────────────────────────────────────────────────────── */

function Preparation({ definition, soundOn, onSound, onStart, onClose }) {
  return (
    <>
      <TopBar label="AVANT DE COMMENCER" onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '4px 18px 16px' }}>
          <div style={{ font: '800 34px/1.05 Archivo', letterSpacing: '-.03em', textWrap: 'balance' }}>
            {definition.title}
          </div>
          <div style={{ font: '400 12.5px/1.5 Archivo', color: SOFT, marginTop: 10 }}>
            {definition.typeLabel}
            {definition.goalLabel && ` · ${definition.goalLabel}`}
            {definition.levelLabel && ` · ${definition.levelLabel}`}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: HAIR_ON_DARK, borderBottom: HAIR_ON_DARK }}>
          <Cell label="DURÉE PRÉVUE" value={`${Math.round(definition.plannedDurationSeconds / 60)} min`} border />
          <Cell label="INTENSITÉ CIBLE" value={`RPE ${definition.targetRpe.min}–${definition.targetRpe.max}`} />
        </div>

        <Section label="MATÉRIEL NÉCESSAIRE">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {definition.equipment.map((e) => (
              <span key={e} style={{
                border: HAIR_ON_DARK, padding: '5px 8px',
                font: '600 10px/1 Archivo', letterSpacing: '.06em', color: SOFT,
              }}>{String(e).toUpperCase()}</span>
            ))}
          </div>
        </Section>

        <Section label="LES BLOCS">
          {definition.blocks.map((b) => (
            <div key={b.id} style={{
              display: 'grid', gridTemplateColumns: '58px 1fr', gap: 11,
              padding: '10px 0', borderBottom: HAIR_ON_DARK, alignItems: 'baseline',
            }}>
              <span style={{ font: '800 13px/1 Archivo', color: ACCENT_LIGHT }}>
                {Math.round(b.durationSeconds / 60)}′
              </span>
              <span>
                <span style={{ font: '700 13px/1.3 Archivo' }}>{b.name}</span>
                {b.stations.length > 0 && (
                  <span style={{ display: 'block', font: '400 11px/1.45 Archivo', color: DIM, marginTop: 3 }}>
                    {b.stations.map((st) => st.name).join(' · ')}
                  </span>
                )}
              </span>
            </div>
          ))}
        </Section>

        {definition.safety?.length > 0 && (
          <Section label="SÉCURITÉ">
            {definition.safety.map((s) => (
              <div key={s} style={{ font: '400 11.5px/1.55 Archivo', color: SOFT, marginTop: 7, textWrap: 'pretty' }}>
                {s}
              </div>
            ))}
          </Section>
        )}

        <div style={{ padding: '18px 18px 0' }}>
          <SoundToggle on={soundOn} onChange={onSound} />
          <div style={{ font: '400 10.5px/1.5 Archivo', color: DIM, marginTop: 10, textWrap: 'pretty' }}>
            Garde l’écran allumé et l’application au premier plan : un onglet mis
            en veille par le téléphone n’émet plus de son. Le chronomètre, lui,
            rattrape le temps perdu au retour.
          </div>
        </div>

        <div style={{ padding: '18px 18px 34px' }}>
          <button type="button" onClick={onStart} style={button({
            width: '100%', background: ACCENT, color: '#fff', padding: 19,
            font: '800 15px/1 Archivo', letterSpacing: '.12em',
          })}>COMMENCER</button>
          <div style={{ font: '400 11px/1.5 Archivo', color: DIM, marginTop: 10 }}>
            Un décompte de 10 secondes précède le premier exercice.
          </div>
        </div>
      </div>
    </>
  );
}

/* ── 2. Entraînement ─────────────────────────────────────────────────────── */

function Entrainement({
  w, state, definition, soundOn, saveError, sheet, onSheet, onSound, agir, onClose,
}) {
  const enPause = w.status === 'paused';
  const enDecompte = w.status === 'countdown';
  const transition = w.phase?.kind === 'recuperation' && w.block?.kind === 'recuperation';

  return (
    <>
      <TopBar
        label={`${w.block?.name ?? ''}${w.formatLabel && w.block?.kind === 'wod' ? ` · ${w.formatLabel}` : ''}`}
        onClose={() => agir(terminer(definition, w))}
        closeLabel="Terminer la séance"
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <p role="status" aria-live="polite" className="sr-only">
          {enDecompte
            ? `Départ dans ${w.displaySeconds} secondes.`
            : `${w.block?.name}. ${KIND_LABELS[w.phase?.kind] ?? ''}${w.round ? `, tour ${w.round}` : ''}. `
              + `${w.station ? `${w.station.name}, ${w.station.volume}.` : ''}`}
        </p>

        {transition ? (
          <Transition w={w} state={state} definition={definition} agir={agir} />
        ) : (
          <Chrono w={w} enDecompte={enDecompte} />
        )}

        <Progression w={w} />

        <Commandes
          w={w}
          definition={definition}
          enPause={enPause}
          agir={agir}
          onSheet={onSheet}
        />

        {saveError && (
          <div role="status" style={{
            margin: '0 18px 12px', border: `2px solid ${ACCENT_LIGHT}`, padding: '9px 11px',
            font: '400 11px/1.5 Archivo', color: SOFT, textWrap: 'pretty',
          }}>
            {saveError} La séance continue, mais elle ne pourra pas être reprise
            après une fermeture.
          </div>
        )}

        <div style={{ padding: '0 18px 28px' }}>
          <SoundToggle on={soundOn} onChange={onSound} />
        </div>
      </div>

      {enPause && (
        <PauseOverlay definition={definition} w={w} agir={agir} />
      )}

      {sheet === 'substitute' && (
        <SubstituteSheet
          w={w}
          definition={definition}
          onClose={() => onSheet(null)}
          onPick={(candidat) => {
            agir((s) => substitute(definition, s, {
              blockId: w.block.id, stationId: w.station.id, to: candidat,
            }));
            onSheet(null);
          }}
        />
      )}

      {sheet === 'pain' && (
        <PainSheet
          w={w}
          definition={definition}
          onClose={() => onSheet(null)}
          onReport={({ zone, intensity, action }) => {
            agir((s, t) => {
              const enPause2 = pause(s, t);
              const note = reportPain(definition, enPause2, t, { zone, intensity });
              return action === 'stop-block' ? finishBlock(definition, note, t) : note;
            });
            onSheet(null);
          }}
          onSubstitute={() => onSheet('substitute')}
        />
      )}
    </>
  );
}

/** Le chronomètre et l'exercice en cours — les deux éléments dominants. */
function Chrono({ w, enDecompte }) {
  const enRecup = w.phase?.kind === 'recuperation';
  const couleur = enRecup ? ACCENT_LIGHT : PAPER;

  return (
    <div style={{ padding: '10px 18px 6px' }}>
      <div style={{ ...kicker(enRecup ? ACCENT_LIGHT : DIM, 10) }}>
        {enDecompte ? 'DÉPART DANS' : (KIND_LABELS[w.phase?.kind] ?? '').toUpperCase()}
        {w.round && w.roundsTotal ? ` · ${w.round} / ${w.roundsTotal}` : ''}
      </div>

      <div
        role="timer"
        aria-live="off"
        aria-label={`Temps ${enDecompte ? 'avant le départ' : 'de la phase'} : ${mmss(w.displaySeconds)}`}
        style={{
          font: '800 76px/0.95 Archivo', letterSpacing: '-.045em',
          color: couleur, marginTop: 6, fontVariantNumeric: 'tabular-nums',
        }}
      >{mmss(w.displaySeconds)}</div>

      {enDecompte ? (
        <div style={{ font: '400 13px/1.5 Archivo', color: SOFT, marginTop: 12, textWrap: 'pretty' }}>
          Mets-toi en place. Le premier exercice est
          {' '}<strong style={{ color: PAPER }}>{w.station?.name ?? w.stations[0]?.name ?? w.block?.name}</strong>.
        </div>
      ) : (
        <>
          {w.station ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ font: '800 27px/1.1 Archivo', letterSpacing: '-.02em', textWrap: 'balance' }}>
                {w.station.name}
              </div>
              <div style={{ font: '700 15px/1.3 Archivo', color: ACCENT_LIGHT, marginTop: 7 }}>
                {w.station.volume}
                {w.station.charge && w.station.charge !== '—' && ` · ${w.station.charge}`}
              </div>
              {w.station.substituted && (
                <div style={{ font: '600 10px/1 Archivo', letterSpacing: '.08em', color: DIM, marginTop: 7 }}>
                  REMPLACE {w.station.substitutedFrom.toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
              {w.stations.map((st) => (
                <li key={st.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  padding: '8px 0', borderBottom: HAIR_ON_DARK, alignItems: 'baseline',
                }}>
                  <span style={{ font: '700 15px/1.25 Archivo' }}>{st.name}</span>
                  <span style={{ font: '700 13px/1 Archivo', color: ACCENT_LIGHT, flex: 'none' }}>{st.volume}</span>
                </li>
              ))}
            </ol>
          )}

          {w.nextStation && (
            <div style={{ font: '400 12px/1.4 Archivo', color: DIM, marginTop: 14 }}>
              Prochain : <span style={{ color: SOFT }}>{w.nextStation.name} · {w.nextStation.volume}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** L'écran de fin de bloc : ce qui vient d'être fait, ce qui arrive. */
function Transition({ w, state, definition, agir }) {
  const precedent = definition.blocks[w.blockIndex - 1];
  const suivant = definition.blocks[w.blockIndex + 1];
  const tours = precedent ? (state.rounds[precedent.id] || 0) : 0;
  const partiel = precedent ? state.partialReps[precedent.id] : null;

  return (
    <div style={{ padding: '10px 18px 6px' }}>
      <div style={kicker(ACCENT_LIGHT, 10)}>
        {precedent ? `${precedent.name.toUpperCase()} TERMINÉ` : 'RÉCUPÉRATION'}
      </div>

      {precedent && tours > 0 && (
        <div style={{ font: '800 21px/1.15 Archivo', marginTop: 8 }}>
          {tours} tour{tours > 1 ? 's' : ''}
          {partiel ? ` + ${partiel} répétitions` : ''}
        </div>
      )}

      <div style={{
        font: '800 76px/0.95 Archivo', letterSpacing: '-.045em',
        color: ACCENT_LIGHT, marginTop: 10, fontVariantNumeric: 'tabular-nums',
      }}>{mmss(w.displaySeconds)}</div>

      {precedent && (
        <PartialReps
          blockId={precedent.id}
          format={precedent.format}
          value={partiel}
          agir={agir}
          definition={definition}
        />
      )}

      {suivant && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: HAIR_ON_DARK }}>
          <div style={kicker(DIM, 8.5)}>PROCHAIN</div>
          <div style={{ font: '800 19px/1.2 Archivo', marginTop: 7 }}>{suivant.name}</div>
          {suivant.stations.length > 0 && (
            <div style={{ font: '400 11.5px/1.45 Archivo', color: SOFT, marginTop: 6, textWrap: 'pretty' }}>
              {suivant.stations.map((st) => st.name).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Les répétitions du tour entamé, saisies juste après l'AMRAP.
 *
 * C'est le seul moment où elles sont encore en tête. Elles ne valent pas un
 * tour de plus : le bilan les affiche à part.
 */
function PartialReps({ blockId, format, value, agir, definition }) {
  const [reps, setReps] = useState(value != null ? String(value) : '');
  if (format !== 'amrap') return null;

  return (
    <label style={{ display: 'block', marginTop: 16 }}>
      <div style={{ ...kicker(DIM, 8.5), marginBottom: 7 }}>RÉPÉTITIONS DU TOUR ENTAMÉ</div>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={reps}
        onChange={(e) => {
          setReps(e.target.value);
          agir((s, t) => recordPartial(definition, s, t, Number(e.target.value), blockId));
        }}
        placeholder="0"
        style={{
          width: '100%', boxSizing: 'border-box', border: `2px solid ${PAPER}`,
          background: 'transparent', color: PAPER, borderRadius: 0,
          font: '700 18px/1 Archivo', padding: '12px', outline: 'none',
        }}
      />
    </label>
  );
}

function Progression({ w }) {
  return (
    <div style={{ padding: '14px 18px 0' }}>
      <div style={{ height: 4, background: 'color-mix(in srgb, var(--color-bg) 22%, transparent)' }}>
        <div style={{ height: '100%', width: `${Math.round(w.progress * 100)}%`, background: ACCENT }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8,
        font: '600 10px/1.4 Archivo', letterSpacing: '.06em', color: DIM,
      }}>
        <span>
          SÉANCE {Math.floor(w.sessionElapsedSeconds / 60)} / {Math.round(w.sessionPlannedSeconds / 60)} MIN
        </span>
        <span>RPE CIBLE {w.targetRpe.min}–{w.targetRpe.max} / 10</span>
      </div>
      {w.validatedRounds > 0 && (
        <div style={{ font: '600 10px/1.4 Archivo', letterSpacing: '.06em', color: SOFT, marginTop: 5 }}>
          {w.validatedRounds} TOUR{w.validatedRounds > 1 ? 'S' : ''} VALIDÉ{w.validatedRounds > 1 ? 'S' : ''}
          {w.addedRecoverySeconds > 0 && ` · +${Math.round(w.addedRecoverySeconds / 60 * 10) / 10} MIN DE RÉCUP`}
        </div>
      )}
    </div>
  );
}

/** Les commandes — grandes, contrastées, atteignables en plein effort. */
function Commandes({ w, definition, enPause, agir, onSheet }) {
  const enDecompte = w.status === 'countdown';
  const validable = w.block?.kind === 'wod' && !enDecompte;

  return (
    <div style={{ padding: '16px 18px 12px', display: 'grid', gap: 9 }}>
      {validable && (
        <button
          type="button"
          onClick={() => agir((s, t) => validateRound(definition, s, t))}
          style={button({
            width: '100%', background: ACCENT, color: '#fff',
            padding: 20, font: '800 16px/1 Archivo', letterSpacing: '.12em',
          })}
        >{w.block.format === 'amrap' ? '1 TOUR' : 'VALIDER'}</button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <Cmd onClick={() => agir((s, t) => previousPhase(definition, s, t))}>‹ PRÉCÉDENT</Cmd>
        <Cmd onClick={() => agir((s, t) => nextPhase(definition, s, t))}>SUIVANT ›</Cmd>
        <Cmd onClick={() => agir((s, t) => addRecovery(definition, s, t, 30))}>+ 30 S RÉCUP</Cmd>
        <Cmd onClick={() => agir((s, t) => addRecovery(definition, s, t, 60))}>+ 60 S RÉCUP</Cmd>
        <Cmd
          onClick={() => onSheet('substitute')}
          disabled={!w.station}
        >REMPLACER</Cmd>
        <Cmd onClick={() => agir((s, t) => finishBlock(definition, s, t))}>TERMINER LE BLOC</Cmd>
      </div>

      <button
        type="button"
        onClick={() => agir((s, t) => (enPause ? resume(s, t) : pause(s, t)))}
        style={button({
          width: '100%', border: `2px solid ${PAPER}`, background: 'transparent', color: PAPER,
          padding: 16, font: '800 13px/1 Archivo', letterSpacing: '.12em',
        })}
      >{enPause ? 'REPRENDRE' : 'PAUSE'}</button>

      <button
        type="button"
        onClick={() => { agir((s, t) => pause(s, t)); onSheet('pain'); }}
        style={button({
          width: '100%', background: 'transparent', color: ACCENT_LIGHT,
          border: `2px solid ${ACCENT_LIGHT}`,
          padding: 13, font: '700 11px/1 Archivo', letterSpacing: '.12em',
        })}
      >SIGNALER UNE DOULEUR</button>
    </div>
  );
}

function Cmd({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={button({
        border: HAIR_ON_DARK, background: 'color-mix(in srgb, var(--color-bg) 10%, transparent)',
        color: disabled ? DIM : PAPER, padding: '15px 12px',
        font: '700 11px/1.2 Archivo', letterSpacing: '.08em',
        opacity: disabled ? 0.5 : 1, textAlign: 'left',
      })}
    >{children}</button>
  );
}

function PauseOverlay({ definition, w, agir }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Séance en pause"
      style={{
        position: 'absolute', inset: 0, zIndex: 130,
        background: 'color-mix(in srgb, var(--color-text) 92%, transparent)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 18px',
      }}
    >
      <div style={kicker(DIM, 10)}>SÉANCE EN PAUSE</div>
      <div style={{ font: '800 32px/1.05 Archivo', marginTop: 10 }}>Le temps est figé</div>
      <div style={{ font: '400 12.5px/1.55 Archivo', color: SOFT, marginTop: 10, textWrap: 'pretty' }}>
        Tout est conservé : le temps écoulé, le bloc, l’exercice, le tour, les
        tours validés, les remplacements et la récupération ajoutée.
      </div>

      <div style={{ display: 'grid', gap: 9, marginTop: 22 }}>
        <button type="button" onClick={() => agir((s, t) => resume(s, t))} style={button({
          width: '100%', background: ACCENT, color: '#fff', padding: 18,
          font: '800 14px/1 Archivo', letterSpacing: '.12em',
        })}>REPRENDRE MAINTENANT</button>

        <button type="button" onClick={() => agir((s, t) => resume(s, t, { withCountdown: true }))} style={button({
          width: '100%', border: `2px solid ${PAPER}`, background: 'transparent', color: PAPER,
          padding: 16, font: '700 12px/1 Archivo', letterSpacing: '.12em',
        })}>REPRENDRE AVEC UN DÉCOMPTE DE 10 S</button>

        <button type="button" onClick={() => agir(terminer(definition, w))} style={button({
          width: '100%', background: 'transparent', color: ACCENT_LIGHT,
          border: `2px solid ${ACCENT_LIGHT}`, padding: 14,
          font: '700 11px/1 Archivo', letterSpacing: '.12em',
        })}>TERMINER LA SÉANCE</button>
      </div>
    </div>
  );
}

/* ── Tiroirs ─────────────────────────────────────────────────────────────── */

function Sheet({ title, kickerText, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 130,
        background: 'color-mix(in srgb, var(--color-text) 70%, transparent)',
      }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 140,
          background: PAPER, color: 'var(--color-text)', borderTop: RULE,
          padding: '18px 18px 40px', maxHeight: '82%', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={kicker('var(--color-neutral-600)', 9)}>{kickerText}</div>
            <div style={{ font: '800 21px/1.15 Archivo', marginTop: 8 }}>{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={button({
            flex: 'none', border: RULE, background: 'transparent',
            font: '700 11px/1 Archivo', padding: '8px 10px', color: 'var(--color-text)',
          })}>✕</button>
        </div>
        <div style={{ height: 2, background: 'var(--color-text)', margin: '14px 0' }} />
        {children}
      </div>
    </>
  );
}

function SubstituteSheet({ w, definition, onClose, onPick }) {
  const candidats = useMemo(() => substitutesFor({
    station: w.station,
    equipment: definition.equipmentIds || [],
    zones: definition.constraintZones || [],
    level: definition.level || 'intermediaire',
  }), [w.station, definition]);

  return (
    <Sheet kickerText="REMPLACER" title={w.station?.name ?? 'Exercice'} onClose={onClose}>
      <div style={{ font: '400 12px/1.55 Archivo', color: 'var(--color-neutral-900)', textWrap: 'pretty' }}>
        Même chaîne musculaire, matériel réellement disponible, contraintes
        respectées. Le volume, la durée et le format du bloc ne changent pas —
        seul le geste change, et seulement pour cette séance.
      </div>

      {candidats.length === 0 ? (
        <div style={{ font: '400 12.5px/1.6 Archivo', color: 'var(--color-neutral-700)', marginTop: 16 }}>
          Aucun remplacement compatible avec ce matériel et ces contraintes.
          Utilise la variante plus facile de l’exercice, ou passe au suivant.
        </div>
      ) : candidats.map((c) => (
        <button
          key={c.movementId}
          type="button"
          onClick={() => onPick(c)}
          style={button({
            width: '100%', marginTop: 12, border: RULE, background: 'transparent',
            color: 'var(--color-text)', padding: '13px 13px',
          })}
        >
          <span style={{ display: 'block', font: '700 14px/1.25 Archivo' }}>{c.name}</span>
          <span style={{
            display: 'block', font: '600 9.5px/1 Archivo', letterSpacing: '.08em',
            color: 'var(--color-neutral-600)', marginTop: 6,
          }}>{c.groupLabels.join(' · ').toUpperCase()}</span>
        </button>
      ))}
    </Sheet>
  );
}

function PainSheet({ w, onClose, onReport, onSubstitute }) {
  const [zone, setZone] = useState('');
  const [intensity, setIntensity] = useState('');

  return (
    <Sheet kickerText="DOULEUR SIGNALÉE" title="La séance est en pause" onClose={onClose}>
      <div style={{ font: '400 12px/1.55 Archivo', color: 'var(--color-neutral-900)', textWrap: 'pretty' }}>
        Ce qui est saisi ici est noté dans le bilan, rien de plus : l’application
        ne pose pas de diagnostic et ne remplace pas un avis médical.
      </div>

      <div style={{ ...kicker('var(--color-neutral-600)', 8.5), margin: '16px 0 8px' }}>ZONE CONCERNÉE</div>
      <div role="radiogroup" aria-label="Zone concernée" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {BODY_ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            role="radio"
            aria-checked={zone === z.id}
            onClick={() => setZone(z.id)}
            style={button({
              border: RULE, padding: '9px 11px',
              background: zone === z.id ? 'var(--color-text)' : 'transparent',
              color: zone === z.id ? PAPER : 'var(--color-text)',
              font: '700 10.5px/1 Archivo', letterSpacing: '.06em',
            })}
          >{z.label.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ ...kicker('var(--color-neutral-600)', 8.5), margin: '16px 0 8px' }}>INTENSITÉ RESSENTIE / 10</div>
      <div role="radiogroup" aria-label="Intensité ressentie" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={Number(intensity) === n}
            onClick={() => setIntensity(n)}
            style={button({
              border: RULE, width: 36, padding: '9px 0', textAlign: 'center',
              background: Number(intensity) === n ? 'var(--color-accent)' : 'transparent',
              color: Number(intensity) === n ? '#fff' : 'var(--color-text)',
              font: '700 12px/1 Archivo',
            })}
          >{n}</button>
        ))}
      </div>

      <div style={{
        marginTop: 16, font: '400 11.5px/1.5 Archivo',
        color: 'var(--color-neutral-700)', textWrap: 'pretty',
      }}>
        Mouvement en cours : <strong style={{ color: 'var(--color-text)' }}>{w.station?.name ?? w.block?.name}</strong>.
      </div>

      <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
        <button type="button" disabled={!zone} onClick={() => { onReport({ zone, intensity, action: 'substitute' }); onSubstitute(); }} style={button({
          width: '100%', background: zone ? 'var(--color-text)' : 'var(--color-neutral-400)',
          color: PAPER, padding: 15, letterSpacing: '.1em',
        })}>NOTER ET REMPLACER L’EXERCICE</button>
        <button type="button" disabled={!zone} onClick={() => onReport({ zone, intensity, action: 'stop-block' })} style={button({
          width: '100%', border: RULE, background: 'transparent',
          color: 'var(--color-accent-700)', padding: 14, letterSpacing: '.1em',
          opacity: zone ? 1 : 0.5,
        })}>NOTER ET ARRÊTER CE BLOC</button>
      </div>
    </Sheet>
  );
}

/* ── 3. Bilan ────────────────────────────────────────────────────────────── */

function Bilan({ definition, state, answers, onAnswers, onSave, saved, saveError, onClose }) {
  const res = useMemo(() => buildResult(definition, state, {}), [definition, state]);
  const set = (patch) => onAnswers({ ...answers, ...patch });

  return (
    <>
      <TopBar label={res.status === 'abandoned' ? 'SÉANCE ARRÊTÉE' : 'SÉANCE TERMINÉE'} onClose={onClose} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '4px 18px 16px' }}>
          <div style={{ font: '800 34px/1.05 Archivo', letterSpacing: '-.03em' }}>{res.title}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: HAIR_ON_DARK, borderBottom: HAIR_ON_DARK }}>
          <Cell label="PRÉVU" value={`${Math.round(res.plannedDurationSeconds / 60)} min`} border />
          <Cell label="RÉALISÉ" value={`${Math.round(res.actualDurationSeconds / 60)} min`} />
        </div>

        <Section label="LES BLOCS">
          {res.blocks.map((b) => (
            <div key={b.id} style={{ padding: '10px 0', borderBottom: HAIR_ON_DARK }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ font: '700 13.5px/1.25 Archivo', color: b.reached ? PAPER : DIM }}>{b.name}</span>
                <span style={{ font: '700 12px/1 Archivo', color: b.reached ? ACCENT_LIGHT : DIM, flex: 'none' }}>
                  {b.reached ? (b.score ?? '—') : 'non abordé'}
                </span>
              </div>
            </div>
          ))}
        </Section>

        <Section label="CE QUI A CHANGÉ">
          <Ligne k="WOD terminés" v={`${res.completedWods}`} />
          <Ligne k="Récupération ajoutée" v={res.addedRecoverySeconds ? `${Math.round(res.addedRecoverySeconds / 60 * 10) / 10} min` : 'aucune'} />
          <Ligne k="Blocs non abordés" v={res.skippedBlocks.length ? `${res.skippedBlocks.length}` : 'aucun'} />
          {res.substitutions.map((sub) => (
            <Ligne key={sub.stationId} k="Exercice remplacé" v={`${sub.fromName} → ${sub.toName}`} />
          ))}
          {res.pains.map((p, i) => (
            <Ligne key={i} k="Douleur signalée" v={`${p.zone}${p.intensity ? ` · ${p.intensity}/10` : ''}${p.movementName ? ` · sur ${p.movementName}` : ''}`} />
          ))}
        </Section>

        <Section label="COMMENT C’ÉTAIT">
          <Echelle label="RPE GÉNÉRAL" value={answers.rpe} onChange={(rpe) => set({ rpe })} />
          <Echelle label="DIFFICULTÉ CARDIO" value={answers.cardio} onChange={(cardio) => set({ cardio })} />
          <Echelle label="DIFFICULTÉ MUSCULAIRE" value={answers.muscular} onChange={(muscular) => set({ muscular })} />
          <Echelle label="QUALITÉ TECHNIQUE" value={answers.technique} onChange={(technique) => set({ technique })} />

          <label style={{ display: 'block', marginTop: 16 }}>
            <div style={{ ...kicker(DIM, 8.5), marginBottom: 7 }}>COMMENTAIRE</div>
            <input
              value={answers.comment}
              onChange={(e) => set({ comment: e.target.value })}
              placeholder="jambes lourdes, charge trop légère…"
              style={{
                width: '100%', boxSizing: 'border-box', border: `2px solid ${PAPER}`,
                background: 'transparent', color: PAPER, borderRadius: 0,
                font: '400 13px/1.2 Archivo', padding: '12px', outline: 'none',
              }}
            />
          </label>
        </Section>

        <div style={{ padding: '18px 18px 34px' }}>
          {saved ? (
            <>
              <div role="status" style={{
                border: `2px solid ${PAPER}`, padding: '13px 13px',
                font: '700 12px/1.4 Archivo', letterSpacing: '.06em',
              }}>✓ BILAN ENREGISTRÉ</div>
              <button type="button" onClick={onClose} style={button({
                marginTop: 9, width: '100%', border: `2px solid ${PAPER}`,
                background: 'transparent', color: PAPER, padding: 15, letterSpacing: '.1em',
              })}>FERMER</button>
            </>
          ) : (
            <button type="button" onClick={onSave} style={button({
              width: '100%', background: ACCENT, color: '#fff', padding: 18,
              font: '800 14px/1 Archivo', letterSpacing: '.12em',
            })}>ENREGISTRER LE BILAN</button>
          )}

          {saveError && (
            <div role="alert" style={{
              marginTop: 12, border: `2px solid ${ACCENT_LIGHT}`, padding: '11px 12px',
              font: '400 11.5px/1.5 Archivo', color: SOFT, textWrap: 'pretty',
            }}>{saveError}</div>
          )}
        </div>
      </div>
    </>
  );
}

function Echelle({ label, value, onChange }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...kicker(DIM, 8.5), marginBottom: 8 }}>{label}</div>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={Number(value) === n}
            onClick={() => onChange(n)}
            style={button({
              border: HAIR_ON_DARK, width: 32, padding: '10px 0', textAlign: 'center',
              background: Number(value) === n ? ACCENT : 'transparent',
              color: PAPER, font: '700 12px/1 Archivo',
            })}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Briques communes ────────────────────────────────────────────────────── */

function TopBar({ label, onClose, closeLabel = 'Fermer' }) {
  return (
    <div style={{
      flex: 'none', padding: '4px 18px 12px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={kicker(DIM, 9.5)}>{label}</div>
      <button type="button" onClick={onClose} aria-label={closeLabel} style={button({
        flex: 'none', border: `2px solid ${PAPER}`, background: 'transparent',
        color: PAPER, font: '700 11px/1 Archivo', padding: '7px 9px',
      })}>✕</button>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '16px 18px 0' }}>
      <div style={{ ...kicker(DIM, 9), marginBottom: 10 }}>{label}</div>
      {children}
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

function Ligne({ k, v }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      padding: '9px 0', borderBottom: HAIR_ON_DARK, alignItems: 'baseline',
    }}>
      <span style={{ font: '600 10px/1.4 Archivo', letterSpacing: '.08em', color: DIM }}>{k.toUpperCase()}</span>
      <span style={{ font: '700 12.5px/1.3 Archivo', textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function SoundToggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={button({
        width: '100%', display: 'grid', gridTemplateColumns: '22px 1fr', gap: 11,
        alignItems: 'center', border: HAIR_ON_DARK, background: 'transparent',
        color: PAPER, padding: '12px 13px',
      })}
    >
      <span style={{
        width: 16, height: 16, border: `2px solid ${PAPER}`,
        background: on ? PAPER : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text)', font: '700 10px/1 Archivo',
      }}>{on ? '✓' : ''}</span>
      <span style={{ font: '700 12px/1.2 Archivo', textAlign: 'left' }}>
        Signaux sonores et vibrations
      </span>
    </button>
  );
}
