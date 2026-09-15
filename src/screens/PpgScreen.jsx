import { useState, useMemo } from 'react';
import {
  INK, RED, RED_DEEP, SURF, MUTED, MUTED_2, BODY, RULE, HAIR,
  kicker, title, button,
} from '../lib/ui.js';

import { canDo } from '../data/goals.js';
import WodGenerator from './WodGenerator.jsx';

const FILTERS = ['Tous', 'Force', 'Excentrique', 'Gainage', 'Pliométrie', 'Mobilité'];

// L'onglet porte deux choses qui ne se mélangent pas : une bibliothèque qu'on
// consulte, et un générateur qui compose. Un sélecteur en tête plutôt que deux
// onglets de plus en bas — la barre du bas est déjà pleine, et les deux modes
// parlent du même sujet.
const MODES = [
  { id: 'library', label: 'BIBLIOTHÈQUE' },
  { id: 'wod', label: 'GÉNÉRATEUR' },
];

export default function PpgScreen({
  snapshot, library, equipment, onOpenExercise, onStartGuided, checkinAnswers = null,
}) {
  const [mode, setMode] = useState('library');
  const [filter, setFilter] = useState('Tous');
  const [query, setQuery] = useState('');

  // La bibliothèque vient du dataset ; seuls les exercices réalisables avec le
  // matériel coché dans Réglages sont proposés. Tant qu'elle n'est pas chargée,
  // on retombe sur le contenu du design.
  const exercises = useMemo(() => {
    if (!library?.exercises?.length) return snapshot.exercises || [];
    return library.exercises.filter((e) => canDo(e, equipment || ['poids-du-corps']));
  }, [library, equipment, snapshot.exercises]);

  const total = library?.exercises?.length ?? exercises.length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => {
      const byCat = filter === 'Tous' || e.cat === filter.toUpperCase();
      const byQuery = !q
        || e.name.toLowerCase().includes(q)
        || e.zone.toLowerCase().includes(q)
        || e.cat.toLowerCase().includes(q);
      return byCat && byQuery;
    });
  }, [exercises, filter, query]);

  return (
    <div style={{ padding: '58px 0 0' }}>
      <header style={{ padding: '0 18px 12px' }}>
        <div style={kicker(MUTED, 9.5)}>
          {mode === 'library'
            ? `BIBLIOTHÈQUE PPG · ${exercises.length} EXERCICE${exercises.length > 1 ? 'S' : ''}${total > exercises.length ? ` SUR ${total}` : ''}`
            : 'GÉNÉRATEUR · CROSSFIT & HYROX'}
        </div>
        <div style={{ ...title(30), marginTop: 7 }}>
          {mode === 'library' ? 'Renforcement' : 'Composer un WOD'}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Mode de l’onglet PPG"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: RULE, borderBottom: RULE }}
      >
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            style={button({
              background: mode === m.id ? INK : 'transparent',
              color: mode === m.id ? 'var(--color-bg)' : MUTED_2,
              font: '700 9.5px/1 Archivo', letterSpacing: '.1em', padding: '12px 13px',
              borderRight: i === 0 ? HAIR : undefined,
            })}
          >{m.label}</button>
        ))}
      </div>

      {mode === 'wod' && (
        <WodGenerator
          equipment={equipment}
          library={library}
          onStart={onStartGuided}
          checkinAnswers={checkinAnswers}
        />
      )}

      {mode === 'library' && (
        <>
        <div style={{ padding: '14px 18px 14px' }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 9,
            border: RULE, padding: '11px 12px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED_2} strokeWidth="2.4" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un exercice, un muscle…"
              aria-label="Chercher un exercice"
              style={{
                flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
                font: '400 12.5px/1 Archivo', color: INK,
              }}
            />
          </label>
        </div>

        <nav style={{ display: 'flex', overflow: 'auto', borderTop: RULE, borderBottom: RULE }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={button({
                flex: 'none', borderRight: HAIR,
                background: f === filter ? INK : 'transparent',
                color: f === filter ? 'var(--color-bg)' : MUTED_2,
                font: '700 9.5px/1 Archivo', letterSpacing: '.1em', padding: '11px 13px',
              })}
            >{f.toUpperCase()}</button>
          ))}
        </nav>

        {shown.length === 0 && (
          <div style={{ padding: '24px 18px', font: '400 12.5px/1.6 Archivo', color: MUTED_2 }}>
            {exercises.length === 0
              ? 'Aucun exercice ne correspond au matériel coché dans Réglages.'
              : 'Aucun exercice pour ce filtre.'}
          </div>
        )}

        {shown.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenExercise(e)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpenExercise(e); }
            }}
            style={{
              display: 'grid', gridTemplateColumns: '74px 1fr', gap: 14,
              padding: '14px 18px', borderBottom: HAIR, cursor: 'pointer',
            }}
          >
            <Thumb exercise={e} />
            <div>
              <div style={{ font: '700 8.5px/1 Archivo', letterSpacing: '.12em', color: RED_DEEP }}>{e.cat}</div>
              <div style={{ font: '700 14.5px/1.25 Archivo', marginTop: 7, letterSpacing: '-.01em' }}>{e.name}</div>
              <div style={{ font: '400 11.5px/1.4 Archivo', color: MUTED_2, marginTop: 4 }}>{e.zone}</div>
              <div style={{ font: '600 11px/1 Archivo', marginTop: 8 }}>{e.sets}</div>
            </div>
          </div>
        ))}
        <div style={{ height: 74 }} />
        </>
      )}
    </div>
  );
}

