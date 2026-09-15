import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabaseClient } from '../data/supabase-client.js';
import { createSupabaseDataRepository } from '../data/supabase-repository.js';

export default function AuthGate({ children }) {
  const [client] = useState(() => getBrowserSupabaseClient());
  const repository = useMemo(() => createSupabaseDataRepository(client), [client]);
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

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
    setMessage(error ? error.message : 'Lien de connexion envoyé. Consultez votre e-mail.');
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
      {message && <p role="status">{message}</p>}
    </main>
  );

  return children({ client, repository, session });
}
