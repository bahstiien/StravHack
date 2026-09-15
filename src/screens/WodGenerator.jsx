import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  INK, RED, RED_DEEP, SURF, MUTED, MUTED_2, BODY, RULE, HAIR, HAIR_SOFT,
  kicker, title, button,
} from '../lib/ui.js';
import {
  DURATIONS, SESSION_TYPES, LEVELS, GOALS, WOD_EQUIPMENT, BODY_ZONES,
  defaultWodParams, validateWodParams, generateWod, availableMovements,
  parseConstraintZones,
} from '../data/wod.js';
import { fromWodSession } from '../data/workout-plan.js';
import { wodParamsFromCheckin } from '../data/checkin-adapt.js';

/**
 * Le générateur de séances WOD.
 *
 * Tout ce que cet écran sait faire, c'est poser des questions et afficher une
 * réponse : la séance est composée par `data/wod.js`, qui ne connaît ni React
 * ni le DOM et qui est testé à part. Ici il n'y a donc aucune règle
 * d'entraînement — si une durée ne tombait pas juste, ce n'est pas ce fichier
 * qu'il faudrait corriger.
 *
 * Deux états seulement mènent à une séance affichée : « prêt » et « résultat ».
 * Un paramètre invalide ne lance rien, et une séance que le générateur juge
 * incohérente n'est pas affichée à moitié — elle devient un message d'erreur.
 */
