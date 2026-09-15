import { INK, RED, SURF, MUTED, MUTED_2, RULE, HAIR, kicker, button } from '../lib/ui.js';

const DAYS = [
  ['lun', 'Lundi'], ['mar', 'Mardi'], ['mer', 'Mercredi'], ['jeu', 'Jeudi'],
  ['ven', 'Vendredi'], ['sam', 'Samedi'], ['dim', 'Dimanche'],
];

export function updateReminderPreferences(preferences, key, value) {
  return {
    ...preferences,
    [key]: Array.isArray(value) ? [...value] : value,
  };
}

export default function ReminderSettings({ preferences, onChange, saving = false, error = '' }) {
  const values = preferences || {};
  const enabled = values.enabled !== false;
  const change = (key, value) => onChange?.(updateReminderPreferences(values, key, value));
  const toggleQuietDay = (day) => {
    const current = Array.isArray(values.quietDays) ? values.quietDays : [];
    change('quietDays', current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day]);
  };

  return (
    <section aria-label="Réglages des rappels" style={{ padding: '16px 18px 20px' }}>
      <div style={kicker(MUTED, 9)}>RAPPELS UTILES</div>
      <p style={{ font: '400 11.5px/1.5 Archivo', color: MUTED_2, margin: '7px 0 14px' }}>
        Choisis les actions pour lesquelles tu souhaites être prévenu. Aucun message de motivation générique.
      </p>

      <SwitchRow label="Activer les rappels" checked={enabled} onChange={() => change('enabled', !enabled)} />

      <div aria-disabled={!enabled} style={{ opacity: enabled ? 1 : .48 }}>
        <label style={rowStyle}>
          <span style={labelStyle}>Heure préférée</span>
          <input
            type="time" aria-label="Heure préférée" value={values.preferredTime || '08:00'}
            disabled={!enabled} onChange={(event) => change('preferredTime', event.target.value)}
            style={controlStyle}
          />
        </label>

        <label style={rowStyle}>
          <span style={labelStyle}>Rappel avant la séance</span>
          <select
            aria-label="Rappel avant la séance" value={values.beforeSessionMinutes ?? 60}
            disabled={!enabled} onChange={(event) => change('beforeSessionMinutes', Number(event.target.value))}
            style={controlStyle}
          >
            <option value={0}>Désactivé</option>
            <option value={30}>30 min avant</option>
            <option value={60}>1 h avant</option>
            <option value={120}>2 h avant</option>
            <option value={1440}>La veille</option>
          </select>
        </label>

        <SwitchRow label="Questionnaire quotidien" checked={values.dailyCheckin !== false} disabled={!enabled} onChange={() => change('dailyCheckin', values.dailyCheckin === false)} />
        <SwitchRow label="Alertes de planning" checked={values.planningAlerts !== false} disabled={!enabled} onChange={() => change('planningAlerts', values.planningAlerts === false)} />
        <SwitchRow label="Alertes de récupération" checked={values.recoveryAlerts !== false} disabled={!enabled} onChange={() => change('recoveryAlerts', values.recoveryAlerts === false)} />
        <SwitchRow label="Rappels liés aux objectifs" checked={values.goalReminders !== false} disabled={!enabled} onChange={() => change('goalReminders', values.goalReminders === false)} />

        <fieldset disabled={!enabled} style={{ border: 0, borderTop: HAIR, padding: '14px 0 0', margin: 0 }}>
          <legend style={{ ...labelStyle, padding: 0 }}>Jours silencieux</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginTop: 10 }}>
            {DAYS.map(([id, label]) => {
              const selected = (values.quietDays || []).includes(id);
              return (
                <button
                  key={id} type="button" role="checkbox" aria-checked={selected}
                  aria-label={`${label}, jour silencieux`} onClick={() => toggleQuietDay(id)}
                  style={button({
                    minHeight: 38, border: RULE, background: selected ? INK : SURF,
                    color: selected ? 'var(--color-bg)' : INK, font: '700 9px/1 Archivo',
                  })}
                >{label.slice(0, 1)}</button>
              );
            })}
          </div>
          <div style={{ font: '400 10px/1.4 Archivo', color: MUTED_2, marginTop: 8 }}>
            Les alertes urgentes de sécurité restent visibles dans l’application.
          </div>
        </fieldset>
      </div>

      {saving && <div role="status" aria-live="polite" style={messageStyle}>Enregistrement…</div>}
      {error && <div role="alert" style={{ ...messageStyle, color: RED }}>{error}</div>}
    </section>
  );
}

function SwitchRow({ label, checked, disabled = false, onChange }) {
  return (
    <div style={rowStyle}>
      <span id={`reminder-${label.replace(/\s/g, '-').toLowerCase()}`} style={labelStyle}>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label}
        disabled={disabled} onClick={onChange}
        style={button({
          width: 46, height: 28, padding: 3, border: RULE,
          background: checked ? INK : SURF, display: 'flex', alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start', opacity: disabled ? .65 : 1,
        })}
      >
        <span aria-hidden="true" style={{ width: 20, height: 20, background: checked ? 'var(--color-bg)' : MUTED }} />
      </button>
    </div>
  );
}

const rowStyle = {
  minHeight: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: 14, borderTop: HAIR,
};
const labelStyle = { font: '700 12px/1.3 Archivo', color: INK };
const controlStyle = {
  minHeight: 38, maxWidth: 145, border: RULE, borderRadius: 0,
  background: SURF, color: INK, padding: '0 8px', font: '600 11px/1 Archivo',
};
const messageStyle = { marginTop: 12, font: '600 11px/1.4 Archivo', color: MUTED_2 };
