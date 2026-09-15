import { useState } from 'react';
import { INK, RED, RED_DEEP, MUTED, MUTED_2, RULE, button, kicker } from '../lib/ui.js';

/**
 * Le bandeau de synchronisation, sous le téléphone.
 *
 * Il dit trois choses, et il ne ment sur aucune :
 *
 *   - d'où viennent les données actuellement affichées ;
 *   - à quand remonte le relevé (pas à quand remonte le dernier clic) ;
 *   - ce que le bouton vient réellement de faire — aller chercher des données
 *     chez Coros, ou seulement réassembler ce qui était déjà sur le disque.
 *
 * La distinction compte : un bouton qui affiche « synchronisé » alors qu'il n'a
 * rien téléchargé est pire que pas de bouton du tout.
 */
export default function SyncBar({ meta, syncing, onSync }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const live = meta.source === 'coros-mcp';
  const snap = meta.source === 'coros-snapshot';

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setResult(body);
      // On recharge l'instantané quel que soit le mode : même une
      // reconstruction peut avoir changé quelque chose.
      await onSync();
    } catch (err) {
      setResult({ ok: false, mode: 'error', error: `Pont injoignable — ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  const working = busy || syncing;

  return (
    <div style={{
      marginTop: 14, maxWidth: 402,
      font: '400 11px/1.5 Archivo, system-ui', color: MUTED_2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, flex: 'none',
          background: live ? RED : snap ? INK : 'var(--color-neutral-400)',
        }} />
        <strong style={{ font: '700 10px/1 Archivo', letterSpacing: '.1em', color: INK }}>
          {live ? 'COROS — DIRECT' : snap ? 'COROS — INSTANTANÉ' : 'DONNÉES DE DÉMO'}
        </strong>
        {meta.fetchedAt && (
          <span style={{ font: '400 10px/1 Archivo', color: MUTED }}>
            relevé {ago(meta.fetchedAt)}
          </span>
        )}
        <button
          type="button"
          onClick={sync}
          disabled={working}
          style={button({
            marginLeft: 'auto', border: RULE, background: working ? INK : 'transparent',
            color: working ? 'var(--color-bg)' : INK,
            font: '700 9px/1 Archivo', letterSpacing: '.1em', padding: '7px 9px',
          })}
        >{working ? 'SYNCHRO…' : 'SYNCHRONISER'}</button>
      </div>

      {working && (
        <div style={{ marginTop: 8, height: 3, background: 'var(--color-neutral-300)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '45%', background: RED, animation: 'sweep 1s linear infinite' }} />
        </div>
      )}

      {!working && result && <Report result={result} />}

      {!working && !result && (meta.degraded || meta.reason) && (
        <div style={{ marginTop: 6, textWrap: 'pretty' }}>{meta.degraded || meta.reason}</div>
      )}
    </div>
  );
}

function Report({ result }) {
  const failed = result.mode === 'error' || result.error;
  const rebuilt = result.mode === 'rebuild';

  return (
    <div style={{
      marginTop: 8, borderLeft: `2px solid ${failed ? RED : rebuilt ? 'var(--color-neutral-400)' : RED}`,
      paddingLeft: 10,
    }}>
      <div style={{
        ...kicker(failed ? RED_DEEP : rebuilt ? MUTED : RED_DEEP, 8.5),
      }}>
        {failed ? 'SYNCHRO ÉCHOUÉE' : rebuilt ? 'RECONSTRUCTION LOCALE' : 'SYNCHRONISÉ AVEC COROS'}
      </div>
      <div style={{ marginTop: 5, color: INK, textWrap: 'pretty' }}>
        {result.error || result.message}
      </div>
      {result.reason && (
        <div style={{ marginTop: 5, textWrap: 'pretty' }}>{result.reason}</div>
      )}
      {result.degraded && (
        <div style={{ marginTop: 5, textWrap: 'pretty' }}>{result.degraded}</div>
      )}
      {result.lastActivity && (
        <div style={{ marginTop: 5, color: MUTED }}>
          Dernière activité connue : {result.lastActivity}.
        </div>
      )}
      {result.missing?.length > 0 && (
        <div style={{ marginTop: 5, color: MUTED }}>
          Capacités absentes du serveur : {result.missing.join(', ')}.
        </div>
      )}
    </div>
  );
}

/** « il y a 3 jours » — l'âge du relevé, pas celui du dernier clic. */
function ago(isoLike) {
  const t = new Date(isoLike).getTime();
  if (!isFinite(t)) return '—';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} jour${d > 1 ? 's' : ''}`;
}
