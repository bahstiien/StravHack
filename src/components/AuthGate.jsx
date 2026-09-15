import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabaseClient } from '../data/supabase-client.js';
import { createSupabaseDataRepository } from '../data/supabase-repository.js';
import { verifyEmailCode } from '../data/auth.js';

export default function AuthGate({ children }) {
  const [client] = useState(() => getBrowserSupabaseClient());
  const repository = useMemo(() => createSupabaseDataRepository(client), [client]);
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [client]);

  async function sendLink(event) {
    event.preventDefault();
    setMessage('Envoi en cours…');
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: window.location.origin },
    });
    setLinkSent(!error);
    setMessage(error ? error.message : 'E-mail envoyé. Saisissez le code reçu sans quitter DÉNIVELÉ.');
  }

  async function confirmCode(event) {
    event.preventDefault();
    setMessage('Vérification en cours…');
    try {
      await verifyEmailCode(client, email, code);
      setMessage('Connexion confirmée.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (session === undefined) return <main style={{ padding: 32 }}>Connexion aux données…</main>;
  if (!session) return (
    <main style={{ maxWidth: 420, margin: '12vh auto', padding: 24, fontFamily: 'Archivo, sans-serif' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>DÉNIVELÉ</h1>
      <p>Connectez-vous pour retrouver vos entraînements sur tous vos appareils.</p>
      <form onSubmit={sendLink} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.fr" aria-label="Adresse e-mail" style={{ padding: 14, fontSize: 16 }} />
        <button type="submit" style={{ padding: 14, fontWeight: 800 }}>RECEVOIR UN LIEN DE CONNEXION</button>
      </form>
      {linkSent && (
        <form onSubmit={confirmCode} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          <label htmlFor="email-code" style={{ fontWeight: 700 }}>CODE REÇU PAR E-MAIL</label>
          <input
            id="email-code" required inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456" aria-describedby="email-code-help"
            style={{ padding: 14, fontSize: 20, letterSpacing: '.18em' }}
          />
          <p id="email-code-help" style={{ margin: 0 }}>
            Restez dans cette fenêtre. Le lien contenu dans l’e-mail peut toujours être utilisé dans un navigateur.
          </p>
          <button type="submit" disabled={code.length !== 6} style={{ padding: 14, fontWeight: 800 }}>
            VALIDER LE CODE
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );

  return children({ client, repository, session });
}