export default function WodGenerator({ equipment, library, onStart, checkinAnswers = null }) {
  // Le point du jour, quand il existe, remplit le formulaire : la durée dont on
  // dispose vraiment, le matériel accessible aujourd'hui, les zones à épargner
  // et les mouvements déclarés douloureux. Tout reste modifiable — ce sont des
  // valeurs de départ, pas un verrou.
  const [params, setParams] = useState(() => (checkinAnswers
    ? wodParamsFromCheckin(defaultWodParams(equipment), checkinAnswers)
    : defaultWodParams(equipment)));
  const [phase, setPhase] = useState('form');
  const [session, setSession] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const resultRef = useRef(null);

  // La liste de matériel de l'app d'abord — c'est celle que l'utilisateur a
  // déjà remplie dans Réglages — puis ce que le CrossFit et le HYROX ajoutent
  // et qu'elle ne connaît pas.
  const equipmentList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const item of [...(library?.equipment || []), ...WOD_EQUIPMENT]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item.id === 'poids-du-corps'
        ? { ...item, label: 'Poids du corps / aucun matériel', always: true }
        : item);
    }
    return out.sort((a, b) => (a.always ? -1 : 0) - (b.always ? -1 : 0));
  }, [library]);

  const zonesDetectees = useMemo(
    () => parseConstraintZones(params.constraints),
    [params.constraints],
  );

  const disponibles = useMemo(() => availableMovements({
    role: 'wod',
    equipment: params.equipment,
    level: params.level,
    zones: zonesDetectees,
    avoid: [],
  }).length, [params.equipment, params.level, zonesDetectees]);

  // La génération est synchrone et rapide, mais elle passe quand même par un
  // état de chargement : c'est lui qui rend l'écran juste le jour où la séance
  // viendra d'ailleurs, et il évite qu'un double clic lance deux compositions.
  useEffect(() => {
    if (phase !== 'loading') return undefined;
    let vivant = true;
    const id = setTimeout(() => {
      if (!vivant) return;
      const res = generateWod(params);
      if (res.ok) {
        setSession(res.session);
        setFailure('');
        setPhase('result');
      } else {
        setSession(null);
        setFailure(res.error);
        setErrors(res.errors || {});
        setPhase('error');
      }
    }, 0);
    return () => { vivant = false; clearTimeout(id); };
  }, [phase, params]);

  // Une nouvelle séance arrive sous le formulaire : on amène le regard dessus,
  // sinon rien ne semble s'être passé sur un écran de téléphone.
  useEffect(() => {
    if (phase === 'result') resultRef.current?.focus({ preventScroll: false });
  }, [phase, session]);

  const set = (patch) => setParams((p) => ({ ...p, ...patch }));
  const setConstraint = (patch) => setParams((p) => ({ ...p, constraints: { ...p.constraints, ...patch } }));

  function submit(event) {
    event?.preventDefault();
    const check = validateWodParams(params);
    if (!check.ok) {
      setErrors(check.errors);
      setPhase('form');
      return;
    }
    setErrors({});
    setPhase('loading');
  }

  function regenerate() {
    setParams((p) => ({ ...p, seed: p.seed + 1 }));
    setPhase('loading');
  }

  const formVisible = phase !== 'result';

  return (
    <div>
      {formVisible && checkinAnswers && (
        <div style={{ background: SURF, borderBottom: RULE, padding: '13px 18px' }}>
          <div style={kicker(MUTED, 9)}>D’APRÈS TON POINT DU JOUR</div>
          <div style={{ font: '400 12px/1.55 Archivo', color: BODY, marginTop: 7, textWrap: 'pretty' }}>
            Durée, matériel et contraintes sont préremplis avec ce que tu as
            déclaré aujourd’hui. Rien n’est verrouillé : corrige ce qui a changé.
          </div>
        </div>
      )}

      {formVisible && (
        <form onSubmit={submit} noValidate>
          <Section label="DURÉE TOTALE" error={errors.durationMin}>
            <Choices
              name="Durée totale"
              options={DURATIONS.map((d) => ({ id: d, label: `${d} MIN` }))}
              value={params.durationMin}
              onChange={(durationMin) => set({ durationMin })}
              columns={5}
            />
          </Section>

          <Section label="TYPE DE SÉANCE" error={errors.type}>
            <Choices
              name="Type de séance"
              options={SESSION_TYPES}
              value={params.type}
              onChange={(type) => set({ type })}
              columns={2}
            />
          </Section>

          <Section label="NIVEAU" error={errors.level}>
            <Choices
              name="Niveau"
              options={LEVELS}
              value={params.level}
              onChange={(level) => set({ level })}
              columns={3}
            />
          </Section>

          <Section label="OBJECTIF" error={errors.goal}>
            <Choices
              name="Objectif"
              options={GOALS}
              value={params.goal}
              onChange={(goal) => set({ goal })}
              columns={2}
            />
          </Section>

          <EquipmentPicker
            items={equipmentList}
            value={params.equipment}
            onChange={(next) => set({ equipment: next })}
            error={errors.equipment}
            count={disponibles}
          />

          <Section label="CONTRAINTES (FACULTATIF)">
            <div style={{ font: '400 11.5px/1.5 Archivo', color: MUTED_2, marginBottom: 10, textWrap: 'pretty' }}>
              Écris en clair. Une zone nommée ici est retirée de la séance, y
              compris des mouvements qui la chargent sans la viser.
            </div>
            <Text
              label="Douleurs"
              value={params.constraints.pain}
              onChange={(pain) => setConstraint({ pain })}
              placeholder="genou droit sensible en descente…"
            />
            <Text
              label="Blessures"
              value={params.constraints.injuries}
              onChange={(injuries) => setConstraint({ injuries })}
              placeholder="entorse de cheville il y a six semaines…"
            />
            <Text
              label="Mouvements ou zones à éviter"
              value={params.constraints.avoid}
              onChange={(avoid) => setConstraint({ avoid })}
              placeholder="box jump, burpees…"
            />
            {zonesDetectees.length > 0 && (
              <div style={{
                marginTop: 10, padding: '9px 11px', border: HAIR_SOFT, background: SURF,
                font: '400 11px/1.5 Archivo', color: BODY,
              }}>
                Zones épargnées : <strong>{zonesDetectees
                  .map((z) => BODY_ZONES.find((b) => b.id === z)?.label ?? z)
                  .join(', ').toLowerCase()}</strong>.
              </div>
            )}
          </Section>

          {phase === 'error' && (
            <div
              role="alert"
              style={{
                margin: '0 18px', border: `2px solid ${RED_DEEP}`, padding: '12px 13px',
                font: '400 12px/1.5 Archivo', color: BODY, textWrap: 'pretty',
              }}
            >
              <div style={{ ...kicker(RED_DEEP, 8.5), marginBottom: 6 }}>GÉNÉRATION IMPOSSIBLE</div>
              {failure}
            </div>
          )}

          <div style={{ padding: 18 }}>
            <button
              type="submit"
              disabled={phase === 'loading'}
              style={button({
                width: '100%', background: phase === 'loading' ? MUTED : RED, color: '#fff',
                padding: 17, letterSpacing: '.1em',
                cursor: phase === 'loading' ? 'progress' : 'pointer',
              })}
            >{phase === 'loading' ? 'COMPOSITION…' : 'GÉNÉRER MA SÉANCE'}</button>

            <div
              role="status"
              aria-live="polite"
              style={{ font: '400 11px/1.5 Archivo', color: MUTED, marginTop: 10, minHeight: 16 }}
            >
              {phase === 'loading'
                ? 'Composition de la séance…'
                : `${disponibles} mouvement${disponibles > 1 ? 's' : ''} disponible${disponibles > 1 ? 's' : ''} avec ce matériel, ce niveau et ces contraintes.`}
            </div>
          </div>
        </form>
      )}

      {phase === 'result' && session && (
        <SessionResult
          ref={resultRef}
          session={session}
          library={library}
          onRegenerate={regenerate}
          onEdit={() => setPhase('form')}
          onStart={onStart ? () => onStart(fromWodSession(session)) : null}
        />
      )}
    </div>
  );
}

