import { useId, useState } from 'react';
import { BODY, GROUND, HAIR, INK, MUTED, RED, RED_TINT, RULE, button, kicker } from '../lib/ui.js';

const REASONS = [
  ['temps', 'Manque de temps'], ['fatigue', 'Fatigue'], ['douleur', 'Douleur ou blessure'],
  ['indisponibilite', 'Indisponibilité personnelle'], ['materiel', 'Matériel indisponible'],
  ['non-pertinente', 'Séance non pertinente'], ['autre', 'Autre'],
];
const STRATEGIES = [
  ['none', 'Supprimer uniquement cette séance'], ['reschedule', 'Chercher automatiquement un autre créneau'],
  ['shorter', 'Proposer une séance plus courte'], ['recovery', 'Remplacer par de la récupération ou de la mobilité'],
];

export default function PlanningActions({
  session, dateOptions = [], canRestore = false, canUndo = false, initialAction = null,
  onValidate, onMove, onModify, onReject, onRestore, onUndo,
}) {
  const [action, setAction] = useState(initialAction);
  if (!session) return null;
  const completed = session.completed || session.status === 'RÉALISÉE';

  if (completed) return <p style={{ color: MUTED, font: '500 12px/1.45 Archivo' }}>Cette séance réalisée ne peut plus être modifiée.</p>;

  const run = (callback, ...args) => {
    callback?.(...args);
    setAction(null);
  };

  return (
    <section aria-label={`Actions sur la séance ${session.title}`} style={{ borderTop: RULE, paddingTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Action primary onClick={() => run(onValidate, session.id)}>VALIDER</Action>
        <Action onClick={() => setAction('move')}>DÉPLACER</Action>
        <Action onClick={() => setAction('modify')}>MODIFIER</Action>
        <Action onClick={() => setAction('reject')}>REFUSER</Action>
      </div>
      {canRestore && <Action wide onClick={() => run(onRestore, session.id)}>RESTAURER LA PROPOSITION</Action>}
      {canUndo && <Action wide onClick={() => run(onUndo)}>ANNULER LA DERNIÈRE ACTION</Action>}
      {action === 'move' && <MoveDialog session={session} options={dateOptions} onCancel={() => setAction(null)} onSubmit={(date, details) => run(onMove, session.id, date, details)} />}
      {action === 'modify' && <ModifyDialog session={session} onCancel={() => setAction(null)} onSubmit={(changes) => run(onModify, session.id, changes)} />}
      {action === 'reject' && <RejectDialog session={session} onCancel={() => setAction(null)} onSubmit={(details) => run(onReject, session.id, details)} />}
    </section>
  );
}

function Action({ children, primary = false, wide = false, ...props }) {
  return <button type="button" {...props} style={button({
    marginTop: wide ? 8 : 0, width: wide ? '100%' : undefined, padding: '13px 12px',
    border: RULE, background: primary ? INK : GROUND, color: primary ? GROUND : INK,
  })}>{children}</button>;
}

function Dialog({ title, children, onCancel }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="planning-dialog-title" style={{ marginTop: 12, border: RULE, padding: 14, background: GROUND }}>
      <div id="planning-dialog-title" style={kicker(RED, 10)}>{title}</div>
      {children}
      <Action wide onClick={onCancel}>ANNULER</Action>
    </div>
  );
}

function MoveDialog({ options, onCancel, onSubmit }) {
  const [date, setDate] = useState(options[0]?.date || '');
  const selected = options.find((option) => option.date === date);
  return (
    <Dialog title="DÉPLACER LA SÉANCE" onCancel={onCancel}>
      <fieldset style={{ border: 0, margin: '12px 0 0', padding: 0 }}>
        <legend style={{ ...kicker(INK), marginBottom: 8 }}>CHOISIR UNE NOUVELLE DATE</legend>
        {options.length === 0 && <p style={copyStyle}>Aucun créneau compatible n’est disponible.</p>}
        {options.map((option) => {
          const availability = option.availability || {};
          return (
            <label key={option.date} style={{ display: 'block', borderTop: HAIR, padding: '10px 0', cursor: 'pointer' }}>
              <span style={{ display: 'flex', gap: 8 }}>
                <input type="radio" name="planning-date" value={option.date} checked={date === option.date} onChange={() => setDate(option.date)} />
                <strong style={{ font: '700 11px/1.2 Archivo' }}>{option.label || formatDate(option.date)}</strong>
              </span>
              <span style={{ display: 'block', margin: '5px 0 0 24px', color: availability.available ? BODY : RED, font: '500 11px/1.4 Archivo' }}>
                {availability.available ? `${availability.durationMin || 0} min disponibles` : 'Indisponible'}
                {availability.equipment?.length ? ` · ${availability.equipment.join(', ')}` : ''}
              </span>
              {!!option.sessions?.length && <span style={detailStyle}>Séances : {option.sessions.join(', ')}</span>}
              {option.compatibility && <span style={{ ...detailStyle, color: option.warnings?.length ? RED : INK, fontWeight: 700 }}>{option.compatibility}</span>}
              {option.warnings?.map((warning) => <span key={warning} style={{ ...detailStyle, color: RED }}>Attention : {warning}</span>)}
            </label>
          );
        })}
      </fieldset>
      {selected?.warnings?.length > 0 && <p role="alert" style={{ ...copyStyle, background: RED_TINT, padding: 10 }}>Cet avertissement n’est pas bloquant. Tu peux confirmer ce choix.</p>}
      <Action primary wide disabled={!date} onClick={() => onSubmit(date, { acknowledgeWarnings: !!selected?.warnings?.length })}>CONFIRMER LE DÉPLACEMENT</Action>
    </Dialog>
  );
}

function ModifyDialog({ session, onCancel, onSubmit }) {
  const id = useId();
  const [values, setValues] = useState({
    durationMin: session.durationMin ?? '', time: session.time ?? '', type: session.type ?? 'course',
    intensity: session.intensity ?? 'facile', distanceKm: session.distanceKm ?? '', dplus: session.dplus ?? '',
    repetitions: session.repetitions ?? '', ppgContent: session.ppgContent ?? '', comment: session.comment ?? '',
  });
  const [error, setError] = useState('');
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const submit = () => {
    const durationMin = Number(values.durationMin);
    if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 600) return setError('La durée doit être comprise entre 5 et 600 minutes.');
    const nonNegative = ['distanceKm', 'dplus', 'repetitions'];
    if (nonNegative.some((key) => values[key] !== '' && Number(values[key]) < 0)) return setError('La distance, le dénivelé et les répétitions doivent être positifs.');
    onSubmit({ ...values, durationMin, distanceKm: numberOrNull(values.distanceKm), dplus: numberOrNull(values.dplus), repetitions: numberOrNull(values.repetitions) });
  };
  return (
    <Dialog title="MODIFIER LA SÉANCE" onCancel={onCancel}>
      <p id="planning-modify-help" style={copyStyle}>Les valeurs sont contrôlées avant l’enregistrement. Le matériel PPG sera vérifié par le planning.</p>
      <div aria-describedby="planning-modify-help" style={{ display: 'grid', gap: 10 }}>
        <Field id={`${id}-duration`} label="Durée (min)" type="number" min="5" max="600" value={values.durationMin} onChange={update('durationMin')} />
        <Field id={`${id}-time`} label="Horaire indicatif" type="time" value={values.time} onChange={update('time')} />
        <Select id={`${id}-type`} label="Type de séance" value={values.type} onChange={update('type')} options={['course', 'trail', 'ppg', 'mobilité', 'récupération']} />
        <Select id={`${id}-intensity`} label="Intensité cible" value={values.intensity} onChange={update('intensity')} options={['récupération', 'facile', 'modérée', 'soutenue', 'intense']} />
        <Field id={`${id}-distance`} label="Distance (km)" type="number" min="0" step="0.1" value={values.distanceKm} onChange={update('distanceKm')} />
        <Field id={`${id}-dplus`} label="Dénivelé positif (m)" type="number" min="0" value={values.dplus} onChange={update('dplus')} />
        <Field id={`${id}-reps`} label="Répétitions ou blocs" type="number" min="0" value={values.repetitions} onChange={update('repetitions')} />
        <Field id={`${id}-ppg`} label="Contenu PPG" value={values.ppgContent} onChange={update('ppgContent')} />
        <label style={labelStyle}>Commentaire personnel<textarea value={values.comment} onChange={update('comment')} style={{ ...inputStyle, minHeight: 70 }} /></label>
      </div>
      {error && <p role="alert" style={{ ...copyStyle, color: RED }}>{error}</p>}
      <Action primary wide onClick={submit}>ENREGISTRER LES MODIFICATIONS</Action>
    </Dialog>
  );
}

