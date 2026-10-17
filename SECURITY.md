# Security and privacy

Echelon is a **single-owner application**, not a multi-tenant service. These controls reduce specific risks; they do not constitute a penetration test or a guarantee of security.

## Default local operation

Start both processes on loopback:

```powershell
npm run dev
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Without an access password, the API accepts loopback clients only. It checks the Host header and rejects unexpected browser origins, including `Origin: null`, even on GET requests. CORS uses an explicit origin list. Binding to `0.0.0.0` does not disable the local-client restriction. Do not trust forwarded headers from arbitrary clients.

The development and preview servers also bind to loopback. Do not expose Vite's development server publicly.

## Private API sign-in

Set a unique 16–256 character password in the **backend process environment**, then restart it. In PowerShell, use a hidden prompt to avoid putting the password into shell history:

```powershell
$echelonPassword = Read-Host 'Choose your private API password' -AsSecureString
$env:ECHELON_ACCESS_PASSWORD = [System.Net.NetworkCredential]::new('', $echelonPassword).Password
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Choose the access icon / **Sign in** in the header to sign in. The header identifies local mode separately from a signed-in private owner; this is not a multi-user account system. Authentication is enforced server-side for profiles, cue sheets, weather and road routing. Password comparison is constant-time on SHA-256 digests. Passwords and session tokens are never returned in JSON or stored in localStorage. Successful sign-in sets a cryptographically random session token in an **HttpOnly, SameSite=Strict** cookie scoped to `/api`. Only its SHA-256 digest is held server-side. Sessions expire after 30 minutes of inactivity or an absolute maximum of eight hours, are invalidated on sign-out, and disappear on server restart. Reauthentication rotates the cookie and revokes the previous browser token. Status polling and automatic weather refreshes do not extend idle time; an explicit activity endpoint records user input or a deliberately active ride with fresh accurate GPS fixes, at most once per minute. The eight-hour cap always applies. Late status/401 responses from older sessions cannot reopen or lock a newly authenticated workspace. The session table is capped at 100 entries.

Sign-out stops GPS and locks the workspace, including other open tabs on the same app origin through a non-secret browser storage notification. Those notifications trigger backend revalidation rather than granting access. The checked-by-default sign-out option clears this browser's offline profile/cue sheets and open GPS recordings; server copies are retained. Unchecking it preserves browser copies. Session expiry pauses GPS and preserves the unsaved in-memory ride for recovery after sign-in. A previously protected workspace stays locked if the backend cannot verify a session on startup. The frontend lock is not encryption or a substitute for server authorization; browser storage can be inspected by someone with device/browser access. Browser storage and the SQLite database are not encrypted by this app. Use a protected OS account, device encryption and restricted database/backups access.

## HTTPS deployment configuration

Do not deploy until the local app has been reviewed. For a future private deployment:

- Use a same-origin HTTPS reverse proxy for the frontend and `/api`. SameSite cookies intentionally do not support unrelated cross-site frontend/API hosts.
- Set `ALLOWED_HOSTS` to explicit API hostnames and `CORS_ORIGINS` to explicit HTTPS frontend origins. Wildcards are rejected.
- Set `ECHELON_ACCESS_PASSWORD` and `ECHELON_COOKIE_SECURE=true`. Nonlocal host configuration without all three protections fails at startup.
- Keep Uvicorn behind a trusted proxy; use `--no-proxy-headers` unless trusted proxy IPs are explicitly configured. Put TLS and shared edge rate limits on that proxy. Do not add public access to the database.
- Use one API worker for the current in-memory sessions, rate limits and routing cache. Multiple replicas require a shared session/rate-limit store and deployment-specific operational review.
- Put secrets in the server environment/secret manager, never in a `VITE_` variable, frontend bundle, URL, repository or committed `.env` file.
- Add user identity and per-user record ownership before adapting this single-owner API for multiple users. A password shared among unrelated users is not tenant isolation.

`public/_headers` supplies HTTPS headers for hosts that support that format. Other hosts must set equivalent headers. A build-time CSP meta tag protects the standalone production HTML, but framing protection requires the actual HTTP header. If using an explicit `VITE_API_URL`, update the hosting `connect-src` policy to include only that HTTPS API origin; the Vite build/preview configuration already includes it. The default same-origin setup needs no CSP edit.

## Implemented boundaries