/* ── Le formulaire ────────────────────────────────────────────────────────── */

function Section({ label, error, children }) {
  return (
    <section style={{ padding: '16px 18px 0' }}>
      <div style={{ ...kicker(MUTED, 9), marginBottom: 10 }}>{label}</div>
      {children}
      {error && (
        <div role="alert" style={{ font: '600 11px/1.4 Archivo', color: RED_DEEP, marginTop: 8 }}>
          {error}
        </div>
      )}
    </section>
  );
}

/**
 * Un groupe de choix exclusifs.
 *
 * Des boutons plutôt qu'un `<select>` : le design n'a pas de champ déroulant,
 * et sur un écran de téléphone une valeur qu'on voit vaut mieux qu'une valeur
 * qu'il faut ouvrir pour lire. Le rôle ARIA rétablit ce que le `<select>`
 * donnait gratuitement.
 */
function Choices({ name, options, value, onChange, columns }) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 0, border: RULE }}
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            style={button({
              background: on ? INK : 'transparent',
              color: on ? 'var(--color-bg)' : MUTED_2,
              font: '700 9.5px/1.3 Archivo', letterSpacing: '.08em',
              padding: '11px 9px', textAlign: 'left',
              borderRight: (i + 1) % columns === 0 ? undefined : HAIR,
              borderTop: i >= columns ? HAIR : undefined,
              minWidth: 0,
            })}
          >{String(o.label).toUpperCase()}</button>
        );
      })}
    </div>
  );
}

