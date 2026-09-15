import { useId, useState } from 'react';
import { BODY, GROUND, HAIR, INK, MUTED, RED, RULE, button, kicker } from '../lib/ui.js';

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const DEFAULT_DAY = { available: true, durationMin: 60, slot: 'normal', canRun: true, canPpg: true, equipment: [], preferredTime: '', preference: 'aucune' };
const CONSTRAINT_TYPES = [
  ['deplacement', 'Déplacement professionnel'], ['rendez-vous', 'Rendez-vous'], ['vacances', 'Vacances'],
  ['indisponibilite', 'Indisponibilité'], ['creneau', 'Créneau exceptionnel'],
  ['materiel', 'Matériel différent'], ['repos', 'Jour de repos imposé'],
];

export default function AvailabilitySettings({ weeklyAvailability = {}, datedConstraints = [], onSaveWeekly, onAddConstraint, onRemoveConstraint }) {
  const [weekly, setWeekly] = useState(() => Object.fromEntries(DAYS.map((day) => [day, { ...DEFAULT_DAY, ...(weeklyAvailability[day] || {}) }])));
  const [constraint, setConstraint] = useState({ date: '', type: 'indisponibilite', note: '' });
  const setDay = (day, patch) => setWeekly((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  return (
    <section aria-labelledby="availability-title" style={{ borderTop: RULE, paddingTop: 16 }}>
      <h2 id="availability-title" style={{ ...kicker(RED, 11), margin: 0 }}>MES DISPONIBILITÉS</h2>
      <p style={copyStyle}>Ces préférences guident les propositions automatiques.</p>
      {DAYS.map((day) => <DayAvailability key={day} day={day} value={weekly[day]} onChange={(patch) => setDay(day, patch)} />)}
      <MainButton onClick={() => onSaveWeekly?.(weekly)}>ENREGISTRER MES DISPONIBILITÉS</MainButton>

      <div style={{ borderTop: RULE, marginTop: 22, paddingTop: 16 }}>
        <h3 style={{ ...kicker(INK, 10), margin: 0 }}>CONTRAINTES EXCEPTIONNELLES</h3>
        <p style={copyStyle}>Une contrainte datée est prioritaire sur les disponibilités habituelles.</p>
        <ConstraintForm value={constraint} onChange={setConstraint} onSubmit={() => {
          if (!constraint.date) return;
          onAddConstraint?.({ ...constraint });
          setConstraint({ date: '', type: 'indisponibilite', note: '' });
        }} />
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
          {datedConstraints.map((item) => {
            const typeLabel = CONSTRAINT_TYPES.find(([value]) => value === item.type)?.[1] || item.type;
            const dateLabel = formatDate(item.date);
            return <li key={item.id} style={{ borderTop: HAIR, padding: '11px 0' }}><strong style={{ font: '700 11px/1.3 Archivo' }}>{dateLabel} · {typeLabel}</strong>{item.note && <span style={{ display: 'block', ...copyStyle, marginTop: 3 }}>{item.note}</span>}<button type="button" aria-label={`Supprimer la contrainte ${typeLabel} du ${dateLabel}`} onClick={() => onRemoveConstraint?.(item.id)} style={button({ marginTop: 8, padding: 0, background: 'transparent', color: RED, fontSize: 9 })}>SUPPRIMER</button></li>;
          })}
        </ul>
      </div>
    </section>
  );
}

function DayAvailability({ day, value, onChange }) {
  const id = useId();
  return (
    <fieldset style={{ border: 0, borderTop: HAIR, margin: 0, padding: '14px 0' }}>
      <legend style={{ ...kicker(INK, 10), padding: '0 5px 0 0' }}>{day.toUpperCase()}</legend>
      <label style={checkStyle}><input type="checkbox" checked={value.available} onChange={(e) => onChange({ available: e.target.checked })} />Disponible</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <Field id={`${id}-duration`} label="Durée maximale" type="number" min="0" max="1440" value={value.durationMin} disabled={!value.available} onChange={(e) => onChange({ durationMin: Number(e.target.value) })} />
        <Select id={`${id}-slot`} label="Créneau" value={value.slot} disabled={!value.available} onChange={(e) => onChange({ slot: e.target.value })} options={[['court', 'Court'], ['normal', 'Normal'], ['long', 'Long']]} />
      </div>
      <label style={checkStyle}><input type="checkbox" checked={value.canRun} disabled={!value.available} onChange={(e) => onChange({ canRun: e.target.checked })} />Course possible</label>
      <label style={checkStyle}><input type="checkbox" checked={value.canPpg} disabled={!value.available} onChange={(e) => onChange({ canPpg: e.target.checked })} />PPG possible</label>
      <Field id={`${id}-equipment`} label="Matériel accessible" value={(value.equipment || []).join(', ')} disabled={!value.available} onChange={(e) => onChange({ equipment: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="haltères, tapis…" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <Field id={`${id}-time`} label="Heure préférée" type="time" value={value.preferredTime} disabled={!value.available} onChange={(e) => onChange({ preferredTime: e.target.value })} />
        <Select id={`${id}-preference`} label="Préférence" value={value.preference} disabled={!value.available} onChange={(e) => onChange({ preference: e.target.value })} options={[['aucune', 'Aucune'], ['repos', 'Repos'], ['sortie-longue', 'Sortie longue']]} />
      </div>
    </fieldset>
  );
}

function ConstraintForm({ value, onChange, onSubmit }) {
  const id = useId();
  return <div style={{ display: 'grid', gap: 10 }}><Field id={`${id}-date`} label="Date" type="date" value={value.date} onChange={(e) => onChange((current) => ({ ...current, date: e.target.value }))} /><Select id={`${id}-type`} label="Type de contrainte" value={value.type} onChange={(e) => onChange((current) => ({ ...current, type: e.target.value }))} options={CONSTRAINT_TYPES} /><Field id={`${id}-note`} label="Précision facultative" value={value.note} onChange={(e) => onChange((current) => ({ ...current, note: e.target.value }))} /><MainButton disabled={!value.date} onClick={onSubmit}>AJOUTER LA CONTRAINTE</MainButton></div>;
}

function MainButton({ children, ...props }) { return <button type="button" {...props} style={button({ width: '100%', marginTop: 12, border: RULE, padding: '13px 12px', background: INK, color: GROUND })}>{children}</button>; }
function Field({ id, label, ...props }) { return <label htmlFor={id} style={labelStyle}>{label}<input id={id} {...props} style={inputStyle} /></label>; }
function Select({ id, label, options, ...props }) { return <label htmlFor={id} style={labelStyle}>{label}<select id={id} {...props} style={inputStyle}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>; }
const labelStyle = { display: 'grid', gap: 5, color: MUTED, font: '700 9px/1.2 Archivo', letterSpacing: '.05em' };
const checkStyle = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, color: BODY, font: '500 12px/1.3 Archivo' };
const inputStyle = { boxSizing: 'border-box', width: '100%', minWidth: 0, border: RULE, borderRadius: 0, padding: '9px 8px', background: GROUND, color: INK, font: '500 11px/1.2 Archivo' };
const copyStyle = { color: BODY, font: '500 12px/1.45 Archivo' };
function formatDate(value) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
