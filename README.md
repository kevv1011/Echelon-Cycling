# 🚴 Echelon

**Check the wind. Pack the gels. Pick your line.**

Echelon is a wind, weather and ride-planning co-pilot for road cyclists. Plan a sunrise spin around Clark, scout a custom route, or work out how much fuel that “quick ride” will actually need.

A carbon-and-amber dashboard brings together hourly forecasts, pacing and fueling estimates, custom maps, and opt-in live GPS. Built with **React 18 + Vite**, **FastAPI**, and **PostgreSQL** for rider accounts.

### [🚴 Open Echelon — sign in with Google](https://echelon-cycling.vercel.app/)

Your own rider setup and saved cue sheets follow your Google account. The app runs on a Vercel frontend with a Render API and PostgreSQL database. Use a Google account listed as a test user while the OAuth app is in Testing.

### [▶ Demo Mode — try it without an account](https://kevv1011.github.io/Echelon-Cycling/)

No downloads, installation, or sign-in. Open the GitHub Pages demo and plan a ride right away. Demo data stays in that browser and does not automatically appear in an account.

[Take a quick tour](#quick-tour) · [Build a route](#build-your-own-route) · [How accounts work](#rider-accounts) · [Developer setup](#developer-setup) · [Security](SECURITY.md)

## Choose your ride

| | [Live app](https://echelon-cycling.vercel.app/) | [Demo Mode](https://kevv1011.github.io/Echelon-Cycling/) |
| --- | --- | --- |
| Sign-in | Google account (currently limited to OAuth test users) | None |
| Rider setup and cue sheets | Stored for your account in PostgreSQL | Stored in this browser |
| Custom route comparison | Available through the Render API | Route drawing only; comparison requires the API |
| Weather, planning, GPS | Available | Available |

The live app has been deployed and Google sign-in has been tested. Route comparison and GPS still depend on road-data availability, browser location permission, and the device you use. See [deployment instructions](DEPLOYMENT.md) if you are running your own instance.

## 🕹️ Try demo mode

**[Open Demo Mode →](https://kevv1011.github.io/Echelon-Cycling/)**

Pick a route, change your rider setup and ask the Ride Director for a plan. No account or installation required.

| Try it out | What happens |
| --- | --- |
| Rider profile and saved cue sheets | Saved only in your current browser |
| Weather | Real Open-Meteo forecasts when available; matching cached data or clearly labeled simulated data on failure |
| Pacing, tire pressure and fueling | Estimates update as you change the ride and rider settings |
| Clock | Ticks in Philippine time (PHT / UTC+8) |
| GPS and recorded ride metrics | Optional: allow location access to record actual movement on a compatible device |
| Street map | Explore OpenStreetMap in your browser |
| Custom route comparison | Available in the signed-in live app; not included in the hosted demo |

Your demo plans stay on this device. GPS starts only with your permission, and readings depend on actual movement. Internet access is needed for weather and map tiles. Export an active GPS recording before refreshing or leaving the page.

<a id="rider-accounts"></a>

## 🔐 Your rider account

Open the [live app](https://echelon-cycling.vercel.app/) and choose **Continue with Google**. Google handles sign-in; Echelon requests only your basic identity (`openid`, email and profile), not access to your Gmail inbox. You can use a personal or alternate Google account once it has been added as a test user. Email/password and email-link sign-in are not available yet.

After signing in, use **Rider garage** for your bike and rider setup, then save a cue sheet. Those details belong to that Google account. Select the rider badge in the header to see your account, sign out, or explicitly import selected browser-demo data from the **same site and browser**. Import is optional; demo data never uploads on its own. Browser storage from the separate GitHub Pages demo cannot be read by the Vercel site. On a shared phone, leave the offline-copy clearing checkbox selected when signing out.

The account service uses an HttpOnly, Secure session cookie and separates riders by their Google account ID. GPS recording remains in the current tab until you export it; signing out stops location tracking. For the limits of the current deployment and how to report a security issue, see [SECURITY.md](SECURITY.md).

<a id="quick-tour"></a>

## ☕ Your first five minutes

1. **Pick your playground.** Choose a route, departure time and effort. All times use **Asia/Manila, PHT / UTC+8**; planning defaults to tomorrow.
2. **Visit the rider garage.** Adjust rider/bike weight, tire width, tubes or tubeless, and FTP. Watch the planning estimates update.
3. **Ask the Ride Director.** Try either of these:

   ```text
   Plan a 65km Clark ride tomorrow at 5:30 AM, 68kg rider on 28mm tubeless, Tempo
   How many gels for the 112km Monasterio ride at Tempo?
   ```

   Say **hello** for a greeting, ask **help** for examples, or ask a focused question about wind, fuel, pacing or pressure. Questions preview the requested ride without changing the dashboard. Explicit commands such as **Set my ride to 60km at Tempo** update your plan, with a visible change summary. Ride calculations wait for the matching forecast; greetings and help respond immediately. The Director runs locally with supported intents and calculations, rather than a general-purpose AI chat service. No chat API key is needed.

4. **Save your plan.** Keep a cue sheet with the original rider profile, forecast source, calculations and briefing. Restore it later for fresh weather, export plain text, or print/save as PDF.
5. **Try a real recording.** On your phone, open **Ride**, then choose **Enable GPS** or **Start ride**, allow location access, and head outdoors with a GPS-capable device. Pause, resume and finish, then export the GPX before closing the tab.

The gels are estimates. The temptation to turn a recovery spin into Tempo is entirely yours.

## 🌬️ Pick your playground

Four Central Luzon presets get you started:

| Route | Distance | Ascent |
| --- | ---: | ---: |
| Clark | 42 km | 380 m |
| Arayat | 85 km | 620 m |
| Subic | 70 km | 890 m |
| Monasterio | 112 km | 1,150 m |

Dial in distance, elevation, road conditions and effort, then explore hourly temperature, feels-like temperature, rain probability, wind and wind direction across the estimated moving window. Echelon calculates pressure, speed, duration, power, carbs, gel equivalents, fluids and sodium to help you pack and pace.

## 📱 Built around your phone

Use the bottom navigation to move between **Plan** (route, forecast and setup), **Ride** (GPS, recording controls and live map), and **Chat** (Ride Director). Switching sections keeps an active recording running. Buttons have larger touch areas, forms use readable text, and chat adapts to the phone's visible viewport when the keyboard opens. On desktop, the dashboard and Director appear together.

Tap the **sun/moon button** in the header to switch between light and dark mode. Echelon starts with your device's preferred appearance and remembers your choice in this browser.

## 📍 Live GPS, ride metrics and time

The header clock updates every second in **PHT / Asia/Manila**. It refreshes immediately when returning to the tab, including across midnight. The ride stopwatch uses monotonic elapsed time rather than counting timer ticks, so paused time is excluded and tab throttling does not create stopwatch drift.

Choose **Enable GPS** to request browser permission, or **Start ride** to start a recording once an accurate fix arrives. GPS requires HTTPS or a trusted localhost origin. It is never requested automatically. Allow location in the browser and use an actual GPS-capable device outdoors for field validation; desktop positions may be approximate or unavailable.

The live panel shows fix status/age/accuracy, actual reported or position-derived speed, accepted movement distance, estimated moving time/average and progress toward the selected distance goal. The street map displays a position marker, accuracy circle and recorded trail, with a Follow me toggle. Mapped custom routes also show distance from the track; preset schematics are not used for on-route claims. **Pause**, **Resume**, **Finish** and **Stop GPS** control recording/watch state. Starting a new ride sets the planning date/departure to now; resuming keeps the original departure.

Fixes older than 15 seconds, poorer than 50 m accuracy, duplicate timestamps or implausible jumps do not add travel distance. Common stationary jitter is filtered; GPS distance/speed are still estimates, not certified sensor measurements. Pauses, signal gaps and discarded jumps create separate GPX segments. The latest 5,000 recorded points are kept in memory; if earlier geometry is trimmed, the UI and export indicate it while totals continue to include accepted movement. **Export GPS** downloads the recorded segments. Refreshing/closing the tab discards this in-memory recording, so export before leaving.

In the route builder, enable GPS and choose **Add current location as stop** to use a fresh, accurate fix. It becomes a local draft stop until you explicitly compare/save/export. GPS coordinates are not automatically sent to the Echelon server or Open-Meteo. Viewing the live map necessarily requests OSM tiles for that area; the browser/OS location provider also participates in geolocation.

Forecasts remain tied to your selected route and planning window. They refresh every ten minutes while visible, on reconnection and after returning to a stale tab. The displayed sync age changes over time. A failed refresh retains matching real data as **cached** with its original timestamp; simulated weather is used only if no matching real snapshot exists. These forecasts and FTP/pressure/fueling estimates are distinct from current GPS measurements. No power, cadence, heart-rate or other hardware sensor connection is fabricated.

The backend status is checked periodically and on focus/reconnection; the header reports checking, offline, local mode, signed in or sign-in required. The live app requires Google sign-in for account data. Local mode belongs to the separate browser demo and is **not an account**. Background browser/OS suspension can interrupt GPS and networking; this is not guaranteed background navigation or an offline PWA.

<a id="build-your-own-route"></a>

## 🗺️ Build your own route

Click **Build my route** above the route selector. Click the street map to add a start, finish and optional via stops, or enter coordinates with the keyboard. You can undo/remove stops or return to the start. Up to eight stops are supported within a **20 km diagonal planning area**; divide longer rides into sections.

In the [live app](https://echelon-cycling.vercel.app/), choose **Compare cycling routes** to compare the shortest eligible route with a path that favors cycleways, quieter road classes, lower tagged speeds and optionally lit roads. Tagged rough/unpaved roads are excluded by default. The comparison shows dedicated-cycleway, primary/secondary-road, high-speed, lighting and missing-tag percentages, plus snap gaps and data warnings. The exposure reduction is a change in the model's total weighted road cost, **not a crash-risk percentage**. If both paths are the same, the app explicitly says no lower-exposure alternative was found. Local developers must start FastAPI for this feature; it is disabled in Demo Mode.

Use a route to update dashboard distance, weather coordinates, wind bearing and fueling/pacing estimates. Climbing remains your manually supplied estimate. Custom geometry is included in saved cue sheets and can be exported as a **scouting GPX**, including XML-escaped names. Chat preserves mapped distance; edit the map stops to change it. Selecting a preset clears the custom geometry.

The street graph comes from public OpenStreetMap Overpass instances, with a ten-minute bounded memory cache and provider failover. Availability is best effort. If road data fails, the app shows an error instead of fabricating a route. OSM tiles are requested only for the interactive view, with visible attribution. Map data may be incomplete or outdated. This is a route scouting tool, not turn-by-turn navigation or a guarantee of safety.

<a id="fastapi-live-mode"></a>

## 🔧 Run the API locally

For route comparison and SQL persistence in a local development copy, install **Python 3.11+** and run this in a second terminal from the project folder. The default local API uses the legacy single-owner mode; the hosted app uses Google accounts with PostgreSQL as described in [DEPLOYMENT.md](DEPLOYMENT.md).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Route comparison works with either frontend persistence mode. To also save profiles and cue sheets through FastAPI, edit `.env.local` (copy `.env.example` first if needed) and restart Vite:

```dotenv
VITE_USE_MOCK_API=false
VITE_API_URL=
```

Leave `VITE_API_URL` empty to use Vite's same-origin `/api` proxy. An explicit API URL must use HTTPS, or HTTP on loopback only. In live mode, weather goes through `/api/weather`, and the profile/cue sheets persist in SQL. SQLite is the default and creates `echelon.db` in the backend process working directory. To use PostgreSQL, set the environment variable before starting Uvicorn:

```powershell
$env:DATABASE_URL='postgresql+psycopg://user:password@localhost/echelon'
$env:CORS_ORIGINS='http://localhost:5173,http://127.0.0.1:5173'
```

Do not commit `.env` files, credentials, databases or `.venv`. The example file contains no secrets. `VITE_` values are public frontend configuration.

<details>
<summary><strong>API reference — for the workshop crowd</strong></summary>

API documentation routes are disabled. The available endpoints are:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service and SQL connectivity |
| `GET /api/auth/status` | Sign-in mode, session and account status |
| `GET /api/auth/google` | Start Google sign-in (Google mode) |
| `GET /api/auth/google/callback` | Complete Google sign-in (Google mode) |
| `POST /api/auth/login` | Start a private owner session (owner mode only) |
| `POST /api/auth/logout` | Invalidate the session |
| `POST /api/auth/activity` | Explicit activity extends idle time, within the absolute cap |
| `POST /api/account/import` | Explicitly import selected same-browser demo data (Google mode) |
| `POST /api/routes/plan` | Compare two cycling paths using mapped road tags |
| `GET /api/profile` | Read the saved profile or defaults |
| `PUT /api/profile` | Validate and save the rider profile |
| `GET /api/plans?limit=50` | Read saved cue sheets, newest first |
| `POST /api/plans` | Validate and save a cue sheet |
| `DELETE /api/plans/{id}` | Delete a cue sheet |
| `GET /api/weather` | Proxy Open-Meteo for coordinates/date window |

</details>

If the backend disconnects after sign-in, profile and plan saves can fall back to account-scoped browser storage with an explicit notification; weather retains a matching real snapshot as cached, or falls back to labeled simulated data if no matching snapshot exists. Offline copies are **not automatically uploaded** later. Authentication failures do not become offline saves. The API defaults to a **single-owner service** for local development; the hosted app sets `ECHELON_AUTH_MODE=google` for separate rider accounts and PostgreSQL sessions. Private sessions use HttpOnly cookies. See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting and [SECURITY.md](SECURITY.md) for request limits, privacy and remaining deployment requirements.

## 🧮 Under the handlebars

Echelon's numbers are planning estimates. Open the notes below to see what goes into them.

<details>
<summary><strong>Pressure, power, fuel and weather assumptions</strong></summary>

- Pressure is a heuristic starting point: a 67 PSI rear reference for 76.5 kg total system mass on 28 mm tubeless tires, width scaling exponent 1.65, a 9% lower front pressure, +8% for tubes and −8% for wet roads, bounded at 30–110 PSI. These bounds are model limits, **not** manufacturer-approved tire/rim limits. Confirm measured tire width and maximum/minimum pressure, especially on hookless rims. Tire construction, road roughness and actual axle loading affect pressure.
- Wet mode is explicit, or inferred at ≥50% hourly rain probability in Auto mode. Probability alone does not establish that a road is wet.
- Speed solves an approximate steady-state power balance using 1.18 kg/m³ air density, CdA 0.32 m², rolling resistance 0.0045, 97% drivetrain efficiency, a conservative loop wind-exposure penalty and a positive-climbing cost derived from ascent/distance. It excludes traffic, stops, technical descents, drafting, surface changes and elevation profiles. A route’s primary bearing only classifies wind for that heading; the loop does not have a single persistent headwind.
- Target power is 65/82/95% of FTP for Z2/Tempo/Race. Carbohydrate targets are 45/65/85 g/hr, plus 5 g/hr beyond three hours. Gels assume 25 g each. Food equivalence counts all ride carbohydrates, not additional gels on top of food.
- Fluid target is 0.45–1.1 L/hr based on apparent temperature, rounded up to 750 ml bottle equivalents. Sodium is 500/650/800 mg/hr with increasing heat. These are broad planning heuristics, not individualized physiological prescriptions. Plan refill stops and account for food/drink already carried.
- Mechanical kJ are shown as approximately equal to dietary kcal using the common cycling efficiency approximation. They are estimates, not measured expenditure.
- Open-Meteo’s **apparent temperature** is labeled feels-like. It is not the formal NOAA heat index. The app flags ≥32°C apparent temperature for extra caution.
- Preset route coordinates are representative weather locations; their distance, ascent and heading are planning values and their drawn lines are schematics. Custom street routes use mapped road distance and a representative track midpoint for weather; climbing is a user estimate. Exported GPX tracks require road/junction review and do not include turn restrictions or live hazards.
- Saved cue sheets are available without a weather connection while the app is open/cached. This is not a service-worker PWA and does not guarantee an offline cold launch. Browser storage is device-specific and may be cleared; export important plans.

</details>

## 🛠️ Workshop: build and checks

<a id="developer-setup"></a>

### Run locally (developers)

These steps are for running your own copy or contributing. Demo visitors can use the **Demo Mode** link above.

Requires Node.js 20.18+ (or 22+) and npm:

```powershell
git clone https://github.com/kevv1011/Echelon-Cycling.git
cd Echelon-Cycling
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Browser-only persistence is the default. To restore it in an existing checkout, edit `.env.local` and restart Vite:

```dotenv
VITE_USE_MOCK_API=true
VITE_API_URL=
```

Copy `.env.example` to `.env.local` if the file does not exist; keep existing private configuration when editing it. See [FastAPI live mode](#fastapi-live-mode) for backend features.

### Build and verify

```powershell
npm test
npm run test:accounts
npm run test:ui
npm run build
.\.venv\Scripts\python.exe -m unittest server.test_accounts server.test_api server.test_routing
```

To inspect the production build locally:

```powershell
npm run preview
```

Open **http://127.0.0.1:4173**. Build output goes into `dist/`. Configure the documented security headers and backend routing when hosting elsewhere; see [SECURITY.md](SECURITY.md).

<a id="publish-demo"></a>

<details>
<summary><strong>Publish the demo — one-time owner setup</strong></summary>

1. Open the repository's **[Settings → Pages](https://github.com/kevv1011/Echelon-Cycling/settings/pages)**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Commit and push the included workflow, hosted-demo app changes and README to `main` using your usual workflow.
4. In **[Actions](https://github.com/kevv1011/Echelon-Cycling/actions)**, wait for **Deploy Echelon demo** to finish successfully. Its deployment link is the demo URL above.

Later pushes to `main` update the demo automatically. You can also run the workflow manually from Actions. Only the built `dist/` directory is published; the Python server, local database and private account settings are not deployed. The workflow forces browser-only persistence and builds with `VITE_HOSTED_DEMO=true`, which labels the demo, hides private sign-in and disables backend requests/route comparison. It uses GitHub's built-in deployment token, so no personal token or API key is needed.

To check that version locally, run `npm run test:ui -- --hosted-demo`. The usual build leaves backend features available.

GitHub Pages serves the static demo with the build's CSP meta tag. It does not apply `public/_headers`; use a host that supports the documented HTTP headers for a private backend deployment.

Setup follows the official [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

</details>

The frontend checks cover physics, chat intent/relevance, forecast freshness, theme persistence, mobile behavior, custom geometry, GPX escaping, GPS filtering, clock updates and session races. Backend tests cover persistence, session expiry, access boundaries, routing failures, graph heuristics, cross-rider isolation and OIDC validation with simulated Google responses. `npm run test:ui` mounts the dashboard with mocked GPS/API data; add `-- --hosted-demo` to check that the demo makes no backend requests. `npm run test:accounts` checks the locked sign-in screen, rider identity, explicit import and sign-out. These checks complement the owner's successful live Google sign-in; they do not replace a second-account isolation check or GPS field testing. Dependency audits are time-specific; see [SECURITY.md](SECURITY.md) for commands to rerun them.

The production build and React render checks passed during implementation. The Render health endpoint and Google sign-in have since worked in the live deployment. The full save/sign-out/second-account flow and physical-phone GPS should still be checked before inviting more riders. Public Overpass route data can fail or time out; the app reports those failures rather than inventing a route. Automated backend tests use SQLite or mocked provider responses and do not exercise the deployed PostgreSQL service end to end.

<details>
<summary><strong>Where things live</strong></summary>

```text
src/
  App.jsx                    Application state and workflows
  components/                Telemetry, Director and accessible modal
  data/routes.js             Route presets, efforts and rider defaults
  services/weatherApi.js     Live forecasts, date handling, simulated fallback
  services/storage.js        Local/server persistence
  services/api.js            Cookie-authenticated API requests
  hooks/                     GPS watch, wall/monotonic clock and session state
  utils/cyclingPhysics.js    Deterministic calculations
  utils/director.js          Command parsing and briefing generation
  utils/customRoutes.js      Custom route metadata and GPX export
  utils/gps.js               Quality-filtered GPS ride measurements
  utils/forecastState.js     Cached-data and auto-sync decisions
  styles.css                 Carbon/amber telemetry design and print layout
server/
  main.py                    FastAPI endpoints, persistence and weather
  accounts.py                Rider accounts and PostgreSQL sessions
  oauth.py                   Google OpenID Connect setup
  security.py                Access, session, request and rate boundaries
  routing.py                 OSM graph routing and exposure comparison
  requirements.txt           Python dependencies
  test_api.py                Backend checks
tests/physics.test.js         Frontend model and parser checks
```

</details>

## 🤝 Credits and project workflow

Repository: **[kevv1011/Echelon-Cycling](https://github.com/kevv1011/Echelon-Cycling)**. The project owner handles commits and pushes; assistant changes stay local for review.

The current free Render PostgreSQL database is scheduled to expire on **November 19, 2026**. Move to durable storage and backups before relying on it for other riders' saved plans.

Weather: Open-Meteo, with source attribution in the app. Maps: Leaflet and OpenStreetMap contributors; road graph via Overpass. Public-service policies apply; arrange appropriate providers before commercial/large-scale use. Icons: Lucide. Fonts: Space Grotesk, Inter and JetBrains Mono via Google Fonts, with local system fallbacks.
