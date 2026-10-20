"""Owner/account access control, bounded requests and security response headers."""
import hashlib
import hmac
import ipaddress
import os
import secrets
import time
from collections import OrderedDict, deque
from urllib.parse import urlsplit
from starlette.responses import JSONResponse

LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1', 'testserver'}
MAX_BODY = 512 * 1024
IDLE_TIMEOUT = 30 * 60
ABSOLUTE_TIMEOUT = 8 * 3600

class Security:
    def __init__(self):
        self.auth_mode = os.getenv('ECHELON_AUTH_MODE', 'owner')
        if self.auth_mode not in {'owner', 'google'}:
            raise RuntimeError('ECHELON_AUTH_MODE must be owner or google')
        self.account_store = None
        self.password = os.getenv('ECHELON_ACCESS_PASSWORD', '')
        self.secure_cookie = os.getenv('ECHELON_COOKIE_SECURE', 'false').lower() == 'true'
        host_defaults = os.getenv('RENDER_EXTERNAL_HOSTNAME', 'localhost,127.0.0.1,::1,testserver')
        self.hosts = [h.strip() for h in os.getenv('ALLOWED_HOSTS', host_defaults).split(',') if h.strip()]
        self.origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',') if o.strip()]
        if not self.hosts or any('*' in h for h in self.hosts) or any('*' in o for o in self.origins):
            raise RuntimeError('Explicit allowed hosts and CORS origins are required')
        public = any(h not in LOCAL_HOSTS for h in self.hosts)
        if self.password and not 16 <= len(self.password) <= 256:
            raise RuntimeError('ECHELON_ACCESS_PASSWORD must have 16 to 256 characters')
        if public and ((not self.password and self.auth_mode != 'google') or not self.secure_cookie or any(urlsplit(o).scheme != 'https' for o in self.origins)):
            raise RuntimeError('Public hosts require an access password, secure cookies and HTTPS origins')
        self.sessions = OrderedDict()
        self.buckets = OrderedDict()

    def local(self, host):
        if host == 'testclient':
            return True
        try:
            return ipaddress.ip_address(host).is_loopback
        except ValueError:
            return False

    def permitted(self, host, token):
        if self.auth_mode == 'google':
            return bool(self.account_store and self.account_store.get(token))
        if not self.password:
            return self.local(host)
        key = hashlib.sha256(token.encode()).hexdigest()
        session = self.sessions.get(key)
        now = time.monotonic()
        if not session or session['expires'] <= now or session['active'] + IDLE_TIMEOUT <= now:
            self.sessions.pop(key, None)
            return False
        return True

    def login(self, password):
        if self.auth_mode == 'google':
            return None
        if not self.password or not hmac.compare_digest(hashlib.sha256(password.encode()).digest(), hashlib.sha256(self.password.encode()).digest()):
            return None
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        self.sessions[hashlib.sha256(token.encode()).hexdigest()] = {'expires': now + ABSOLUTE_TIMEOUT, 'active': now}
        while len(self.sessions) > 100:
            self.sessions.popitem(last=False)
        return token

    def logout(self, token):
        if self.auth_mode == 'google':
            return self.account_store.logout(token)
        self.sessions.pop(hashlib.sha256(token.encode()).hexdigest(), None)

    def touch(self, host, token):
        if self.auth_mode == 'google':
            return self.account_store.touch(token)
        if not self.permitted(host, token):
            return False
        if self.password:
            self.sessions[hashlib.sha256(token.encode()).hexdigest()]['active'] = time.monotonic()
        return True

    def remaining(self, token):
        if self.auth_mode == 'google':
            user = self.account_store.get(token)
            return user['remaining'] if user else 0
        record = self.sessions.get(hashlib.sha256(token.encode()).hexdigest())
        if not record:
            return 0
        now = time.monotonic()
        return max(0, int(min(record['expires'] - now, record['active'] + IDLE_TIMEOUT - now)))

    def limited(self, key, limit, period=60):
        now = time.monotonic()
        bucket = self.buckets.setdefault(key, deque())
        while bucket and bucket[0] <= now - period:
            bucket.popleft()
        self.buckets.move_to_end(key)
        while len(self.buckets) > 2048:
            self.buckets.popitem(last=False)
        if len(bucket) >= limit:
            return True
        bucket.append(now)
        return False