function RejectDialog({ onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  const [replacementStrategy, setStrategy] = useState('none');
  return (
    <Dialog title="REFUSER LA SÉANCE" onCancel={onCancel}>
      <label style={labelStyle}>Motif facultatif<select value={reason} onChange={(event) => setReason(event.target.value)} style={inputStyle}><option value="">Aucun motif</option>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}><legend style={labelStyle}>Que doit faire l’application ?</legend>{STRATEGIES.map(([value, label]) => <label key={value} style={{ display: 'flex', gap: 8, marginTop: 9, font: '500 12px/1.35 Archivo' }}><input type="radio" name="reject-strategy" value={value} checked={replacementStrategy === value} onChange={() => setStrategy(value)} />{label}</label>)}</fieldset>
      <Action primary wide onClick={() => onSubmit({ reason: reason || null, replacementStrategy })}>CONFIRMER LE REFUS</Action>
    </Dialog>
  );
}

function Field({ id, label, ...props }) { return <label htmlFor={id} style={labelStyle}>{label}<input id={id} {...props} style={inputStyle} /></label>; }
function Select({ id, label, options, ...props }) { return <label htmlFor={id} style={labelStyle}>{label}<select id={id} {...props} style={inputStyle}>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>; }
const numberOrNull = (value) => value === '' ? null : Number(value);
const copyStyle = { color: BODY, font: '500 12px/1.45 Archivo' };
const detailStyle = { display: 'block', margin: '3px 0 0 24px', color: MUTED, font: '500 10px/1.35 Archivo' };
const labelStyle = { display: 'grid', gap: 5, color: INK, font: '700 10px/1.2 Archivo', letterSpacing: '.04em' };
const inputStyle = { boxSizing: 'border-box', width: '100%', border: RULE, borderRadius: 0, padding: '10px 9px', background: GROUND, color: INK, font: '500 12px/1.2 Archivo' };
function formatDate(value) { return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`)).toUpperCase(); }