- Explicit Host and Origin checks; credentials allowed only for configured CORS origins. Mutations and private reads require a session when password protection is enabled.
- API traffic is limited to 120 requests/minute/client; road comparisons to six/minute/client; sign-in to five attempts/five minutes/client. Rate-limit buckets are bounded in memory.
- Request bodies are capped at 512 KiB, counting actual streamed bytes as well as Content-Length. Structured inputs reject extra fields and non-finite numbers; coordinates, route area, point counts and string/list sizes are bounded.
- Road queries use a fixed allowlist of HTTPS Overpass hosts with generated numeric bounds. Clients cannot supply a URL, query string or server-side file path. Redirect following is disabled. No arbitrary proxy endpoint exists.
- One road computation runs at a time. Upstream work has an overall 48-second deadline; payloads are capped at 12 MiB, 100,000 elements and 180,000 directed edges. Saved track geometry is bounded. No background route scans or tile prefetching run.
- Public Overpass throttling is respected. Provider fallback is for failures, not rate-limit evasion. Road networks are reused for up to ten minutes; the memory cache holds at most two areas. The public services are for modest local use; arrange a suitable service before scaling.
- SQLAlchemy parameterizes database access. No raw user SQL or OS command execution is exposed.
- React escapes route names, chat messages and road labels. GPX names are XML-escaped, coordinates are validated, and map marker HTML is generated only from numeric stop indexes. No user-supplied HTML is rendered.
- Production CSP limits scripts to the app origin and denies frames, object embeds and base URL changes. Inline styles are permitted for Leaflet positioning; inline scripts are allowed only in the local Vite development response for React refresh. Other headers include `nosniff`, framing denial and camera/microphone denial and same-origin-only geolocation (`geolocation=(self)`). GPS still requires a secure context and explicit browser permission. API responses use `Cache-Control: no-store`.
- Interactive map tiles send an origin referrer, as required by the OSM tile policy, through `strict-origin-when-cross-origin`; they do not send the full page path/query. Fonts are fetched from Google Fonts with system fallbacks.
- API documentation and schema routes are disabled in the served application. Server debug output is not returned to clients.

## Location data and route limitations

Opening the map requests only the tiles being viewed from OpenStreetMap. Comparing a route sends the bounding area around chosen stops through your API to the Overpass instances at `overpass.private.coffee` and, on service failure, `overpass-api.de`. No location is requested on load. **Enable GPS** / **Start ride** explicitly starts a high-accuracy browser watch; denial, timeout, weak/stale fixes and unsupported/insecure contexts are handled. Watches are cleared on stop, finish, unmount, sign-out and session lock. Raw fixes and the latest 5,000 track points remain in tab memory; no GPS history is automatically written to localStorage or uploaded. The live map reveals the viewed area through its tile requests, and the browser/OS location provider handles the device lookup. Choosing **Add current location as stop**, comparing a route or exporting a GPS track is an explicit action that can include location data. No advertising tracker or analytics service is used. A saved cue sheet includes the chosen geometry; save/export only on devices and destinations you trust. Do not publish a home start point in a public GPX.

Lower mapped exposure is a **heuristic** based on road tags, not a measured accident probability. OSM can omit access, surface, lane, lighting or speed details. Missing tags remain visible as unknown. The engine respects mapped one-way and bicycle exceptions and excludes known unsuitable access; it does not process turn-restriction relations, live closures, traffic volumes, crash statistics, crime, flood conditions or verified cycling-lane protection. Snap gaps to road nodes are shown as dashed links and are not routed. GPX exports are scouting tracks. Inspect access, junctions, gaps and current conditions before using a route.

## Checks

```powershell
npm test
npm run test:ui
npm run build
npm audit
.\.venv\Scripts\python.exe -m unittest server.test_api server.test_routing
.\.venv\Scripts\python.exe -m pip_audit --progress-spinner off
```

`pip-audit` is a development audit tool installed only in the local virtual environment, not an application runtime dependency. The environment's old pip version was upgraded after the audit found advisories. Audit results are time-specific; rerun them when dependencies change. No automated scan replaces deployment review or browser testing.

## GPS and live-data verification limits

Location/motion tests use controlled browser-position fixtures and a mounted test DOM, including the full Leaflet/dashboard integration. They verify opt-in requests, metric updates, rejection of bad fixes, cleanup and session races without collecting the user's location. They do not certify a physical receiver, positioning provider, device accuracy, map tile availability or mobile background execution. Test outdoors on the intended device over HTTPS (localhost for desktop development), allow location, check accuracy/fix age, start/pause/resume, and verify that stopping removes the location watch. Foreground use is recommended. The PHT clock and monotonic ride timer update independently of forecasts; cached and simulated values are explicitly labeled.
