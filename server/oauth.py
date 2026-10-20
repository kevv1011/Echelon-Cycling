"""Google OIDC configuration. Only public identity scopes are requested."""
import os
from urllib.parse import urlsplit
from authlib.integrations.starlette_client import OAuth


def configure_google(security):
    origin = os.getenv('APP_ORIGIN', '').rstrip('/')
    parsed = urlsplit(origin)
    local = parsed.hostname in {'localhost', '127.0.0.1'}
    if not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or (parsed.scheme != 'https' and not (local and parsed.scheme == 'http')):
        raise RuntimeError('APP_ORIGIN must be the exact HTTPS frontend origin (or HTTP localhost for development)')
    if security.origins != [origin]:
        raise RuntimeError('Google mode requires CORS_ORIGINS to equal APP_ORIGIN; do not allow arbitrary preview domains')
    if not local and not security.secure_cookie:
        raise RuntimeError('Google sign-in requires secure cookies on public sites')
    client_id, secret = os.getenv('GOOGLE_CLIENT_ID', ''), os.getenv('GOOGLE_CLIENT_SECRET', '')
    session_secret = os.getenv('OAUTH_STATE_SECRET', '')
    if not client_id or not secret or len(session_secret) < 32:
        raise RuntimeError('Google mode requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and OAUTH_STATE_SECRET (32+ random characters)')
    oauth = OAuth()
    google = oauth.register('google', client_id=client_id, client_secret=secret,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile', 'code_challenge_method': 'S256'},
        authorize_params={'prompt': 'select_account'},
        claims_options={'iss': {'values': ['https://accounts.google.com', 'accounts.google.com']}})
    return google, origin, session_secret
