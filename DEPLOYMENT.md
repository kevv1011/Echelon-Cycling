# Connect personal rider accounts

The Vercel site is already live at **https://echelon-cycling.vercel.app**. Keep its demo flags enabled until the backend below is running. Pushing the account code alone does not enable accounts or upload visitors' browser data.

The first account release supports **Continue with Google**. Each person can use their own primary or alternate Google account. Email/password and email magic links are not implemented; they require a separate identity/email delivery setup. No Gmail inbox access is requested.

## 1. Create the Google web client

In [Google Auth Platform](https://console.cloud.google.com/auth/overview), create/select a project and configure Echelon's app name, support email and developer contact. Start with an **External / Testing** audience and add only your own test Google accounts. Publish to a wider audience after testing; follow any consent-screen/domain verification requirements Google shows.

Create an OAuth client with type **Web application**. Use:

| Setting | Exact value |
| --- | --- |
| Authorized JavaScript origin, if requested | `https://echelon-cycling.vercel.app` |
| Authorized redirect URI | `https://echelon-cycling.vercel.app/api/auth/google/callback` |

Save the client ID and client secret **in Render's backend environment** in step 3. Do not paste them into chat, the repo, a Vercel `VITE_` setting, or a screenshot. Echelon requests only `openid email profile`. Google verifies the password; Authlib checks the signed ID token, issuer, audience, expiry and nonce. OAuth state and PKCE bind the callback to the initiating browser.

## 2. Create durable PostgreSQL storage

In [Render](https://dashboard.render.com/), create a PostgreSQL database, preferably in the same region as the API (the example Blueprint uses Singapore). Copy its **Internal Database URL** into the API service's `DATABASE_URL`. Other managed PostgreSQL providers can also work, using their required TLS settings.

Choose a database plan suitable for lasting data. Render's free database expires after 30 days; do not use it for real riders' long-term plans. Enable backups on the chosen plan and restrict external database access. The app normalizes Render's `postgresql://` URL to SQLAlchemy's psycopg driver automatically. Public account mode refuses SQLite. PostgreSQL integration still needs to be checked against your actual database.

## 3. Create the Render web service

Connect the same `kevv1011/Echelon-Cycling` repository as a **Python Web Service**. Keep the repo root as the working directory.

| Setting | Value |
| --- | --- |
| Build command | `pip install -r server/requirements.txt` |
| Start command | `python -m uvicorn server.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers --no-access-log` |
| Health check | `/api/health` |

Alternatively import the provided `render.yaml` as a Blueprint. It creates only an API service, prompts for your database URL/Google credentials, and generates the OAuth-state secret. The included API plan is free and sleeps when idle; paid compute avoids cold-start delays. Review the selected plan in Render before creating it. No database or paid service has been created by this code change.

Set these backend environment variables:

| Name | Value |
| --- | --- |
| `ECHELON_AUTH_MODE` | `google` |
| `APP_ORIGIN` | `https://echelon-cycling.vercel.app` |
| `CORS_ORIGINS` | `https://echelon-cycling.vercel.app` |
| `ALLOWED_HOSTS` | Optional on Render: defaults to Render's exact `RENDER_EXTERNAL_HOSTNAME`. For a custom API domain, set an explicit comma-separated hostname list (no schemes or slashes). |
| `ECHELON_COOKIE_SECURE` | `true` |
| `DATABASE_URL` | Internal PostgreSQL URL from step 2 |
| `GOOGLE_CLIENT_ID` | Client ID from step 1 |
| `GOOGLE_CLIENT_SECRET` | Client secret from step 1 |
| `OAUTH_STATE_SECRET` | At least 32 cryptographically random characters; Blueprint generates this |

No `ECHELON_ACCESS_PASSWORD` is needed in Google mode. Deploy, then check `https://YOUR-REAL-SERVICE.onrender.com/api/health` returns `status: ok`. The first startup creates new account tables. It does not convert or expose the old single-owner profile/plan tables. Future schema changes need explicit migrations; `create_all` is not a migration system.

Use a single API worker for this initial release: login limits and route cache remain process-local. With `--no-proxy-headers`, clients behind Render/Vercel can share rate-limit buckets; the conservative limits can affect multiple riders during testing. Configure trusted proxy addresses and edge rate limiting before a larger public launch. Do not blindly trust arbitrary forwarded headers.

## 4. Connect Vercel to the real API

Once Render supplies its real URL, run locally:

```text
npm run configure:backend -- https://YOUR-REAL-SERVICE.onrender.com
```

This adds a `/api/:path*` rewrite to `vercel.json`. It does not deploy or commit anything. Review and push it yourself. Vercel forwards API requests while the browser stays on the Vercel origin; this is required for the app's SameSite cookies. Do not point `VITE_API_URL` directly at the unrelated Render domain.

In Vercel, change the **Production** environment variables:

| Name | Value |
| --- | --- |
| `VITE_HOSTED_DEMO` | `false` |
| `VITE_USE_MOCK_API` | `false` |
| `VITE_ACCOUNTS_ENABLED` | `true` |
| `VITE_API_URL` | unset |

Redeploy after changing environment variables. Keep **Preview** deployments in demo mode (`VITE_HOSTED_DEMO=true`, `VITE_USE_MOCK_API=true`, `VITE_ACCOUNTS_ENABLED=false`) unless a dedicated staging backend and Google redirect are configured. Do not wildcard all preview origins. GitHub Pages stays a separate account-free demo.

## 5. Verify before inviting other riders

Open the production Vercel site and sign in with one Google test account. Save a profile/plan, sign out, then use a different Google test account. The second rider must see their own default profile and empty plans. Check that the first rider's plans return only after signing back into that account. On a shared device, leave the sign-out option to clear offline copies checked.

Check Google cancellation/retry, session expiry, cross-tab sign-out, and a phone's GPS start/stop. Confirm browser cookies are HttpOnly/Secure and private API responses are not cached. Demo data is separate; use **Rider account → Bring your browser demo data** to explicitly select what to import. Data from the GitHub Pages origin cannot be read directly by the Vercel origin. Unexported GPS recordings remain temporary tab memory.

Local automated checks:

```text
npm test
npm run test:accounts
npm run test:ui
npm run test:ui -- --hosted-demo
npm run build
python -m unittest server.test_accounts server.test_api server.test_routing
```

Automated Google tests use locally signed tokens and mocked provider responses, not a real Google account. They do not prove your live consent/client/redirect/proxy settings or a real PostgreSQL connection work. Complete those checks after provisioning.

Provider references: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [Render web services](https://render.com/docs/web-services), [Render free limitations](https://render.com/docs/free).
