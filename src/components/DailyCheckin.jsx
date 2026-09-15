import { useId, useState } from 'react';
import {
  INK, RED, RED_TINT, GROUND, SURF, MUTED, MUTED_2, BODY, RULE,
  kicker, title, button,
} from '../lib/ui.js';
import {
  TIME_OPTIONS, FATIGUE_LABELS, SLEEP_LABELS, MOTIVATION_LABELS, STRESS_LABELS,
  LEGS_LABELS, SORENESS_LEVELS, BODY_AREAS, PAIN_MOMENTS, DESIRES,
  MAX_AVAILABLE_MINUTES, emptyAnswers, normalizeAnswers, validateAnswers,
} from '../data/checkin-model.js';
import { summaryLines } from '../data/checkin-explain.js';

/**
 * « Comment es-tu aujourd'hui ? », en moins de trente secondes.
 *
 * Huit écrans courts plutôt qu'un formulaire : sur un téléphone, une question à
 * la fois se répond en marchant, et une page de dix-huit champs ne se répond
 * pas du tout. Les six questions obligatoires passent en premier, les
 * facultatives sont regroupées sur un seul écran qu'on peut traverser sans rien
 * cocher.
 *
 * Le composant ne décide de rien et n'enregistre rien : il remonte les réponses
 * à chaque frappe (`onChange`, qui sert au brouillon) et la saisie terminée
 * (`onValidate`). Le calcul de la recommandation appartient au moteur, qui ne
 * connaît pas React.
 */
export const CHECKIN_STEPS = Object.freeze([
  { id: 'time', label: 'TEMPS' },
  { id: 'fatigue', label: 'FATIGUE' },
  { id: 'sleep', label: 'SOMMEIL' },
  { id: 'soreness', label: 'COURBATURES' },
  { id: 'motivation', label: 'MOTIVATION' },
  { id: 'pain', label: 'DOULEUR' },
  { id: 'extra', label: 'EN PLUS' },
  { id: 'review', label: 'RELECTURE' },
]);

const clampStep = (value) => Math.min(CHECKIN_STEPS.length - 1, Math.max(0, Number(value) || 0));