/**
 * La vignette d'un exercice.
 *
 * Les visuels sont servis depuis le dépôt source, pas recopiés ici. Ils peuvent
 * donc manquer — dépôt déplacé, hors ligne — et le placeholder du design reprend
 * la main sans rien casser. Le matériel requis reste affiché dans les deux cas.
 */
function Thumb({ exercise }) {
  const [failed, setFailed] = useState(false);
  const src = exercise.imageUrl || exercise.gifUrl;

  return (
    <div style={{
      width: 74, height: 74, background: 'var(--color-neutral-300)',
      position: 'relative', overflow: 'hidden',
    }}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
          <path d="M0 0l74 74M74 0L0 74" stroke="var(--color-neutral-400)" strokeWidth="1" />
          <rect x="0.5" y="0.5" width="73" height="73" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1" />
        </svg>
      )}
      <span style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '3px 4px',
        background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)',
        font: '600 7px/1.2 Archivo', letterSpacing: '.04em', color: MUTED_2,
      }}>{(exercise.needs || [exercise.equipment]).join(' + ')}</span>
    </div>
  );
}

/**
 * The bottom sheet that opens on an exercise.
 *
 * z-index 100/110 : au-dessus du panneau de séance (90), d'où la fiche peut être
 * ouverte. Plus bas, le tiroir s'ouvrait derrière lui.
 */
export function ExerciseSheet({ exercise, onClose, onAdd, addLabel }) {
  if (!exercise) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--color-text) 50%, transparent)', zIndex: 100 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 110,
          background: 'var(--color-bg)', borderTop: RULE,
          padding: '18px 18px 46px', animation: 'rise .22s ease-out',
          maxHeight: '78%', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ font: '700 8.5px/1 Archivo', letterSpacing: '.12em', color: RED_DEEP }}>{exercise.cat}</div>
            <div style={{ ...title(21), marginTop: 8, lineHeight: 1.15 }}>{exercise.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={button({
              flex: 'none', border: RULE, background: 'transparent',
              font: '700 11px/1 Archivo', padding: '8px 10px', color: INK,
            })}
          >✕</button>
        </div>

        <div style={{ height: 2, background: INK, margin: '14px 0' }} />

        {(exercise.gifUrl || exercise.imageUrl) && (
          <SheetMedia exercise={exercise} />
        )}

        <div style={{ font: '400 12.5px/1.6 Archivo', color: BODY, textWrap: 'pretty' }}>{exercise.why}</div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          marginTop: 16, borderTop: HAIR, borderBottom: HAIR,
        }}>
          <div style={{ padding: '11px 0', borderRight: HAIR }}>
            <div style={kicker(MUTED, 8.5)}>DOSE</div>
            <div style={{ font: '800 16px/1 Archivo', marginTop: 6 }}>{exercise.sets}</div>
          </div>
          <div style={{ padding: '11px 0 11px 14px' }}>
            <div style={kicker(MUTED, 8.5)}>TEMPO</div>
            <div style={{ font: '800 16px/1 Archivo', marginTop: 6 }}>{exercise.tempo}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, ...kicker(MUTED) }}>EXÉCUTION</div>
        {(exercise.cues || []).map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 9, marginTop: 10 }}>
            <div style={{ font: '800 11px/1.5 Archivo', color: RED }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ font: '400 12px/1.5 Archivo', color: BODY, textWrap: 'pretty' }}>{c}</div>
          </div>
        ))}

        {exercise.sourceName && (
          <div style={{
            marginTop: 16, paddingTop: 12, borderTop: HAIR,
            font: '400 10.5px/1.5 Archivo', color: MUTED, textWrap: 'pretty',
          }}>
            Consignes : <em>{exercise.sourceName}</em> — hasaneyldrm/exercises-dataset.
            {exercise.needs?.length > 0 && ` Matériel : ${exercise.needs.join(', ')}.`}
          </div>
        )}

        {onAdd && (
          <button
            type="button"
            onClick={() => onAdd(exercise)}
            style={button({
              marginTop: 18, width: '100%',
              background: INK, color: 'var(--color-bg)',
              padding: 16, letterSpacing: '.08em',
            })}
          >{addLabel}</button>
        )}
      </div>
    </>
  );
}

/**
 * Le visuel du tiroir : le GIF animé, parce qu'un mouvement ne se lit pas sur
 * une image fixe. L'image fixe sert de repli, puis plus rien — le tiroir garde
 * son sens sans illustration.
 */
function SheetMedia({ exercise }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? exercise.imageUrl : (exercise.gifUrl || exercise.imageUrl);
  if (!src) return null;

  return (
    <figure style={{ margin: '0 0 16px' }}>
      <div style={{
        border: RULE, background: 'var(--color-neutral-200)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: 140,
      }}>
        <img
          src={src}
          alt={exercise.name}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
        />
      </div>
      <figcaption style={{ font: '400 9.5px/1.4 Archivo', color: MUTED, marginTop: 6 }}>
        {exercise.attribution || '© Gym visual'} · chargé depuis le dépôt source
      </figcaption>
    </figure>
  );
}

export { SURF };