function EquipmentPicker({ items, value, onChange, error, count }) {
  const selected = new Set(value);

  function toggle(id, locked) {
    if (locked) return;
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <section style={{ padding: '16px 0 0' }}>
      <div style={{ padding: '0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={kicker(MUTED, 9)}>MATÉRIEL DISPONIBLE</div>
        <button
          type="button"
          onClick={() => onChange(['poids-du-corps'])}
          style={button({
            border: RULE, background: 'transparent', color: INK,
            font: '700 8.5px/1 Archivo', letterSpacing: '.1em', padding: '6px 8px',
          })}
        >SANS MATÉRIEL</button>
      </div>

      <div style={{ padding: '8px 18px 0', font: '400 11.5px/1.5 Archivo', color: MUTED_2, textWrap: 'pretty' }}>
        Repris de Réglages. Un mouvement n’est proposé que si <em>tout</em> ce
        qu’il suppose est coché — {count} mouvement{count > 1 ? 's' : ''} possible{count > 1 ? 's' : ''} en l’état.
      </div>

      <div style={{ marginTop: 12 }}>
        {items.map((item) => {
          const on = selected.has(item.id);
          const locked = Boolean(item.always);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={locked}
              onClick={() => toggle(item.id, locked)}
              style={button({
                width: '100%',
                display: 'grid', gridTemplateColumns: '22px 1fr', gap: 11, alignItems: 'center',
                padding: '11px 18px', borderBottom: HAIR,
                background: 'transparent', color: INK,
                cursor: locked ? 'default' : 'pointer',
              })}
            >
              <span style={{
                width: 16, height: 16, border: `2px solid ${locked ? MUTED : INK}`,
                background: on ? (locked ? MUTED : INK) : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-bg)', font: '700 10px/1 Archivo',
              }}>{on ? '✓' : ''}</span>
              <span style={{ font: '700 12.5px/1.25 Archivo', textAlign: 'left' }}>
                {item.label}
                {locked && (
                  <span style={{ font: '400 10px/1 Archivo', color: MUTED, marginLeft: 7 }}>toujours</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" style={{ padding: '10px 18px 0', font: '600 11px/1.4 Archivo', color: RED_DEEP }}>
          {error}
        </div>
      )}
    </section>
  );
}

function Text({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <div style={{ ...kicker(MUTED, 8.5), marginBottom: 6 }}>{label.toUpperCase()}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          border: RULE, background: 'transparent', color: INK,
          font: '400 13px/1.2 Archivo', padding: '11px 12px', borderRadius: 0, outline: 'none',
        }}
      />
    </label>
  );
}

/* ── Le résultat ──────────────────────────────────────────────────────────── */

const KIND_COLORS = {
  echauffement: MUTED_2,
  wod: RED_DEEP,
  recuperation: MUTED,
  'retour-au-calme': MUTED_2,
};

const SessionResult = forwardRef(function SessionResult({ session, library, onRegenerate, onEdit, onStart }, ref) {
  // Index des visuels : la bibliothèque PPG est déjà chargée par l'app, on ne
  // la retélécharge pas pour illustrer un WOD.
  const visuels = useMemo(() => {
    const map = new Map();
    for (const e of library?.exercises || []) map.set(e.id, e);
    return map;
  }, [library]);
  return (
    <div ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
      <header style={{ padding: '16px 18px 14px', borderBottom: RULE }}>
        <div style={kicker(RED_DEEP, 9)}>
          {session.typeLabel.toUpperCase()} · {session.durationMin} MIN · {session.levelLabel.toUpperCase()}
        </div>
        <div style={{ ...title(32), marginTop: 8 }}>{session.name}</div>
        <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, marginTop: 8 }}>
          Objectif : <strong style={{ color: INK }}>{session.goalLabel}</strong> · {session.rpe.label}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: RULE }}>
        <Cell label="DURÉE" value={`${session.durationMin} min`} border />
        <Cell label="INTENSITÉ" value={`RPE ${session.rpe.min}–${session.rpe.max}`} />
      </div>

      <div style={{ padding: '14px 18px', borderBottom: HAIR }}>
        <div style={kicker(MUTED, 8.5)}>MATÉRIEL UTILISÉ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {session.equipment.map((e) => (
            <span key={e.id} style={{
              border: HAIR, padding: '5px 8px',
              font: '600 10px/1 Archivo', letterSpacing: '.06em', color: BODY,
            }}>{e.label.toUpperCase()}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 18px', borderBottom: RULE, background: SURF }}>
        <div style={kicker(MUTED, 8.5)}>VÉRIFICATION DE LA DURÉE</div>
        <div style={{ font: '600 12px/1.6 Archivo', color: INK, marginTop: 7, textWrap: 'pretty' }}>
          {session.durationCheck}
        </div>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <div style={kicker(MUTED, 9)}>CHRONOLOGIE</div>
      </div>
      <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {session.timeline.map((t) => (
          <li key={`${t.kind}-${t.from}`} style={{
            display: 'grid', gridTemplateColumns: '78px 1fr auto', gap: 10, alignItems: 'baseline',
            padding: '9px 18px', borderBottom: HAIR,
          }}>
            <span style={{ font: '700 11px/1 Archivo', color: MUTED }}>
              {fmtClock(t.from)}–{fmtClock(t.to)}
            </span>
            <span style={{ font: '700 12.5px/1.3 Archivo', color: KIND_COLORS[t.kind] ?? INK }}>{t.title}</span>
            <span style={{ font: '600 11px/1 Archivo', color: MUTED }}>{t.minutes}′</span>
          </li>
        ))}
      </ol>

      {session.blocks.map((b) => <BlockCard key={b.id} block={b} visuels={visuels} />)}

      {session.constraints.notes.length > 0 && (
        <div style={{ padding: '16px 18px 0' }}>
          <div style={kicker(MUTED, 9)}>CONTRAINTES PRISES EN COMPTE</div>
          {session.constraints.notes.map((n) => (
            <div key={n} style={{ font: '400 11.5px/1.5 Archivo', color: BODY, marginTop: 7, textWrap: 'pretty' }}>
              {n}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '16px 18px 0' }}>
        <div style={kicker(MUTED, 9)}>SÉCURITÉ</div>
        {session.safety.map((s) => (
          <div key={s} style={{
            display: 'grid', gridTemplateColumns: '12px 1fr', gap: 8, marginTop: 9,
          }}>
            <span aria-hidden="true" style={{ font: '800 11px/1.5 Archivo', color: RED }}>—</span>
            <span style={{ font: '400 11.5px/1.5 Archivo', color: BODY, textWrap: 'pretty' }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 18px 0', display: 'grid', gap: 9 }}>
        {/* « Démarrer » n'apparaît que si le mode guidé est branché : un bouton
            qui ne lance rien vaut moins qu'une absence de bouton. */}
        {onStart && (
          <button
            type="button"
            onClick={onStart}
            style={button({
              width: '100%', background: INK, color: 'var(--color-bg)',
              padding: 18, font: '800 14px/1 Archivo', letterSpacing: '.12em',
            })}
          >DÉMARRER LA SÉANCE</button>
        )}
        <button
          type="button"
          onClick={onRegenerate}
          style={button({
            width: '100%', background: RED, color: '#fff', padding: 16, letterSpacing: '.1em',
          })}
        >RÉGÉNÉRER</button>
        <button
          type="button"
          onClick={onEdit}
          style={button({
            width: '100%', border: RULE, background: 'transparent', color: INK,
            padding: 15, letterSpacing: '.1em',
          })}
        >MODIFIER LES PARAMÈTRES</button>
      </div>

      <div style={{ padding: '14px 18px 0', font: '400 10.5px/1.5 Archivo', color: MUTED, textWrap: 'pretty' }}>
        Séance composée sur le téléphone, à partir du matériel coché et des
        contraintes saisies. Rien n’est envoyé nulle part. Le bilan d’une séance
        démarrée ici est enregistré sur cet appareil, et nulle part ailleurs.
        {session.blocks.some((b) => b.movements.some((m) => m.libraryId)) && (
          <> Les démonstrations sont celles de la bibliothèque PPG — © Gym visual,
          chargées depuis le dépôt source.</>
        )}
      </div>

      <div style={{ height: 74 }} />
    </div>
  );
});

function BlockCard({ block, visuels }) {
  const accent = KIND_COLORS[block.kind] ?? INK;
  const isWod = block.kind === 'wod';

  return (
    <article style={{ margin: '16px 18px 0', border: RULE }}>
      <div style={{
        background: isWod ? INK : 'transparent',
        color: isWod ? 'var(--color-bg)' : INK,
        padding: '11px 13px', borderBottom: isWod ? undefined : HAIR,
      }}>
        <div style={kicker(isWod ? 'var(--color-neutral-400)' : accent, 8.5)}>
          {block.minutes} MIN
          {block.formatLabel ? ` · ${block.formatLabel.toUpperCase()}` : ''}
          {block.dominantLabel ? ` · ${block.dominantLabel.toUpperCase()}` : ''}
        </div>
        <div style={{ font: '800 16px/1.2 Archivo', marginTop: 6, letterSpacing: '-.01em' }}>
          {block.title}
        </div>
      </div>

      <div style={{ padding: '12px 13px', font: '400 12px/1.55 Archivo', color: BODY, textWrap: 'pretty' }}>
        {block.prescription}
      </div>

      {block.movements.length > 0 && (
        <div style={{ borderTop: HAIR }}>
          {block.movements.map((m) => (
            <MovementRow key={m.id} movement={m} visuel={visuels?.get(m.libraryId)} />
          ))}
        </div>
      )}

      <div style={{ borderTop: HAIR, padding: '11px 13px', display: 'grid', gap: 8 }}>
        <Meta k="INTENSITÉ" v={block.rpe.label} />
        {block.rest && <Meta k="RÉCUPÉRATION" v={block.rest} />}
        {block.score && <Meta k="À NOTER" v={block.score} />}
      </div>

      {block.safety?.length > 0 && (
        <div style={{ borderTop: HAIR, padding: '11px 13px', background: SURF }}>
          <div style={kicker(MUTED, 8)}>SÉCURITÉ</div>
          {block.safety.map((s) => (
            <div key={s} style={{ font: '400 11px/1.5 Archivo', color: BODY, marginTop: 6, textWrap: 'pretty' }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function MovementRow({ movement, visuel }) {
  return (
    <div style={{
      padding: '11px 13px', borderBottom: HAIR_SOFT,
      display: 'grid', gridTemplateColumns: visuel ? '58px 1fr' : '1fr', gap: 11,
    }}>
      {visuel && <MovementThumb exercise={visuel} name={movement.name} />}

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ font: '700 13.5px/1.25 Archivo', minWidth: 0 }}>{movement.name}</div>
          <div style={{ font: '800 12px/1 Archivo', color: RED_DEEP, flex: 'none' }}>{movement.volume}</div>
        </div>

        <div style={{ font: '600 10px/1 Archivo', letterSpacing: '.06em', color: MUTED, marginTop: 6 }}>
          {movement.groups.join(' · ').toUpperCase()}
          {movement.charge !== '—' && ` · CHARGE ${movement.charge.toUpperCase()}`}
        </div>

        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          <Variant sign="−" text={movement.easier} />
          <Variant sign="+" text={movement.harder} />
        </div>

        {movement.note && (
          <div style={{ font: '400 10.5px/1.5 Archivo', color: MUTED_2, marginTop: 7, textWrap: 'pretty' }}>
            {movement.note}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Le visuel d'un mouvement.
 *
 * Les images vivent dans le dépôt source, pas ici — elles peuvent donc manquer,
 * et le placeholder du design reprend la main sans rien casser. Même repli que
 * la bibliothèque PPG, pour que les deux écrans se comportent pareil.
 */
function MovementThumb({ exercise, name }) {
  const [failed, setFailed] = useState(false);
  const src = exercise.gifUrl || exercise.imageUrl;
  if (!src || failed) {
    return (
      <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true" style={{ display: 'block' }}>
        <rect x="0.5" y="0.5" width="57" height="57" fill="none" stroke="var(--color-neutral-500)" />
        <path d="M0 0l58 58M58 0L0 58" stroke="var(--color-neutral-400)" />
      </svg>
    );
  }
  return (
    <div style={{ width: 58, height: 58, background: '#fff', overflow: 'hidden' }}>
      <img
        src={src}
        alt={`Démonstration : ${name}`}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function Variant({ sign, text }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 7, alignItems: 'baseline' }}>
      <span aria-hidden="true" style={{ font: '800 11px/1.4 Archivo', color: sign === '+' ? RED : MUTED }}>{sign}</span>
      <span style={{ font: '400 11px/1.45 Archivo', color: BODY, textWrap: 'pretty' }}>
        <span className="sr-only">{sign === '+' ? 'Variante plus difficile : ' : 'Variante plus facile : '}</span>
        {text}
      </span>
    </div>
  );
}

function Meta({ k, v }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 9, alignItems: 'baseline' }}>
      <span style={{ font: '600 8.5px/1.4 Archivo', letterSpacing: '.1em', color: MUTED }}>{k}</span>
      <span style={{ font: '400 11.5px/1.45 Archivo', color: BODY, textWrap: 'pretty' }}>{v}</span>
    </div>
  );
}

function Cell({ label, value, border }) {
  return (
    <div style={{ padding: '12px 0 12px 18px', borderRight: border ? HAIR : undefined }}>
      <div style={kicker(MUTED, 8.5)}>{label}</div>
      <div style={{ font: '800 18px/1 Archivo', marginTop: 6 }}>{value}</div>
    </div>
  );
}

const fmtClock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

