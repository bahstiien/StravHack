export async function verifyEmailCode(client, email, code) {
  const normalizedEmail = String(email || '').trim();
  const token = String(code || '').replace(/\D/g, '');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Adresse e-mail invalide.');
  if (!/^\d{6}$/.test(token)) throw new Error('Le code doit contenir 6 chiffres.');
  const { error } = await client.auth.verifyOtp({ email: normalizedEmail, token, type: 'email' });
  if (error) throw new Error('Code invalide ou expiré. Demandez un nouveau code.');
  return true;
}
