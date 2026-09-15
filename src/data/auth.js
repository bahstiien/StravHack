export async function signInWithPassword(client, email, password) {
  const normalizedEmail = String(email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Adresse e-mail invalide.');
  if (typeof password !== 'string' || password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  const { error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) throw new Error('Adresse e-mail ou mot de passe incorrect.');
  return true;
}
