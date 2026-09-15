import { useState } from 'react';
import {
  INK, RED, RED_DEEP, SURF, MUTED, MUTED_2, BODY, RULE, HAIR,
  kicker, title, button,
} from '../lib/ui.js';
import {
  emptyGoal, phaseFor, estimatedDurationMin, effortKm, longRunCeilingMin,
  weeklyElevationTarget, canDo,
} from '../data/goals.js';
import AvailabilitySettings from '../components/AvailabilitySettings.jsx';
import { LOAD_LEVELS, loadLevelProfile } from '../data/load-level.js';

const DAY = 86400000;
const parse = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}′`);
const fr = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/**
 * Réglages : objectifs et matériel.
 *
 * Les deux tiennent dans le même écran parce qu'ils font la même chose — ils
 * changent le plan. La date d'objectif donne sa forme aux semaines, le matériel
 * décide du contenu des séances de PPG. Tout est enregistré immédiatement et le
 * plan se recompose dans la foulée.
 */
export default function SettingsScreen({
  goals, onGoalsChange, equipment, onEquipmentChange, library, longRunPace,
  weeklyAvailability, datedConstraints, onSaveWeeklyAvailability,
  onAddConstraint, onRemoveConstraint, checkinCount = 0, onClearCheckins,
  loadLevel = 4, onLoadLevelChange,
}) {
  const [draft, setDraft] = useState(null);

  const start = (g) => setDraft(g ? { ...g } : emptyGoal());
  const commit = () => {
    if (!draft.name || !draft.date) return;
    const clean = {
      ...draft,
      distanceKm: Number(draft.distanceKm) || 0,
      elevationGainM: Number(draft.elevationGainM) || 0,
    };
    const next = goals.some((g) => g.id === clean.id)
      ? goals.map((g) => (g.id === clean.id ? clean : g))
      : [...goals, clean];
    onGoalsChange(next.sort((a, b) => a.date.localeCompare(b.date)));
    setDraft(null);
  };

  return (
    <div style={{ padding: '58px 0 0' }}>
      <header style={{ padding: '0 18px 12px' }}>
        <div style={kicker(MUTED, 9.5)}>RÉGLAGES</div>
        <div style={{ ...title(30), marginTop: 7 }}>Ton entraînement</div>
        <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, marginTop: 8, textWrap: 'pretty' }}>
          Ajuste l’essentiel ici. Les détails restent disponibles quand tu en as besoin.
        </div>
      </header>

      <div style={{ height: 2, background: INK }} />

      {!draft && (
        <>
          <LoadLevelSection value={loadLevel} onChange={onLoadLevelChange} />

          <div style={{ padding: '12px 14px 22px', display: 'grid', gap: 8 }}>
            <CollapsibleSection
              title="Objectifs"
              summary={goals.length ? `${goals.length} course${goals.length > 1 ? 's' : ''} configurée${goals.length > 1 ? 's' : ''}` : 'Aucune course configurée'}
            >
              {goals.map((g) => (
                <GoalRow key={g.id} goal={g} longRunPace={longRunPace}
                  onEdit={() => start(g)} onDelete={() => onGoalsChange(goals.filter((x) => x.id !== g.id))} />
              ))}
              {!goals.length && <CompactHelp>Ajoute une course pour activer les phases spécifiques et l’affûtage.</CompactHelp>}
              <CompactAction onClick={() => start(null)}>AJOUTER UN OBJECTIF</CompactAction>
            </CollapsibleSection>

            <CollapsibleSection
              title="Disponibilités"
              summary={datedConstraints.length ? `${datedConstraints.length} contrainte${datedConstraints.length > 1 ? 's' : ''} ponctuelle${datedConstraints.length > 1 ? 's' : ''}` : 'Semaine type et contraintes'}
            >
            <AvailabilitySettings
              weeklyAvailability={weeklyAvailability}
              datedConstraints={datedConstraints}
              onSaveWeekly={onSaveWeeklyAvailability}
              onAddConstraint={onAddConstraint}
              onRemoveConstraint={onRemoveConstraint}
            />
            </CollapsibleSection>

            <CollapsibleSection
              title="Matériel PPG"
              summary={`${Math.max(0, equipment.length - 1)} équipement${equipment.length - 1 > 1 ? 's' : ''} en plus du poids du corps`}
            >
              <EquipmentSection equipment={equipment} onChange={onEquipmentChange} library={library} />
            </CollapsibleSection>

            <CollapsibleSection title="Données personnelles" summary={checkinCount ? `${checkinCount} points quotidiens enregistrés` : 'Aucun point quotidien'}>
              <CheckinSettings count={checkinCount} onClear={onClearCheckins} />
            </CollapsibleSection>
          </div>
        </>
      )}

      {draft && (
        <div style={{ padding: '16px 18px 24px' }}>
          <Field label="NOM DE LA COURSE">
            <input
              value={draft.name}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="CCC, Trail des Yvelines…"
              style={inputStyle}
            />
          </Field>

          <Field label="DATE">
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="DISTANCE (KM)">
              <input
                type="number"
                inputMode="decimal"
                value={draft.distanceKm}
                onChange={(e) => setDraft({ ...draft, distanceKm: e.target.value })}
                placeholder="100"
                style={inputStyle}
              />
            </Field>
            <Field label="D+ (M)">
              <input
                type="number"
                inputMode="numeric"
                value={draft.elevationGainM}
                onChange={(e) => setDraft({ ...draft, elevationGainM: e.target.value })}
                placeholder="6100"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="PRIORITÉ">
            <div style={{ display: 'flex', border: RULE }} role="radiogroup" aria-label="Priorité">
              {['A', 'B', 'C'].map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={draft.priority === p}
                  onClick={() => setDraft({ ...draft, priority: p })}
                  style={button({
                    flex: 1,
                    borderRight: p !== 'C' ? HAIR : undefined,
                    background: draft.priority === p ? INK : 'transparent',
                    color: draft.priority === p ? 'var(--color-bg)' : INK,
                    padding: '12px 0', textAlign: 'center', font: '700 12px/1 Archivo',
                  })}
                >{p}</button>
              ))}
            </div>
            <div style={{ font: '400 11px/1.4 Archivo', color: MUTED_2, marginTop: 6 }}>
              {{
                A: 'Objectif principal : c’est lui qui commande l’affûtage.',
                B: 'Course d’entraînement : le plan ne s’arrête pas pour elle.',
                C: 'Sortie de plaisir, aucun aménagement.',
              }[draft.priority]}
            </div>
          </Field>

          <Field label="CARACTÉRISTIQUES">
            <textarea
              value={draft.characteristics}
              rows={3}
              onChange={(e) => setDraft({ ...draft, characteristics: e.target.value })}
              placeholder="Terrain technique, départ de nuit, altitude 2 500 m, barrières horaires serrées…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }}
            />
          </Field>

          {draft.date && draft.distanceKm > 0 && (
            <Preview goal={draft} longRunPace={longRunPace} />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setDraft(null)}
              style={button({
                border: RULE, background: 'transparent', color: INK, padding: 15, textAlign: 'center',
              })}
            >ANNULER</button>
            <button
              type="button"
              onClick={commit}
              disabled={!draft.name || !draft.date}
              style={button({
                background: RED, color: '#fff', padding: 15, textAlign: 'center',
                opacity: !draft.name || !draft.date ? .45 : 1,
              })}
            >ENREGISTRER</button>
          </div>
        </div>
      )}
      <div style={{ height: 74 }} />
    </div>
  );
}

function CollapsibleSection({ title: sectionTitle, summary, children }) {
  return (
    <details style={{ border: RULE, background: 'var(--color-bg)' }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '14px 42px 14px 14px', position: 'relative' }}>
        <div style={{ font: '800 13px/1.2 Archivo' }}>{sectionTitle}</div>
        <div style={{ font: '400 10.5px/1.35 Archivo', color: MUTED_2, marginTop: 4 }}>{summary}</div>
        <span aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', font: '700 18px/1 Archivo', color: MUTED }}>+</span>
      </summary>
      <div style={{ borderTop: HAIR }}>{children}</div>
    </details>
  );
}

function CompactHelp({ children }) {
  return <div style={{ padding: '14px 14px 0', font: '400 11.5px/1.5 Archivo', color: MUTED_2 }}>{children}</div>;
}

function CompactAction({ children, onClick }) {
  return <div style={{ padding: 14 }}><button type="button" onClick={onClick} style={button({ width: '100%', background: RED, color: '#fff', padding: 13, letterSpacing: '.08em' })}>{children}</button></div>;
}

function LoadLevelSection({ value, onChange }) {
  const profile = loadLevelProfile(value);
  return (
    <section aria-label="Niveau de charge hebdomadaire" style={{ padding: '16px 18px 20px', background: SURF }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={kicker(MUTED, 9)}>INTENSITÉ DE LA SEMAINE</div>
        <div style={{ font: '800 24px/1 Archivo', color: RED }}>{profile.level}/8</div>
      </div>
      <div style={{ font: '800 18px/1.2 Archivo', marginTop: 8 }}>{profile.label}</div>
      <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, marginTop: 6, minHeight: 36 }}>
        {profile.description}
      </div>
      <input
        type="range" min="1" max="8" step="1" value={profile.level}
        aria-label="Niveau de charge de la semaine"
        aria-valuetext={`${profile.level} sur 8 — ${profile.label}`}
        onChange={(event) => onChange?.(Number(event.target.value))}
        style={{ width: '100%', accentColor: RED, margin: '16px 0 7px' }}
      />
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>
        {LOAD_LEVELS.map((item) => (
          <div key={item.level} style={{ textAlign: item.level === 1 ? 'left' : item.level === 8 ? 'right' : 'center', font: '700 9px/1 Archivo', color: item.level === profile.level ? RED : MUTED }}>
            {item.level}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, font: '600 8px/1 Archivo', letterSpacing: '.08em', color: MUTED }}>
        <span>FOOTINGS</span><span>BLOC MONTAGNE</span>
      </div>
      <div style={{ font: '400 10.5px/1.45 Archivo', color: MUTED_2, marginTop: 12 }}>
        La récupération, l’affûtage et les alertes de douleur restent prioritaires sur ce réglage.
      </div>
    </section>
  );
}

/**
 * Le matériel disponible.
 *
 * Chaque ligne dit ce qu'elle débloque ou ce que la décocher retirerait —
 * décocher les haltères sans savoir qu'on perd onze exercices n'aide personne.
 * Le poids du corps est verrouillé : sans lui, plus rien à proposer.
 */
function EquipmentSection({ equipment, onChange, library }) {
  const items = library?.equipment || [];
  const exercises = library?.exercises || [];
  const available = exercises.filter((e) => canDo(e, equipment));

  const byRole = available.reduce((acc, e) => {
    acc[e.cat] = (acc[e.cat] || 0) + 1;
    return acc;
  }, {});

  function toggle(id) {
    if (id === 'poids-du-corps') return;
    onChange(equipment.includes(id)
      ? equipment.filter((x) => x !== id)
      : [...equipment, id]);
  }

  return (
    <div>
      <div style={{ padding: '13px 18px 0' }}>
        <div style={kicker(MUTED, 9)}>MATÉRIEL POUR LA PPG</div>
        <div style={{ font: '400 12px/1.5 Archivo', color: MUTED_2, marginTop: 7, textWrap: 'pretty' }}>
          <strong style={{ color: INK }}>{available.length} exercices</strong> disponibles
          sur {exercises.length}
          {Object.keys(byRole).length > 0 && ' — '}
          {Object.entries(byRole).map(([r, n]) => `${r.toLowerCase()} ${n}`).join(', ')}.
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {items.map((item) => {
          const on = equipment.includes(item.id);
          const locked = Boolean(item.always);
          const delta = on
            ? available.length
              - exercises.filter((e) => canDo(e, equipment.filter((x) => x !== item.id))).length
            : exercises.filter((e) => canDo(e, [...equipment, item.id])).length
              - available.length;

          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={locked}
              onClick={() => toggle(item.id)}
              style={button({
                width: '100%',
                display: 'grid', gridTemplateColumns: '22px 1fr auto',
                gap: 11, alignItems: 'center',
                padding: '13px 18px', borderBottom: HAIR,
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

              <span style={{ font: '700 13px/1.2 Archivo', textAlign: 'left' }}>
                {item.label}
                {locked && (
                  <span style={{ font: '400 10px/1 Archivo', color: MUTED, marginLeft: 7 }}>
                    toujours
                  </span>
                )}
              </span>

              <span style={{ font: '600 10px/1 Archivo', letterSpacing: '.06em', color: MUTED }}>
                {locked || delta === 0 ? '' : on ? `−${delta}` : `+${delta}`}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '14px 18px 0', font: '400 11px/1.5 Archivo', color: MUTED_2, textWrap: 'pretty' }}>
        Exercices et consignes : <strong style={{ color: INK }}>hasaneyldrm/exercises-dataset</strong> (MIT).
        Les illustrations de ce dataset (© Gym visual) ne sont pas reprises : leur
        licence est distincte et demande une autorisation propre.
      </div>
    </div>
  );
}

/** Ce que l'objectif va faire au plan — visible avant d'enregistrer. */
function Preview({ goal, longRunPace }) {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const clean = {
    ...goal,
    distanceKm: Number(goal.distanceKm),
    elevationGainM: Number(goal.elevationGainM),
  };
  const p = phaseFor(clean, weekStart, longRunPace);
  if (!p) return null;

  const days = Math.round((parse(goal.date).getTime() - Date.now()) / DAY);
  const dur = estimatedDurationMin(clean, longRunPace);

  return (
    <div style={{ marginTop: 18, border: RULE }}>
      <div style={{ background: INK, color: 'var(--color-bg)', padding: '11px 14px' }}>
        <div style={kicker('var(--color-neutral-400)', 8.5)}>CE QUE ÇA CHANGE AU PLAN</div>
        <div style={{ font: '800 14px/1.3 Archivo', marginTop: 6 }}>
          J−{days} · {p.label.toLowerCase()}
        </div>
      </div>
      <Line k="Km-effort" v={`${fr(effortKm(clean))} km`} />
      <Line k="Durée estimée" v={dur ? fmtDur(dur) : '—'} />
      <Line k="Sortie longue plafond" v={fmtDur(longRunCeilingMin(p))} />
      <Line k="D+ hebdo visé" v={weeklyElevationTarget(p) ? `${fr(weeklyElevationTarget(p))} m` : '—'} />
      <Line k="Charge de la semaine" v={`${p.loadFactor >= 1 ? '+' : ''}${Math.round((p.loadFactor - 1) * 100)} %`} last />
    </div>
  );
}

function Line({ k, v, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '10px 14px', borderBottom: last ? undefined : HAIR, background: SURF,
    }}>
      <span style={{ font: '600 10px/1 Archivo', letterSpacing: '.1em', color: MUTED }}>{k}</span>
      <span style={{ font: '800 14px/1 Archivo', color: INK }}>{v}</span>
    </div>
  );
}

/**
 * L'historique des questionnaires quotidiens.
 *
 * Ce qu'on y écrit — douleurs, sommeil, récupération — est sensible. Il ne
 * quitte jamais l'appareil, et il doit pouvoir être effacé d'un geste, sans
 * chercher où. La suppression demande confirmation : elle est définitive.
 */
function CheckinSettings({ count, onClear }) {
  const [confirming, setConfirming] = useState(false);
  if (!onClear) return null;

  return (
    <section aria-label="Questionnaire quotidien" style={{ padding: '16px 18px 22px' }}>
      <div style={kicker(MUTED, 9)}>QUESTIONNAIRE QUOTIDIEN</div>
      <div style={{ font: '400 12.5px/1.6 Archivo', color: MUTED_2, marginTop: 9, textWrap: 'pretty' }}>
        {count
          ? `${count} journée${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''} sur cet appareil. `
          : 'Aucune journée enregistrée pour l’instant. '}
        Ces réponses ne sont envoyées nulle part : elles servent à adapter la
        séance du jour et à lire la tendance des semaines.
      </div>

      {!confirming ? (
        <button
          type="button"
          disabled={!count}
          onClick={() => setConfirming(true)}
          style={button({
            width: '100%', marginTop: 13, border: RULE,
            background: 'transparent', color: count ? INK : MUTED,
            padding: 14, letterSpacing: '.08em',
            cursor: count ? 'pointer' : 'not-allowed',
          })}
        >SUPPRIMER L’HISTORIQUE</button>
      ) : (
        <div role="alertdialog" aria-label="Confirmer la suppression" style={{ marginTop: 13, border: `2px solid ${RED}`, padding: 13 }}>
          <div style={{ font: '600 12px/1.5 Archivo', color: INK, textWrap: 'pretty' }}>
            Tout l’historique des questionnaires sera effacé, y compris celui
            d’aujourd’hui. C’est définitif.
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => { onClear(); setConfirming(false); }}
              style={button({ width: '100%', background: RED, color: '#fff', padding: 14, letterSpacing: '.08em' })}
            >CONFIRMER LA SUPPRESSION</button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={button({ width: '100%', border: RULE, background: 'transparent', color: INK, padding: 12, letterSpacing: '.08em' })}
            >ANNULER</button>
          </div>
        </div>
      )}
    </section>
  );
}

function GoalRow({ goal, longRunPace, onEdit, onDelete }) {
  const days = Math.round((parse(goal.date).getTime() - Date.now()) / DAY);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const p = phaseFor(goal, weekStart, longRunPace);
  const past = days < 0;

  return (
    <div style={{ borderBottom: HAIR, padding: '14px 18px', opacity: past ? .5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '700 8.5px/1 Archivo', letterSpacing: '.12em', color: RED_DEEP }}>
            PRIORITÉ {goal.priority} · {past ? 'PASSÉ' : `J−${days}`}
          </div>
          <div style={{ font: '700 16px/1.2 Archivo', marginTop: 7, letterSpacing: '-.01em' }}>
            {goal.name}
          </div>
          <div style={{ font: '400 11.5px/1.4 Archivo', color: MUTED_2, marginTop: 4 }}>
            {goal.date} · {fr(goal.distanceKm)} km · {fr(goal.elevationGainM)} m D+
          </div>
          {goal.characteristics && (
            <div style={{ font: '400 11.5px/1.45 Archivo', color: BODY, marginTop: 7, textWrap: 'pretty' }}>
              {goal.characteristics}
            </div>
          )}
          {!past && p && (
            <div style={{ font: '600 10px/1 Archivo', letterSpacing: '.08em', color: MUTED, marginTop: 8 }}>
              {p.label.toUpperCase()} · SORTIE LONGUE ≤ {fmtDur(longRunCeilingMin(p))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <button type="button" onClick={onEdit} style={button({
            border: RULE, background: 'transparent', color: INK,
            font: '700 9px/1 Archivo', letterSpacing: '.1em', padding: '7px 9px',
          })}>MODIFIER</button>
          <button type="button" onClick={onDelete} style={button({
            border: RULE, background: 'transparent', color: RED_DEEP,
            font: '700 9px/1 Archivo', letterSpacing: '.1em', padding: '7px 9px',
          })}>SUPPRIMER</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginTop: 14 }}>
      <div style={{ ...kicker(MUTED, 8.5), marginBottom: 7 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: RULE, background: 'transparent', color: INK,
  font: '400 14px/1.2 Archivo', padding: '12px 12px', borderRadius: 0,
  outline: 'none',
};
