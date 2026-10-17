export function browserHeaders(apiOrigin='', development=false) {
  const connect=["'self'",'https://api.open-meteo.com',apiOrigin,...(development?['ws://localhost:5173','ws://127.0.0.1:5173']:[])].filter(Boolean).join(' ');
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self'${development?" 'unsafe-inline'":''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(self)',
  };
}
