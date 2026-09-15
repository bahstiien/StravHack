// Les signaux sonores et les vibrations de la séance guidée.
//
// Pendant un intervalle, personne ne regarde son téléphone : c'est le son qui
// dit quand partir et quand s'arrêter. Trois bips sur les trois dernières
// secondes, un son grave et long au départ de l'effort, un son court et aigu
// pour la récupération, deux notes pour la fin d'un bloc.
//
// Tout est synthétisé avec l'oscillateur du navigateur : aucun fichier audio à
// télécharger, rien à héberger, et donc rien qui puisse manquer. Le contexte
// audio n'est créé qu'au premier appel — les navigateurs refusent d'en ouvrir
// un avant une interaction de l'utilisateur, et en créer un au chargement de
// la page ne ferait qu'écrire une erreur dans la console.
//
// Ce que ce fichier NE fait pas, volontairement : promettre que le son
// continuera écran verrouillé. Un onglet mis en veille par le système ne reçoit
// plus de temps d'exécution, et aucune API ne le garantit ici. L'écran le dit
// plutôt que de laisser croire le contraire.

const TONES = {
  // [fréquence Hz, durée s, forme]
  compte: [880, 0.09, 'sine'],
  depart: [520, 0.45, 'square'],
  recuperation: [660, 0.16, 'sine'],
  finBloc: [440, 0.22, 'triangle'],
  finSeance: [330, 0.5, 'triangle'],
};

const VIBRATIONS = {
  compte: 40,
  depart: [90, 60, 90],
  recuperation: 60,
  finBloc: [120, 80, 120],
  finSeance: [200, 100, 200],
};

/**
 * Crée un émetteur de signaux.
 *
 * @param {{enabled?: boolean}} options
 */
export function createSignals({ enabled = true } = {}) {
  let context = null;
  let on = enabled;

  function ensureContext() {
    if (context) return context;
    try {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      return context;
    } catch {
      // Pas d'audio sur cet appareil : la séance se déroule sans, en silence.
      return null;
    }
  }

  function beep(name) {
    const ctx = ensureContext();
    if (!ctx) return;
    const [freq, duration, type] = TONES[name] ?? TONES.compte;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      // Une attaque et une extinction douces : un créneau coupé net claque dans
      // le haut-parleur d'un téléphone.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      // Un signal qui ne sort pas n'interrompt pas une séance.
    }
  }

  function buzz(name) {
    try {
      if (typeof navigator === 'undefined' || !navigator.vibrate) return;
      navigator.vibrate(VIBRATIONS[name] ?? 40);
    } catch { /* la vibration est un bonus, jamais une dépendance */ }
  }

  return {
    /** Le son doit-il sortir ? */
    get enabled() { return on; },
    setEnabled(value) {
      on = Boolean(value);
      // Ouvrir le contexte sur le geste qui active le son : c'est le seul
      // moment où le navigateur l'autorise à coup sûr.
      if (on) ensureContext();
    },
    /** Émet un signal. La vibration suit le son : coupée aussi quand il l'est. */
    emit(name) {
      if (!on) return;
      beep(name);
      buzz(name);
    },
    /** Libère le contexte audio en quittant la séance. */
    close() {
      try { context?.close(); } catch { /* déjà fermé */ }
      context = null;
    },
  };
}

/**
 * Le signal qui correspond à l'entrée dans une phase.
 *
 * Fonction pure, séparée de l'émetteur : c'est elle que l'écran appelle quand
 * la phase change, et elle se relit sans brancher de haut-parleur.
 */
export function signalForPhase(phase, { isLast = false } = {}) {
  if (!phase) return null;
  if (phase.kind === 'recuperation') return 'recuperation';
  if (phase.kind === 'decompte') return null;
  if (isLast) return 'finSeance';
  return 'depart';
}
