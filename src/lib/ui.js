// Shared style primitives.
//
// The design is set entirely in Archivo with 2px rules, zero radius and
// flush-left labels. Rather than repeat that shorthand in every screen, the
// values it actually uses live here — and every colour comes from the
// Modernist tokens in _ds/, never from a hex typed in a component.

export const INK = 'var(--color-text)';
export const RED = 'var(--color-accent)';
export const RED_DEEP = 'var(--color-accent-700)';
export const RED_TINT = 'var(--color-accent-100)';
export const RED_LIGHT = 'var(--color-accent-400)';
export const GROUND = 'var(--color-bg)';
export const SURF = 'var(--color-surface)';
export const MUTED = 'var(--color-neutral-600)';
export const MUTED_2 = 'var(--color-neutral-700)';
export const BODY = 'var(--color-neutral-900)';
export const BAR = 'var(--color-neutral-300)';
export const FAINT = 'var(--color-neutral-400)';

/** The strong 2px rule that organises every section of the design. */
export const RULE = `2px solid ${INK}`;
/** The lighter cell divider inside a grid. */
export const HAIR = '1px solid color-mix(in srgb, var(--color-text) 40%, transparent)';
export const HAIR_SOFT = '1px solid color-mix(in srgb, var(--color-text) 25%, transparent)';

/** Uppercase eyebrow label — the system's smallest text role. */
export const kicker = (color = MUTED, size = 9) => ({
  font: `600 ${size}px/1 Archivo`,
  letterSpacing: '.14em',
  color,
});

export const title = (size, color = INK) => ({
  font: `800 ${size}px/1.05 Archivo`,
  letterSpacing: '-.02em',
  color,
});

/**
 * Buttons carry their label flush left — a wide button starts its text at the
 * left padding edge, never centred. That rule is in the design system readme
 * and is the easiest thing to lose when writing components by hand.
 */
export const button = (extra = {}) => ({
  border: 0,
  textAlign: 'left',
  cursor: 'pointer',
  font: '700 12px/1 Archivo',
  letterSpacing: '.08em',
  ...extra,
});

/** Interval deltas: slower is the accent, faster or level stays ink. */
export function deltaColor(delta) {
  return String(delta).startsWith('+') ? RED_DEEP : INK;
}

export function typeColors(type) {
  if (type === 'REPOS') return { bg: BAR, fg: MUTED_2, bar: FAINT };
  if (type === 'TRAIL') return { bg: RED, fg: '#fff', bar: RED };
  return { bg: INK, fg: '#fff', bar: INK };
}

/** SVG path helpers for the HR / altitude chart. */
export function linePath(values, h, w = 360) {
  if (!values?.length) return '';
  return values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - v * h).toFixed(1)}`)
    .join(' ');
}

export function areaPath(values, h, w = 360) {
  const line = linePath(values, h, w);
  return line ? `${line} L${w} ${h} L0 ${h} Z` : '';
}
