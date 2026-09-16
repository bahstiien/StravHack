import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabaseClient } from '../data/supabase-client.js';
import { createSupabaseDataRepository } from '../data/supabase-repository.js';
import { signInWithPassword } from '../data/auth.js';
import { setApiAccessToken } from '../data/api-client.js';

export default function AuthGate({ children }) {
  const [client] = useState(() => getBrowserSupabaseClient());
  const repository = useMemo(() => createSupabaseDataRepository(client), [client]);
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    setApiAccessToken(session?.access_token);
    return () => setApiAccessToken(null);
  }, [session]);

  async function signIn(event) {
    event.preventDefault();
    setMessage('Connexion en cours…');
    try {
      await signInWithPassword(client, email, password);
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
      <form onSubmit={signIn} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.fr" aria-label="Adresse e-mail" style={{ padding: 14, fontSize: 16 }} />
        <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe" style={{ padding: 14, fontSize: 16 }} />
        <button type="submit" style={{ padding: 14, fontWeight: 800 }}>SE CONNECTER</button>
      </form>
      {message && <p role="status">{message}</p>}
    </main>
  );

  return children({ client, repository, session });
}
