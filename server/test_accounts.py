"""Identity boundary tests. No Google account, location or external network is used."""
import os
import time
import unittest
from urllib.parse import parse_qs, urlsplit
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.middleware.sessions import SessionMiddleware
from joserfc import jwt
from joserfc.jwk import RSAKey
from server import main
from server.accounts import AccountSession, Base, SessionStore, User
from server.oauth import configure_google
from server.security import IDLE_TIMEOUT, ABSOLUTE_TIMEOUT

ORIGIN = 'http://localhost:5173'
CONFIG = {'APP_ORIGIN': ORIGIN, 'CORS_ORIGINS': ORIGIN, 'GOOGLE_CLIENT_ID': 'test-client',
          'GOOGLE_CLIENT_SECRET': 'test-secret', 'OAUTH_STATE_SECRET': 'test-only-state-secret-with-32-characters'}


class AccountTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.env = patch.dict(os.environ, CONFIG)
        self.env.start()
        self.patches = [patch.object(main, 'engine', self.engine), patch.object(main.security, 'auth_mode', 'google'),
                        patch.object(main.security, 'origins', [ORIGIN]), patch.object(main.security, 'secure_cookie', False),
                        patch.object(main, 'app_origin', ORIGIN)]
        for patcher in self.patches: patcher.start()
        self.google, _, secret = configure_google(main.security)
        self.google.server_metadata.update({'issuer': 'https://accounts.google.com',
            'authorization_endpoint': 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_endpoint': 'https://oauth2.googleapis.com/token',
            'id_token_signing_alg_values_supported': ['RS256'], '_loaded_at': time.time()})
        self.provider = patch.object(main, 'google', self.google)
        self.provider.start()
        main.security.buckets.clear()
        app = SessionMiddleware(main.app, secret_key=secret, session_cookie='echelon_oauth', path='/api/auth', max_age=600)
        self.client = TestClient(app, base_url=ORIGIN, follow_redirects=False)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.provider.stop()
        for patcher in reversed(self.patches): patcher.stop()
        self.env.stop()

    def signin(self, sub):
        token = main.security.account_store.issue({'sub': sub, 'email': f'{sub}@example.com', 'email_verified': True, 'name': sub})
        self.client.cookies.set('echelon_session', token, path='/api')
        user = main.security.account_store.get(token)
        self.client.headers.update({'Origin': ORIGIN, 'X-Echelon-Account': user['id']})
        return token, user

    def plan(self, plan_id='private-plan'):
        return {'id': plan_id, 'name': 'Private ride', 'date': '2026-10-20', 'createdAt': '2026-10-20T00:00:00Z',
            'ride': {'routeId': 'clark', 'distance': 42, 'elevation': 380, 'date': '2026-10-20', 'time': '05:30', 'effort': 'z2', 'condition': 'auto'},
            'profile': main.RiderProfile().model_dump(), 'weather': [], 'source': 'demo', 'plan': {'speed': 25}, 'briefing': 'Private briefing'}

    def test_two_riders_cannot_read_overwrite_or_delete_each_others_data(self):
        with Session(self.engine) as db:
            db.add(main.RiderRecord(id=1, data={**main.RiderProfile().model_dump(), 'ftp': 400}))
            db.add(main.PlanRecord(id='legacy-plan', data=self.plan('legacy-plan')))
            db.commit()
        token_a, user_a = self.signin('rider-a')
        self.assertEqual(self.client.get('/api/profile').json()['ftp'], 240)
        self.assertEqual(self.client.get('/api/plans').json(), [])
        profile = main.RiderProfile().model_dump(); profile['ftp'] = 300
        self.assertEqual(self.client.put('/api/profile', json=profile).status_code, 200)
        self.assertEqual(self.client.post('/api/plans', json=self.plan()).status_code, 201)
        self.signin('rider-b')
        self.assertEqual(self.client.get('/api/profile').json()['ftp'], 240)
        self.assertEqual(self.client.get('/api/plans').json(), [])
        self.assertEqual(self.client.delete('/api/plans/private-plan').status_code, 404)
        # A supplied ownership field must not change which account owns a record.
        self.assertEqual(self.client.post('/api/plans', json={**self.plan(), 'user_id': user_a['id']}).status_code, 422)
        self.assertEqual(self.client.post('/api/plans', json=self.plan()).status_code, 201)
        self.assertEqual(self.client.delete('/api/plans/private-plan').status_code, 204)
        self.client.cookies.clear(); self.client.cookies.set('echelon_session', token_a, path='/api')
        self.client.headers['X-Echelon-Account'] = user_a['id']
        self.assertEqual(len(self.client.get('/api/plans').json()), 1)
        self.assertEqual(self.client.get('/api/profile').json()['ftp'], 300)

    def test_stale_tab_identity_and_untrusted_writes_are_rejected(self):
        _, previous = self.signin('rider-a')
        self.signin('rider-b')
        self.client.headers['X-Echelon-Account'] = previous['id']
        self.assertEqual(self.client.get('/api/profile').status_code, 409)
        self.assertEqual(self.client.put('/api/profile', json={}).status_code, 409)
        self.client.headers.pop('Origin')
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 403)
        self.assertEqual(self.client.post('/api/auth/logout', headers={'Origin': 'https://evil.example'}).status_code, 403)

    def test_sessions_survive_new_store_but_logout_revokes_them(self):
        token, _ = self.signin('rider-a')
        restarted = SessionStore(lambda: self.engine)
        self.assertIsNotNone(restarted.get(token))
        with Session(self.engine) as db:
            row = db.scalar(select(AccountSession))
            self.assertNotEqual(row.digest, token)
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 204)
        self.assertIsNone(restarted.get(token))
        self.assertEqual(self.client.get('/api/plans').status_code, 401)

    def test_idle_and_absolute_expiry_do_not_extend_from_status_polling(self):
        with patch('server.accounts.time.time', return_value=10000): token, _ = self.signin('rider-a')
        with patch('server.accounts.time.time', return_value=10000+IDLE_TIMEOUT-1):
            self.assertTrue(main.security.account_store.get(token))
        with patch('server.accounts.time.time', return_value=10000+IDLE_TIMEOUT):
            self.assertIsNone(main.security.account_store.get(token))
            self.assertFalse(main.security.account_store.touch(token))
        with patch('server.accounts.time.time', return_value=20000): token, _ = self.signin('rider-a')
        for elapsed in range(600, ABSOLUTE_TIMEOUT, 600):
            with patch('server.accounts.time.time', return_value=20000+elapsed):
                self.assertTrue(main.security.account_store.touch(token))
        with patch('server.accounts.time.time', return_value=20000+ABSOLUTE_TIMEOUT):
            self.assertIsNone(main.security.account_store.get(token))

    def test_demo_data_is_imported_explicitly_and_only_into_current_account(self):
        self.signin('rider-a')
        self.assertEqual(self.client.get('/api/plans').json(), [])
        payload = {'profile': None, 'plans': [self.plan()]}
        self.assertEqual(self.client.post('/api/account/import', json=payload).json(), {'imported': 1, 'skipped': 0})
        self.assertEqual(self.client.post('/api/account/import', json=payload).json(), {'imported': 0, 'skipped': 1})
        self.signin('rider-b')
        self.assertEqual(self.client.get('/api/plans').json(), [])

    def test_google_flow_requires_valid_state_nonce_signature_and_audience(self):
        key = RSAKey.generate_key(2048, parameters={'kid': 'test-key'})
        def start():
            response = self.client.get('/api/auth/google')
            self.assertEqual(response.status_code, 302)
            params = parse_qs(urlsplit(response.headers['location']).query)
            self.assertEqual(params['code_challenge_method'], ['S256'])
            self.assertEqual(params['scope'], ['openid email profile'])
            self.assertEqual(params['redirect_uri'], [ORIGIN+'/api/auth/google/callback'])
            return params
        def encoded(params, **overrides):
            now = int(time.time())
            claims = {'iss': 'https://accounts.google.com', 'aud': 'test-client', 'sub': 'google-rider',
                'iat': now, 'exp': now+300, 'nonce': params['nonce'][0], 'email': 'rider@example.com', 'email_verified': True}
            return jwt.encode({'alg': 'RS256', 'kid': 'test-key'}, {**claims, **overrides}, key)
        for changes in ({'aud': 'another-app'}, {'nonce': 'wrong'}, {'iss': 'https://evil.example'}, {'email_verified': False}):
            params = start()
            with patch.object(self.google, 'fetch_access_token', new=AsyncMock(return_value={'id_token': encoded(params, **changes)})), patch.object(self.google, 'fetch_jwk_set', new=AsyncMock(return_value={'keys': [key.as_dict(private=False)]})):
                result = self.client.get('/api/auth/google/callback', params={'code': 'test-code', 'state': params['state'][0]})
            self.assertIn('auth_error', result.headers['location'])
        params = start()
        with patch.object(self.google, 'fetch_access_token', new=AsyncMock(return_value={'id_token': encoded(params)})), patch.object(self.google, 'fetch_jwk_set', new=AsyncMock(return_value={'keys': [key.as_dict(private=False)]})):
            result = self.client.get('/api/auth/google/callback', params={'code': 'test-code', 'state': params['state'][0]})
        self.assertEqual(result.headers['location'], ORIGIN+'/')
        self.assertIn('httponly', result.headers['set-cookie'].lower())
        self.assertIn('samesite=strict', result.headers['set-cookie'].lower())
        self.assertEqual(self.client.get('/api/auth/status').json()['user']['email'], 'rider@example.com')
        # Consumed/missing state cannot authenticate a subsequent request.
        self.assertIn('auth_error', self.client.get('/api/auth/google/callback', params={'code': 'replay', 'state': params['state'][0]}).headers['location'])

    def test_unverified_email_and_reused_email_do_not_merge_accounts(self):
        with self.assertRaises(ValueError):
            main.security.account_store.issue({'sub':'bad','email':'x@example.com','email_verified':False})
        claims = {'email': 'same@example.com', 'email_verified': True}
        first = main.security.account_store.issue({**claims, 'sub': 'google-one'})
        second = main.security.account_store.issue({**claims, 'sub': 'google-two'})
        self.assertNotEqual(main.security.account_store.get(first)['id'], main.security.account_store.get(second)['id'])

    def test_forged_google_signature_and_missing_state_cannot_create_a_user(self):
        trusted = RSAKey.generate_key(2048, parameters={'kid':'key'})
        attacker = RSAKey.generate_key(2048, parameters={'kid':'key'})
        start = self.client.get('/api/auth/google')
        params = parse_qs(urlsplit(start.headers['location']).query)
        now = int(time.time())
        encoded = jwt.encode({'alg':'RS256','kid':'key'}, {'iss':'https://accounts.google.com', 'aud':'test-client',
            'iat':now, 'exp':now+300, 'sub':'fake', 'nonce':params['nonce'][0], 'email':'fake@example.com', 'email_verified':True}, attacker)
        with patch.object(self.google, 'fetch_access_token', new=AsyncMock(return_value={'id_token':encoded})), patch.object(self.google, 'fetch_jwk_set', new=AsyncMock(return_value={'keys':[trusted.as_dict(private=False)]})):
            result = self.client.get('/api/auth/google/callback', params={'code':'fake-code','state':params['state'][0]})
        self.assertIn('auth_error', result.headers['location'])
        start = self.client.get('/api/auth/google')
        params = parse_qs(urlsplit(start.headers['location']).query)
        expired = jwt.encode({'alg':'RS256','kid':'key'}, {'iss':'https://accounts.google.com', 'aud':'test-client',
            'iat':now-1000, 'exp':now-600, 'sub':'expired', 'nonce':params['nonce'][0], 'email':'fake@example.com', 'email_verified':True}, trusted)
        with patch.object(self.google, 'fetch_access_token', new=AsyncMock(return_value={'id_token':expired})), patch.object(self.google, 'fetch_jwk_set', new=AsyncMock(return_value={'keys':[trusted.as_dict(private=False)]})):
            result = self.client.get('/api/auth/google/callback', params={'code':'expired-code','state':params['state'][0]})
        self.assertIn('auth_error', result.headers['location'])
        with patch.object(self.google, 'fetch_access_token', new=AsyncMock()) as fetch:
            self.assertIn('auth_error', self.client.get('/api/auth/google/callback', params={'code':'fake-code','state':'unknown'}).headers['location'])
            fetch.assert_not_awaited()
        with Session(self.engine) as db:
            self.assertIsNone(db.scalar(select(User)))

    def test_google_start_is_rate_limited_and_owner_password_cannot_bypass_accounts(self):
        for _ in range(5):
            self.assertEqual(self.client.get('/api/auth/google').status_code, 302)
        self.assertEqual(self.client.get('/api/auth/google').status_code, 429)
        main.security.buckets.clear()
        self.assertEqual(self.client.post('/api/auth/login', json={'password':'owner-password'}, headers={'Origin':ORIGIN}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
