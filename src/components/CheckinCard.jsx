import {
  INK, RED, RED_TINT, GROUND, SURF, MUTED, MUTED_2, BODY, RULE, HAIR,
  kicker, button,
} from '../lib/ui.js';
import { STATUS, STATUS_LABELS } from '../data/checkin-engine.js';
import { explain, summaryLines } from '../data/checkin-explain.js';

/**
 * Le point du jour, tel qu'il apparaît dans la semaine et dans la séance.
 *
 * Deux états seulement : l'invitation, et le résumé. Le résumé ne redemande
 * rien — il rappelle ce qui a été répondu, à quelle heure, et ce qui en a été
 * conclu. Le questionnaire ne se rouvre que si on le demande.
 */
export default function CheckinCard({ date, entry, onOpen, onEdit, compact = false }) {
  if (!entry) {
    return (
      <div style={{
        borderBottom: HAIR, background: RED_TINT,
        padding: compact ? '12px 18px' : '14px 18px',
      }}>
        <div style={kicker(RED, 9.5)}>AVANT DE T’ENTRAÎNER</div>
        <div style={{ font: '700 13px/1.35 Archivo', marginTop: 7, color: INK, textWrap: 'pretty' }}>
          Trente secondes pour dire comment tu es aujourd’hui, et la séance
          s’ajuste à ce que tu as réellement.
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={button({
            marginTop: 11, width: '100%', background: RED, color: '#fff',
            padding: 15, letterSpacing: '.1em',
          })}
        >FAIRE LE POINT</button>
      </div>
    );
  }

  const { recommendation, answers } = entry;
  const lines = summaryLines(answers);
  const heure = timeOf(entry.updatedAt);

  return (
    <div style={{ borderBottom: HAIR, background: SURF, padding: '13px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={kicker(MUTED, 9.5)}>POINT DU JOUR</div>
        <div style={{ font: '500 9.5px/1 Archivo', color: MUTED, letterSpacing: '.06em' }}>
          MIS À JOUR À {heure}
        </div>
      </div>

      <div style={{ font: '800 13px/1.3 Archivo', marginTop: 8, letterSpacing: '-.01em', color: INK }}>
        {STATUS_LABELS[recommendation?.status] ?? '—'}
      </div>

      <div style={{ font: '400 11.5px/1.5 Archivo', color: BODY, marginTop: 6, textWrap: 'pretty' }}>
        {lines.map((line) => `${line.label} : ${line.value}`).join(' · ')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 11 }}>
        <button
          type="button"
          onClick={onOpen}
          style={button({ border: RULE, background: GROUND, color: INK, padding: '11px 10px' })}
        >VOIR LE DÉTAIL</button>
        <button
          type="button"
          onClick={onEdit}
          style={button({ border: RULE, background: GROUND, color: INK, padding: '11px 10px' })}
        >MODIFIER</button>
      </div>
    </div>
  );
}

function timeOf(iso) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/**
 * Le résultat : la synthèse, la recommandation expliquée, l'adaptation
 * proposée, et les quatre décisions possibles.
 *
 * Aucune de ces décisions n'est prise ici — chacune appelle la fonction que
 * l'écran parent a branchée sur la logique de planning déjà en place. Un bouton
 * qui n'a rien derrière n'est pas affiché : c'est pourquoi « appliquer »
 * disparaît quand il n'y a rien à appliquer, plutôt que de rester grisé sans
 * raison lisible.
 */
export function CheckinResult({
  entry, proposal, session, onApply, onKeep, onMove, onEdit, onClose, decisionError = '',
}) {
  if (!entry) return null;
  const { recommendation, answers } = entry;
  const texte = explain(recommendation, { answers, context: entry.context });

  const decided = entry.userDecision?.action ?? null;
  const canApply = Boolean(proposal?.applicable && proposal.changes && onApply);
  const canMove = Boolean(session && onMove
    && recommendation.status !== STATUS.NO_SESSION);
  const canKeep = Boolean(session && onKeep);

  return (
    <div style={{ fontFamily: 'Archivo, system-ui', color: INK }}>
      <section aria-label="Disponibilité du jour" style={{ border: RULE, padding: 14, background: SURF }}>
        <div style={kicker(MUTED)}>DISPONIBILITÉ DU JOUR</div>
        <dl style={{ margin: '10px 0 0', display: 'grid', gap: 7 }}>
          {summaryLines(answers).map((line) => (
            <div key={line.label} style={{ display: 'flex', gap: 6, font: '500 12.5px/1.4 Archivo', color: BODY }}>
              <dt style={{ font: '700 12.5px/1.4 Archivo', color: INK }}>{line.label} :</dt>
              <dd style={{ margin: 0 }}>{line.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Recommandation" style={{ marginTop: 14, border: `2px solid ${RED}`, padding: 14 }}>
        <h3 style={{ font: '800 15px/1.2 Archivo', letterSpacing: '.02em', margin: 0, color: RED }}>
          {texte.title}
        </h3>
        <p style={{ font: '400 12.5px/1.6 Archivo', color: INK, margin: '10px 0 0', textWrap: 'pretty' }}>
          {texte.paragraph}
        </p>
        {texte.bullets.length > 1 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 17, font: '400 11.5px/1.55 Archivo', color: BODY }}>
            {texte.bullets.map((bullet) => <li key={bullet} style={{ marginTop: 3 }}>{bullet}</li>)}
          </ul>
        )}
        <p style={{ font: '400 10.5px/1.5 Archivo', color: MUTED, margin: '11px 0 0' }}>
          {texte.note}
        </p>
      </section>

      {proposal?.after && (
        <section aria-label="Séance adaptée" style={{ marginTop: 14, border: RULE, padding: 14 }}>
          <div style={kicker(MUTED)}>SÉANCE ADAPTÉE</div>
          <div style={{ display: 'grid', gap: 5, marginTop: 10, font: '500 12px/1.45 Archivo', color: BODY }}>
            <div><strong style={{ color: INK }}>Avant :</strong> {proposal.before.label}</div>
            <div><strong style={{ color: INK }}>Après :</strong> {proposal.after.label}</div>
          </div>
          <div style={{ display: 'grid', gap: 5, marginTop: 11, font: '400 11.5px/1.45 Archivo', color: BODY }}>
            {proposal.removed.length > 0 && (
              <div><strong style={{ color: INK }}>Retiré :</strong> {proposal.removed.join(', ')}</div>
            )}
            {proposal.kept.length > 0 && (
              <div><strong style={{ color: INK }}>Conservé :</strong> {proposal.kept.join(', ')}</div>
            )}
            {proposal.added.length > 0 && (
              <div><strong style={{ color: INK }}>Ajouté :</strong> {proposal.added.join(', ')}</div>
            )}
          </div>
          {proposal.notes.length > 0 && (
            <ul style={{ margin: '11px 0 0', paddingLeft: 17, font: '400 11px/1.5 Archivo', color: MUTED_2 }}>
              {proposal.notes.map((note) => <li key={note} style={{ marginTop: 3 }}>{note}</li>)}
            </ul>
          )}
        </section>
      )}

      {proposal && !proposal.applicable && proposal.blockedReason && (
        <p role="note" style={{
          marginTop: 12, padding: 11, background: RED_TINT,
          font: '600 11.5px/1.5 Archivo', color: INK, textWrap: 'pretty',
        }}>{proposal.blockedReason}</p>
      )}

      {decided && (
        <p style={{ marginTop: 12, font: '600 11px/1.5 Archivo', color: MUTED_2 }}>
          Décision déjà prise aujourd’hui : {DECISION_LABELS[decided] ?? decided}.
        </p>
      )}

      {decisionError && (
        <p role="alert" style={{ marginTop: 12, font: '600 11.5px/1.5 Archivo', color: RED }}>
          {decisionError}
        </p>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        {canApply && (
          <button
            type="button"
            onClick={() => onApply(proposal)}
            style={button({
              width: '100%', background: RED, color: '#fff', padding: 16, letterSpacing: '.1em',
            })}
          >APPLIQUER L’ADAPTATION</button>
        )}
        {canKeep && (
          <button
            type="button"
            onClick={onKeep}
            style={button({
              width: '100%', border: RULE, background: GROUND, color: INK,
              padding: 14, letterSpacing: '.1em',
            })}
          >GARDER LA SÉANCE PRÉVUE</button>
        )}
        {canMove && (
          <button
            type="button"
            onClick={onMove}
            style={button({
              width: '100%', border: RULE, background: GROUND, color: INK,
              padding: 14, letterSpacing: '.1em',
            })}
          >DÉPLACER LA SÉANCE</button>
        )}
        <button
          type="button"
          onClick={onEdit}
          style={button({
            width: '100%', border: RULE, background: GROUND, color: INK,
            padding: 14, letterSpacing: '.1em',
          })}
        >MODIFIER MES RÉPONSES</button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={button({
              width: '100%', border: 0, background: 'transparent', color: MUTED,
              padding: 10, letterSpacing: '.1em',
            })}
          >FERMER</button>
        )}
      </div>
    </div>
  );
}

const DECISION_LABELS = {
  apply: 'adaptation appliquée',
  keep: 'séance conservée',
  move: 'séance déplacée',
};