class SecurityMiddleware:
    def __init__(self, app, security):
        self.app, self.security = app, security

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope['headers']}
        path, method = scope['path'], scope['method']
        host = (scope.get('client') or ('', 0))[0]
        async def respond(status, detail):
            await JSONResponse({'detail': detail}, status_code=status)(scope, receive, secured_send)
        async def secured_send(message):
            if message['type'] == 'http.response.start':
                message.setdefault('headers', []).extend([
                    (b'x-content-type-options', b'nosniff'), (b'x-frame-options', b'DENY'),
                    (b'referrer-policy', b'strict-origin-when-cross-origin'),
                    (b'permissions-policy', b'camera=(), microphone=(), geolocation=(self)'),
                    (b'cache-control', b'no-store'),
                    (b'content-security-policy', b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
                ])
            await send(message)
        if path.startswith('/api/'):
            origin = headers.get('origin')
            if origin and origin not in self.security.origins:
                return await respond(403, 'Origin is not allowed')
            if method != 'OPTIONS':
                if self.security.limited(('api', host), 120):
                    return await respond(429, 'Too many requests. Try again in a minute.')
                public = {'/api/health', '/api/auth/status', '/api/auth/login'}
                if self.security.auth_mode == 'google':
                    public.update({'/api/auth/google', '/api/auth/google/callback'})
                    if method not in {'GET', 'HEAD'} and origin not in self.security.origins:
                        return await respond(403, 'A trusted browser origin is required')
                if self.security.auth_mode != 'google' and not self.security.password and not self.security.local(host):
                    return await respond(403, 'Local-only API. Configure authenticated HTTPS access before exposing it.')
                if path not in public:
                    from http.cookies import SimpleCookie
                    cookie = SimpleCookie()
                    try:
                        cookie.load(headers.get('cookie', ''))
                    except Exception:
                        return await respond(401, 'Sign in to the private API')
                    token = cookie.get('echelon_session')
                    if not self.security.permitted(host, token.value if token else ''):
                        return await respond(401, 'Sign in to the private API')
                    if self.security.auth_mode == 'google':
                        user = self.security.account_store.get(token.value if token else '')
                        if not user:
                            return await respond(401, 'Sign in to your rider account')
                        if headers.get('x-echelon-account') != user['id']:
                            return await respond(409, 'Account changed. Refresh the workspace before continuing.')
                if path in {'/api/auth/login', '/api/auth/google'} and self.security.limited(('login', host), 5, 300):
                    return await respond(429, 'Too many sign-in attempts. Try again in five minutes.')
                if path == '/api/routes/plan' and self.security.limited(('routing', host), 6):
                    return await respond(429, 'Routing limit reached. Wait a minute before recalculating.')
            raw_length = headers.get('content-length')
            if raw_length is not None:
                try:
                    length = int(raw_length)
                    if length < 0:
                        raise ValueError()
                except ValueError:
                    return await respond(400, 'Invalid request length')
                if length > MAX_BODY:
                    return await respond(413, 'Request is too large')
            # Bound actual bytes too, including chunked requests without Content-Length.
            body = bytearray()
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                body.extend(message.get('body', b''))
                if len(body) > MAX_BODY:
                    return await respond(413, 'Request is too large')
                if not message.get('more_body', False):
                    break
            sent = False
            async def replay():
                nonlocal sent
                if not sent:
                    sent = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()
            return await self.app(scope, replay, secured_send)
        await self.app(scope, receive, secured_send)
