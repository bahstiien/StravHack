const DEFAULT = Object.freeze({
  available: true, maxDurationMin: null, slot: 'normal', runPossible: true,
  // null signifie « non renseigné » : ce n'est pas la même chose qu'une liste
  // explicitement vide, qui signifie qu'aucun matériel n'est accessible.
  ppgPossible: true, equipment: null, preferredTime: null, preference: null,
});

function localDay(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function effectiveAvailability(date, recurring = {}, exceptions = []) {
  const base = recurring[String(localDay(date))] || recurring[localDay(date)] || {};
  const exception = [...exceptions].reverse().find((item) => item?.date === date);
  return exception
    ? { ...DEFAULT, ...base, ...exception, source: 'exception' }
    : { ...DEFAULT, ...base, date, source: 'recurring' };
}

export function setWeeklyAvailability(availability, day, changes) {
  if (!Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6) throw new Error('Jour de semaine invalide.');
  return { ...availability, [day]: { ...(availability?.[day] || DEFAULT), ...changes } };
}

export function setDateException(exceptions, exception) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception?.date || '')) throw new Error('Date exceptionnelle invalide.');
  return [...(exceptions || []).filter((item) => item.date !== exception.date), { ...exception }];
}
