import { HAIR, INK, MUTED, MUTED_2, RED, RULE, SURF, button, kicker, title } from '../lib/ui.js';

const KIND = { key: 'SEMAINE CLÉ', recovery: 'ASSIMILATION', assimilation: 'ASSIMILATION', mountain: 'BLOC MONTAGNE', 'weekend-block': 'BLOC MONTAGNE', taper: 'AFFÛTAGE', race: 'COURSE' };

export default function ProjectionView({ projection, onClose }) {
  if (!projection?.goal) return <div style={{ padding: '42px 18px' }}><div style={kicker(MUTED)}>PROJECTION</div><h2 style={{ ...title(25), margin: '8px 0' }}>Aucun objectif A</h2><p style={{ font: '400 12.5px/1.5 Archivo', color: MUTED_2 }}>Ajoute un objectif prioritaire pour visualiser les prochaines étapes de ta préparation.</p></div>;
  const milestoneFor = (week) => {
    const weekKey = week.key || week.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey || '')) return null;
    const start = new Date(`${weekKey}T12:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endKey = end.toISOString().slice(0, 10);
    return (projection.milestones || []).find((item) => item.date >= weekKey && item.date <= endKey);
  };
  return <section aria-labelledby="projection-heading">
    <header style={{ padding: '18px', background: INK, color: 'var(--color-bg)' }}>
      <div style={kicker('var(--color-neutral-400)')}>JUSQU’À L’OBJECTIF A</div>
      <h2 id="projection-heading" style={{ ...title(27, 'var(--color-bg)'), margin: '8px 0 0' }}>{projection.goal.name || projection.goal.title}</h2>
      <div style={{ display: 'flex', gap: 18, marginTop: 14 }}><Summary label="RESTANTES" value={`${projection.weeksRemaining} SEMAINES`} /><Summary label="PHASE ACTUELLE" value={String(projection.currentPhase || 'À définir').toUpperCase()} /></div>
    </header>
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: RULE }}>
      {(projection.weeks || []).map((week, index) => {
        const milestone = milestoneFor(week);
        const kind = week.kind || milestone?.kind;
        const label = week.label || week.key;
        const weekTitle = week.title || milestone?.label || `${week.sessions?.length || 0} séance${week.sessions?.length === 1 ? '' : 's'} prévue${week.sessions?.length === 1 ? '' : 's'}`;
        return <li key={week.id || `${label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', borderBottom: HAIR }}>
          <div aria-hidden="true" style={{ padding: '14px 0', textAlign: 'center', background: kind === 'race' ? RED : SURF, color: kind === 'race' ? '#fff' : INK, font: '800 12px/1 Archivo' }}>{index + 1}</div>
          <div style={{ padding: '12px 14px' }}><div style={kicker(kind === 'race' ? RED : MUTED, 8)}>{KIND[kind] || milestone?.label?.toUpperCase() || 'SEMAINE'} · {label}</div><div style={{ font: '800 14px/1.25 Archivo', marginTop: 6 }}>{weekTitle}</div>{week.detail && <div style={{ color: MUTED_2, font: '400 11.5px/1.45 Archivo', marginTop: 4 }}>{week.detail}</div>}</div>
        </li>;
      })}
    </ol>
    {onClose && <button type="button" onClick={onClose} style={button({ margin: 18, padding: 13, border: RULE, background: 'transparent', color: INK })}>REVENIR AU CALENDRIER</button>}
  </section>;
}

function Summary({ label, value }) { return <div><div style={kicker('var(--color-neutral-400)', 8)}>{label}</div><div style={{ font: '800 15px/1 Archivo', marginTop: 5 }}>{value}</div></div>; }