export default function DailyCheckin({
  date, initialAnswers, initialStep = 0, editing = false,
  onChange, onValidate, onClose, saveError = '',
}) {
  const [answers, setAnswers] = useState(() => normalizeAnswers(initialAnswers ?? emptyAnswers()));
  const [step, setStep] = useState(() => clampStep(initialStep));
  const headingId = useId();

  const current = CHECKIN_STEPS[step];
  const check = validateAnswers(answers);

  const update = (patch) => {
    const next = normalizeAnswers({ ...answers, ...patch });
    setAnswers(next);
    onChange?.(next, step);
  };
  const go = (index) => {
    const next = clampStep(index);
    setStep(next);
    onChange?.(answers, next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      style={{
        position: 'absolute', inset: 0, zIndex: 120, background: GROUND,
        display: 'flex', flexDirection: 'column', fontFamily: 'Archivo, system-ui',
        color: INK, animation: 'rise .22s ease-out',
      }}
    >
      <header style={{ flex: 'none', padding: '52px 18px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={kicker(MUTED, 9.5)}>
              ÉTAPE {step + 1} SUR {CHECKIN_STEPS.length} · {current.label}
            </div>
            <div id={headingId} style={{ ...title(26), marginTop: 7 }}>
              {editing ? 'Modifier mes réponses' : 'Comment es-tu aujourd’hui ?'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le questionnaire"
            style={button({
              flex: 'none', border: RULE, background: 'transparent', color: INK,
              font: '700 11px/1 Archivo', padding: '7px 9px',
            })}
          >✕</button>
        </div>

        {/* La progression est aussi une suite de segments : la barre seule ne
            dit rien à qui ne la voit pas. */}
        <div
          aria-hidden="true"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${CHECKIN_STEPS.length}, 1fr)`, gap: 3, marginTop: 14 }}
        >
          {CHECKIN_STEPS.map((s, i) => (
            <div key={s.id} style={{ height: 3, background: i <= step ? RED : 'var(--color-neutral-300)' }} />
          ))}
        </div>
      </header>

      <div style={{ height: 2, background: INK }} />

      {saveError && (
        <div role="alert" style={{ padding: '10px 18px', background: RED_TINT, font: '600 11px/1.45 Archivo', color: INK }}>
          {saveError}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px 24px' }}>
        {current.id === 'time' && <TimeStep answers={answers} update={update} />}
        {current.id === 'fatigue' && (
          <ScaleStep
            question="Comment te sens-tu physiquement ?"
            hint="1, tu es frais. 5, tu es vidé."
            labels={FATIGUE_LABELS}
            value={answers.fatigue}
            onPick={(fatigue) => update({ fatigue })}
            name="fatigue"
          />
        )}
        {current.id === 'sleep' && <SleepStep answers={answers} update={update} />}
        {current.id === 'soreness' && <SorenessStep answers={answers} update={update} />}
        {current.id === 'motivation' && (
          <ScaleStep
            question="Quelle est ton envie de t’entraîner ?"
            hint="Une envie basse ne supprime jamais une séance à elle seule."
            labels={MOTIVATION_LABELS}
            value={answers.motivation}
            onPick={(motivation) => update({ motivation })}
            name="motivation"
          />
        )}
        {current.id === 'pain' && <PainStep answers={answers} update={update} />}
        {current.id === 'extra' && <ExtraStep answers={answers} update={update} />}
        {current.id === 'review' && <ReviewStep answers={answers} check={check} onJump={go} />}
      </div>

      <div style={{ flex: 'none', borderTop: RULE, padding: '12px 18px 30px', display: 'grid', gap: 9 }}>
        {step === CHECKIN_STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!check.ok}
            onClick={() => check.ok && onValidate?.(check.value)}
            style={button({
              width: '100%', background: check.ok ? RED : 'var(--color-neutral-300)',
              color: check.ok ? '#fff' : MUTED, padding: 17, letterSpacing: '.1em',
              cursor: check.ok ? 'pointer' : 'not-allowed',
            })}
          >VALIDER MES RÉPONSES</button>
        ) : (
          <button
            type="button"
            onClick={() => go(step + 1)}
            style={button({
              width: '100%', background: INK, color: GROUND, padding: 17, letterSpacing: '.1em',
            })}
          >SUIVANT</button>
        )}

        {step > 0 && (
          <button
            type="button"
            onClick={() => go(step - 1)}
            style={button({
              width: '100%', border: RULE, background: 'transparent', color: INK,
              padding: 14, letterSpacing: '.1em',
            })}
          >PRÉCÉDENT</button>
        )}
      </div>
    </div>
  );
}

/* ── Les briques ────────────────────────────────────────────────────────── */

function Question({ children, hint }) {
  return (
    <>
      <h2 style={{ ...title(20), margin: 0, textWrap: 'pretty' }}>{children}</h2>
      {hint && (
        <p style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, margin: '8px 0 0', textWrap: 'pretty' }}>
          {hint}
        </p>
      )}
    </>
  );
}

/**
 * Un choix.
 *
 * `aria-pressed` porte l'état : la sélection ne se lit pas qu'à la couleur, ce
 * qui la rend utilisable au clavier, au lecteur d'écran et en plein soleil.
 */
function Choice({ selected, onClick, children, detail }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={button({
        width: '100%', border: selected ? `2px solid ${RED}` : RULE,
        background: selected ? RED_TINT : GROUND, color: INK,
        padding: '15px 13px', display: 'flex', alignItems: 'baseline', gap: 9,
        font: '700 13px/1.2 Archivo', letterSpacing: '.02em',
      })}
    >
      <span aria-hidden="true" style={{ font: '800 12px/1 Archivo', color: selected ? RED : MUTED, minWidth: 14 }}>
        {selected ? '✓' : '·'}
      </span>
      <span>{children}</span>
      {detail && <span style={{ marginLeft: 'auto', font: '500 11px/1.2 Archivo', color: MUTED }}>{detail}</span>}
    </button>
  );
}

const grid = (columns = 1) => ({
  display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  gap: 8, marginTop: 16,
});

const labelStyle = {
  display: 'grid', gap: 6, color: INK, font: '700 10px/1.2 Archivo',
  letterSpacing: '.06em', marginTop: 16,
};
const inputStyle = {
  boxSizing: 'border-box', width: '100%', border: RULE, borderRadius: 0,
  padding: '12px 10px', background: GROUND, color: INK, font: '500 13px/1.2 Archivo',
};

function TimeStep({ answers, update }) {
  const id = useId();
  const listed = TIME_OPTIONS.some((option) => option.minutes === answers.availableMinutes);
  return (
    <>
      <Question hint="Le temps réel, porte à porte — pas le temps idéal.">
        Combien de temps as-tu réellement aujourd’hui ?
      </Question>
      <div style={grid(2)}>
        {TIME_OPTIONS.filter((option) => option.minutes > 0).map((option) => (
          <Choice
            key={option.id}
            selected={answers.availableMinutes === option.minutes}
            onClick={() => update({ availableMinutes: option.minutes })}
          >{option.label}</Choice>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Choice
          selected={answers.availableMinutes === 0}
          onClick={() => update({ availableMinutes: 0 })}
        >Indisponible aujourd’hui</Choice>
      </div>
      <label htmlFor={id} style={labelStyle}>
        AUTRE DURÉE, EN MINUTES
        <input
          id={id}
          type="number"
          min="0"
          max={MAX_AVAILABLE_MINUTES}
          value={!listed && answers.availableMinutes != null ? answers.availableMinutes : ''}
          onChange={(event) => update({
            availableMinutes: event.target.value === '' ? null : Number(event.target.value),
          })}
          style={inputStyle}
        />
      </label>
    </>
  );
}

function ScaleStep({ question, hint, labels, value, onPick, name }) {
  return (
    <>
      <Question hint={hint}>{question}</Question>
      <div style={grid(1)} role="group" aria-label={question}>
        {[1, 2, 3, 4, 5].map((note) => (
          <Choice
            key={`${name}-${note}`}
            selected={value === note}
            onClick={() => onPick(note)}
            detail={`${note} / 5`}
          >{`${note} — ${labels[note]}`}</Choice>
        ))}
      </div>
    </>
  );
}

function SleepStep({ answers, update }) {
  const id = useId();
  return (
    <>
      <ScaleStep
        question="Comment as-tu dormi ?"
        hint="La qualité ressentie, pas ce qu’affiche la montre."
        labels={SLEEP_LABELS}
        value={answers.sleepQuality}
        onPick={(sleepQuality) => update({ sleepQuality })}
        name="sleep"
      />
      <label htmlFor={id} style={labelStyle}>
        DURÉE DE SOMMEIL, EN MINUTES (FACULTATIF)
        <input
          id={id}
          type="number"
          min="0"
          max="1080"
          value={answers.sleepMinutes ?? ''}
          onChange={(event) => update({
            sleepMinutes: event.target.value === '' ? null : Number(event.target.value),
          })}
          style={inputStyle}
        />
      </label>
    </>
  );
}

function SorenessStep({ answers, update }) {
  const { level, areas } = answers.soreness;
  const toggle = (id) => update({
    soreness: {
      level,
      areas: areas.includes(id) ? areas.filter((a) => a !== id) : [...areas, id],
    },
  });

  return (
    <>
      <Question hint="Les courbatures ne sont pas une douleur : elles se travaillent autrement.">
        As-tu des courbatures ?
      </Question>
      <div style={grid(2)}>
        {SORENESS_LEVELS.map((option) => (
          <Choice
            key={option.id}
            selected={level === option.id}
            onClick={() => update({ soreness: { level: option.id, areas } })}
          >{option.label}</Choice>
        ))}
      </div>

      {level && level !== 'none' && (
        <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
          <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>QUELLES ZONES ?</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {BODY_AREAS.map((area) => (
              <Choice
                key={area.id}
                selected={areas.includes(area.id)}
                onClick={() => toggle(area.id)}
              >{area.label}</Choice>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function PainStep({ answers, update }) {
  const id = useId();
  const { pain } = answers;
  const set = (patch) => update({ pain: { ...pain, ...patch } });
  const toggleMoment = (moment) => set({
    moments: pain.moments.includes(moment)
      ? pain.moments.filter((m) => m !== moment)
      : [...pain.moments, moment],
  });

  return (
    <>
      <Question hint="Une douleur inhabituelle n’est pas une courbature. Ce questionnaire ne pose aucun diagnostic.">
        As-tu une douleur inhabituelle aujourd’hui ?
      </Question>
      <div style={grid(2)}>
        <Choice selected={!pain.present} onClick={() => set({ present: false })}>Non</Choice>
        <Choice selected={pain.present} onClick={() => set({ present: true })}>Oui</Choice>
      </div>

      {pain.present && (
        <>
          <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
            <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>OÙ ?</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {BODY_AREAS.map((area) => (
                <Choice
                  key={area.id}
                  selected={pain.area === area.id}
                  onClick={() => set({ area: area.id })}
                >{area.label}</Choice>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
            <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>INTENSITÉ, DE 1 À 10</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((note) => (
                <button
                  key={note}
                  type="button"
                  aria-pressed={pain.intensity === note}
                  aria-label={`Intensité ${note} sur 10`}
                  onClick={() => set({ intensity: note })}
                  style={button({
                    border: pain.intensity === note ? `2px solid ${RED}` : RULE,
                    background: pain.intensity === note ? RED_TINT : GROUND,
                    color: INK, padding: '13px 0', textAlign: 'center',
                    font: '800 13px/1 Archivo',
                  })}
                >{note}</button>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
            <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>QUAND APPARAÎT-ELLE ?</legend>
            <div style={{ display: 'grid', gap: 8 }}>
              {PAIN_MOMENTS.map((moment) => (
                <Choice
                  key={moment.id}
                  selected={pain.moments.includes(moment.id)}
                  onClick={() => toggleMoment(moment.id)}
                >{moment.label}</Choice>
              ))}
              <Choice
                selected={pain.limiting}
                onClick={() => set({ limiting: !pain.limiting })}
              >Elle me gêne dans les gestes du quotidien</Choice>
            </div>
          </fieldset>

          <label htmlFor={`${id}-kind`} style={labelStyle}>
            TYPE DE GÊNE (FACULTATIF)
            <input
              id={`${id}-kind`}
              value={pain.kind}
              placeholder="brûlure, tiraillement, point précis…"
              onChange={(event) => set({ kind: event.target.value })}
              style={inputStyle}
            />
          </label>

          <label htmlFor={`${id}-triggers`} style={labelStyle}>
            MOUVEMENTS QUI LA DÉCLENCHENT (FACULTATIF)
            <input
              id={`${id}-triggers`}
              value={pain.triggers.join(', ')}
              placeholder="descente, fente bulgare, box jump…"
              onChange={(event) => set({ triggers: event.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              style={inputStyle}
            />
            <span style={{ font: '400 10.5px/1.4 Archivo', color: MUTED, letterSpacing: 0 }}>
              Séparés par des virgules. Aucun mouvement nommé ici ne te sera proposé aujourd’hui.
            </span>
          </label>
        </>
      )}
    </>
  );
}

function ExtraStep({ answers, update }) {
  const id = useId();
  return (
    <>
      <Question hint="Tout est facultatif ici : tu peux passer directement à la relecture.">
        Quelques précisions, si tu as dix secondes
      </Question>

      <Compact
        legend="NIVEAU DE STRESS"
        labels={STRESS_LABELS}
        value={answers.stress}
        onPick={(stress) => update({ stress: answers.stress === stress ? null : stress })}
      />
      <Compact
        legend="SENSATION DE JAMBES"
        labels={LEGS_LABELS}
        value={answers.legs}
        onPick={(legs) => update({ legs: answers.legs === legs ? null : legs })}
      />

      <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
        <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>DE QUOI AS-TU ENVIE ?</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {DESIRES.map((desire) => (
            <Choice
              key={desire.id}
              selected={answers.desire === desire.id}
              onClick={() => update({ desire: answers.desire === desire.id ? null : desire.id })}
            >{desire.label}</Choice>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
        <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>PEUX-TU COURIR DEHORS ?</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <Choice selected={answers.outdoor === true} onClick={() => update({ outdoor: answers.outdoor === true ? null : true })}>Oui</Choice>
          <Choice selected={answers.outdoor === false} onClick={() => update({ outdoor: answers.outdoor === false ? null : false })}>Non</Choice>
        </div>
      </fieldset>

      <label htmlFor={`${id}-comment`} style={labelStyle}>
        COMMENTAIRE LIBRE (FACULTATIF)
        <textarea
          id={`${id}-comment`}
          value={answers.comment}
          maxLength={500}
          onChange={(event) => update({ comment: event.target.value })}
          style={{ ...inputStyle, minHeight: 74 }}
        />
      </label>
    </>
  );
}

/** Une échelle de 1 à 5 en une ligne — assez pour une question secondaire. */
function Compact({ legend, labels, value, onPick }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '22px 0 0' }}>
      <legend style={{ ...kicker(MUTED), marginBottom: 10 }}>{legend}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((note) => (
          <button
            key={note}
            type="button"
            aria-pressed={value === note}
            aria-label={`${legend.toLowerCase()} : ${note} sur 5, ${labels[note]}`}
            onClick={() => onPick(note)}
            style={button({
              border: value === note ? `2px solid ${RED}` : RULE,
              background: value === note ? RED_TINT : GROUND, color: INK,
              padding: '11px 0', textAlign: 'center', font: '800 13px/1 Archivo',
            })}
          >{note}</button>
        ))}
      </div>
      <p style={{ font: '400 10.5px/1.4 Archivo', color: MUTED, margin: '6px 0 0' }}>
        1 {labels[1]} · 5 {labels[5]}
      </p>
    </fieldset>
  );
}

const STEP_OF_FIELD = {
  availableMinutes: 0, fatigue: 1, sleepQuality: 2, sleepMinutes: 2,
  'soreness.level': 3, 'soreness.areas': 3, motivation: 4,
  'pain.area': 5, 'pain.intensity': 5, 'pain.moments': 5, comment: 6,
};

function ReviewStep({ answers, check, onJump }) {
  return (
    <>
      <Question hint="Relis, corrige si besoin, puis valide.">Ce que tu as répondu</Question>

      <div style={{ marginTop: 16, border: RULE, padding: 14, background: SURF }}>
        <div style={kicker(MUTED)}>DISPONIBILITÉ DU JOUR</div>
        <dl style={{ margin: '10px 0 0', display: 'grid', gap: 7 }}>
          {summaryLines(answers).map((line) => (
            <div key={line.label} style={{ display: 'flex', gap: 6, font: '500 12.5px/1.4 Archivo', color: BODY }}>
              <dt style={{ font: '700 12.5px/1.4 Archivo', color: INK }}>{line.label} :</dt>
              <dd style={{ margin: 0 }}>{line.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {!check.ok && (
        <div role="alert" style={{ marginTop: 14, border: `2px solid ${RED}`, padding: 12 }}>
          <div style={kicker(RED, 9.5)}>RÉPONSES INCOMPLÈTES</div>
          <ul style={{ margin: '9px 0 0', paddingLeft: 18, font: '500 12px/1.5 Archivo', color: INK }}>
            {Object.entries(check.errors).map(([field, message]) => (
              <li key={field} style={{ marginTop: 4 }}>
                {message}
                {STEP_OF_FIELD[field] != null && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => onJump(STEP_OF_FIELD[field])}
                      style={button({
                        border: 0, background: 'transparent', color: RED, padding: 0,
                        font: '700 12px/1.5 Archivo', textDecoration: 'underline',
                      })}
                    >Y aller</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ font: '400 11.5px/1.5 Archivo', color: MUTED_2, marginTop: 14, textWrap: 'pretty' }}>
        Ces réponses restent sur cet appareil. Elles servent à adapter la séance
        du jour et à suivre la tendance, jamais à poser un diagnostic.
      </p>
    </>
  );
}
