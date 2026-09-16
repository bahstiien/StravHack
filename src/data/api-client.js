let accessToken = null;

export function setApiAccessToken(token) {
  accessToken = typeof token === 'string' && token ? token : null;
}

export function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...options, headers });
}
