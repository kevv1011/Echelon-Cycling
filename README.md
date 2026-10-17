# Echelon

Wind, weather and telemetry co-pilot for road cyclists. A React 18 + Vite mission-control dashboard with a Python FastAPI + SQLAlchemy API. The project/package name is **echelon-cycling**.

## Run locally

Requires Node.js 20.18+ (or 22+) and Python 3.11+ for the optional backend.

```powershell
cd F:\Echelon
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. No API keys or paid services are needed. The default telemetry dashboard works without a backend; street-route comparison requires the FastAPI backend below. Dependencies are already installed in this checkout.

```powershell
npm test
npm run test:ui
npm run build
npm run preview
```

The production output is `dist/`. Serve it with any static web host. Use `npm run preview` to review the built app locally.

## What works

- Four Central Luzon route presets: Clark (42 km / 380 m), Arayat (85 km / 620 m), Subic (70 km / 890 m), and Monasterio (112 km / 1,150 m).
- Custom distance, elevation, date, departure time, effort and road conditions. All times use **Asia/Manila, PHT / UTC+8**. Forecast dates default to tomorrow in that timezone.
- Live hourly [Open-Meteo forecasts](https://open-meteo.com/en/docs): temperature, apparent temperature, precipitation probability, wind speed and meteorological wind direction. Hour buttons reveal the selected hour’s wind exposure and feels-like conditions. Forecasts cover the estimated moving window, including partial departure hours.
- An abortable request with a 12-second timeout, loading shimmer, stale-request protection and explicitly labeled simulated weather if forecasting fails. Refresh retries live telemetry. Demo persistence does **not** force simulated weather; the default app still requests real forecasts.
- Rider garage: rider/bike weight, 25/28/30/32 mm tires, tubes/tubeless and FTP.
- Deterministic pressure, speed, duration, power, carbohydrates, gel equivalents, fluids and sodium estimates.
- Ride Director: local, deterministic parameter parsing and tactical briefings. No LLM, key or chat service. Messages can change route, distance, rider mass, tire setup, effort, time, day and wet/dry conditions. It waits for the matching forecast before issuing a briefing.
- Saved cue sheets retain the original profile, ride, weather, source, calculations and briefing. View and restore a saved ride; restoration requests a fresh forecast.
- Plain-text export and a print layout for printing or saving as PDF. Save notifications, metric count-up animations and responsive layouts.

Try: `Plan a 65km Clark ride tomorrow at 5:30 AM, 68kg rider on 28mm tubeless, Tempo` or `How many gels for the 112km Monasterio ride at Tempo?`

## Live GPS, ride metrics and time

The header clock updates every second in **PHT / Asia/Manila**. It refreshes immediately when returning to the tab, including across midnight. The ride stopwatch uses monotonic elapsed time rather than counting timer ticks, so paused time is excluded and tab throttling does not create stopwatch drift.

Choose **Enable GPS** to request browser permission, or **Start ride** to start a recording once an accurate fix arrives. GPS requires HTTPS or a trusted localhost origin. It is never requested automatically. Allow location in the browser and use an actual GPS-capable device outdoors for field validation; desktop positions may be approximate or unavailable.

The live panel shows fix status/age/accuracy, actual reported or position-derived speed, accepted movement distance, estimated moving time/average and progress toward the selected distance goal. The street map displays a position marker, accuracy circle and recorded trail, with a Follow me toggle. Mapped custom routes also show distance from the track; preset schematics are not used for on-route claims. **Pause**, **Resume**, **Finish** and **Stop GPS** control recording/watch state. Starting a new ride sets the planning date/departure to now; resuming keeps the original departure.

Fixes older than 15 seconds, poorer than 50 m accuracy, duplicate timestamps or implausible jumps do not add travel distance. Common stationary jitter is filtered; GPS distance/speed are still estimates, not certified sensor measurements. Pauses, signal gaps and discarded jumps create separate GPX segments. The latest 5,000 recorded points are kept in memory; if earlier geometry is trimmed, the UI and export indicate it while totals continue to include accepted movement. **Export GPS** downloads the recorded segments. Refreshing/closing the tab discards this in-memory recording, so export before leaving.

In the route builder, enable GPS and choose **Add current location as stop** to use a fresh, accurate fix. It becomes a local draft stop until you explicitly compare/save/export. GPS coordinates are not automatically sent to the Echelon server or Open-Meteo. Viewing the live map necessarily requests OSM tiles for that area; the browser/OS location provider also participates in geolocation.

Forecasts remain tied to your selected route and planning window. They refresh every ten minutes while visible, on reconnection and after returning to a stale tab. The displayed sync age changes over time. A failed refresh retains matching real data as **cached** with its original timestamp; simulated weather is used only if no matching real snapshot exists. These forecasts and FTP/pressure/fueling estimates are distinct from current GPS measurements. No power, cadence, heart-rate or other hardware sensor connection is fabricated.

The backend status is checked periodically and on focus/reconnection; the header reports checking, offline, local mode, signed in or sign-in required. Local mode is **not an account**. Password protection is a single-owner private sign-in; it is not multi-user registration. See [SECURITY.md](SECURITY.md) to enable it. Background browser/OS suspension can interrupt GPS and networking; this is not guaranteed background navigation or an offline PWA.

## Build your own route

Click **Build my route** above the route selector. Click the street map to add a start, finish and optional via stops, or enter coordinates with the keyboard. You can undo/remove stops or return to the start. Up to eight stops are supported within a **20 km diagonal planning area**; divide longer rides into sections.

Start FastAPI even when using demo persistence. Then choose **Compare cycling routes** to compare the shortest eligible route with a path that favors cycleways, quieter road classes, lower tagged speeds and optionally lit roads. Tagged rough/unpaved roads are excluded by default. The comparison shows dedicated-cycleway, primary/secondary-road, high-speed, lighting and missing-tag percentages, plus snap gaps and data warnings. The exposure reduction is a change in the model's total weighted road cost, **not a crash-risk percentage**. If both paths are the same, the app explicitly says no lower-exposure alternative was found.

Use a route to update dashboard distance, weather coordinates, wind bearing and fueling/pacing estimates. Climbing remains your manually supplied estimate. Custom geometry is included in saved cue sheets and can be exported as a **scouting GPX**, including XML-escaped names. Chat preserves mapped distance; edit the map stops to change it. Selecting a preset clears the custom geometry.

The street graph comes from public OpenStreetMap Overpass instances, with a ten-minute bounded memory cache and provider failover. Availability is best effort. If road data fails, the app shows an error instead of fabricating a route. OSM tiles are requested only for the interactive view, with visible attribution. Map data may be incomplete or outdated. This is a route scouting tool, not turn-by-turn navigation or a guarantee of safety.

## FastAPI live mode

In a second terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
```

The environment and dependencies are already installed in this checkout. API documentation routes are disabled; the endpoints are listed below. Route comparison works with either frontend persistence mode.

Copy `.env.example` to `.env.local`, change the frontend values, then restart Vite:

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

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service and SQL connectivity |
| `GET /api/auth/status` | Local/private session status |
| `POST /api/auth/login` | Start an eight-hour private session |
| `POST /api/auth/logout` | Invalidate the session |
| `POST /api/auth/activity` | Explicit activity extends idle time, within the absolute cap |
| `POST /api/routes/plan` | Compare two cycling paths using mapped road tags |
| `GET /api/profile` | Read the saved profile or defaults |
| `PUT /api/profile` | Validate and save the rider profile |
| `GET /api/plans?limit=50` | Read saved cue sheets, newest first |
| `POST /api/plans` | Validate and save a cue sheet |
| `DELETE /api/plans/{id}` | Delete a cue sheet |
| `GET /api/weather` | Proxy Open-Meteo for coordinates/date window |

If the backend disconnects, profile and plan saves fall back to browser localStorage with an explicit notification; weather retains a matching real snapshot as cached, or falls back to labeled simulated data if no matching snapshot exists. Browser copies remain visible alongside server plans. Offline copies are **not automatically uploaded** later. Live mode reads the server profile on startup when available. The API is a **single-owner service**, local-only by default. Optional private sessions use HttpOnly cookies. Public host configuration requires a strong backend password, HTTPS frontend origins and secure cookies; wildcard hosts/origins are rejected. See [SECURITY.md](SECURITY.md) for setup, request/rate limits, privacy and remaining deployment requirements.

## Model assumptions

- Pressure is a heuristic starting point: a 67 PSI rear reference for 76.5 kg total system mass on 28 mm tubeless tires, width scaling exponent 1.65, a 9% lower front pressure, +8% for tubes and −8% for wet roads, bounded at 30–110 PSI. These bounds are model limits, **not** manufacturer-approved tire/rim limits. Confirm measured tire width and maximum/minimum pressure, especially on hookless rims. Tire construction, road roughness and actual axle loading affect pressure.
- Wet mode is explicit, or inferred at ≥50% hourly rain probability in Auto mode. Probability alone does not establish that a road is wet.
- Speed solves an approximate steady-state power balance using 1.18 kg/m³ air density, CdA 0.32 m², rolling resistance 0.0045, 97% drivetrain efficiency, a conservative loop wind-exposure penalty and a positive-climbing cost derived from ascent/distance. It excludes traffic, stops, technical descents, drafting, surface changes and elevation profiles. A route’s primary bearing only classifies wind for that heading; the loop does not have a single persistent headwind.
- Target power is 65/82/95% of FTP for Z2/Tempo/Race. Carbohydrate targets are 45/65/85 g/hr, plus 5 g/hr beyond three hours. Gels assume 25 g each. Food equivalence counts all ride carbohydrates, not additional gels on top of food.
- Fluid target is 0.45–1.1 L/hr based on apparent temperature, rounded up to 750 ml bottle equivalents. Sodium is 500/650/800 mg/hr with increasing heat. These are broad planning heuristics, not individualized physiological prescriptions. Plan refill stops and account for food/drink already carried.
- Mechanical kJ are shown as approximately equal to dietary kcal using the common cycling efficiency approximation. They are estimates, not measured expenditure.
- Open-Meteo’s **apparent temperature** is labeled feels-like. It is not the formal NOAA heat index. The app flags ≥32°C apparent temperature for extra caution.
- Preset route coordinates are representative weather locations; their distance, ascent and heading are planning values and their drawn lines are schematics. Custom street routes use mapped road distance and a representative track midpoint for weather; climbing is a user estimate. Exported GPX tracks require road/junction review and do not include turn restrictions or live hazards.
- Saved cue sheets are available without a weather connection while the app is open/cached. This is not a service-worker PWA and does not guarantee an offline cold launch. Browser storage is device-specific and may be cleared; export important plans.

## Verification

```powershell
npm test
npm run test:ui
npm run build
.\.venv\Scripts\python.exe -m unittest server.test_api server.test_routing
```

Thirty-two frontend checks cover physics, chat, weather selection/cache freshness, custom geometry, GPX escaping, production CSP, GPS quality/jump/jitter filtering, pause/resume, watch cleanup, real clock ticking, session-status races and cross-tab sign-out. Twenty-seven backend tests cover persistence, idle/absolute session expiry, token rotation/cookie flags, access/request boundaries, routing/provider failures and graph safety heuristics. `npm run test:ui` mounts the full dashboard in a test DOM with mocked GPS/API data and verifies Leaflet layers, changing metrics and sign-out cleanup without real location access or tile downloads. These checks do not replace hardware field testing. Dependency audits are clean after patching the local environment's pip.

The production build and React render checks pass. HTTP checks verify production CSP/framing headers, the same-origin API proxy, uncached private responses and rejection of unexpected Host/Origin headers. Live road-data verification encountered upstream HTTP 500/502 errors and timeouts at the public Overpass providers; route logic and failure behavior are verified with controlled road graphs. A browser automation surface is unavailable in this session, so interactive map/visual review remains for local testing. PostgreSQL compatibility is implemented with SQLAlchemy and psycopg but is not integration-tested against a running PostgreSQL instance.

## Layout

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
  main.py                    FastAPI, SQLAlchemy models, auth and weather
  security.py                Access, session, request and rate boundaries
  routing.py                 OSM graph routing and exposure comparison
  requirements.txt           Python dependencies
  test_api.py                Backend checks
tests/physics.test.js         Frontend model and parser checks
```

## Repository name and review

Recommended GitHub repository name: **`echelon-cycling`**. The local package and documentation use this name. The GitHub rename requires authenticated owner access; a local package rename does not rename GitHub.

After connecting GitHub, the requested remote action is to rename `kevv1011/aiai` to `kevv1011/echelon-cycling`, without changing visibility or pushing this code. Alternatively, the owner can change **Settings → General → Repository name** on GitHub. Once renamed, a working local Git checkout can update its remote with:

```powershell
git remote set-url origin https://github.com/kevv1011/echelon-cycling.git
```

**No git push or deployment should occur until the local app has been reviewed**, per the project brief. This workspace was empty when implementation started; no existing repository code has been overwritten.

Weather: Open-Meteo, with source attribution in the app. Maps: Leaflet and OpenStreetMap contributors; road graph via Overpass. Public-service policies apply; arrange appropriate providers before commercial/large-scale use. Icons: Lucide. Fonts: Space Grotesk, Inter and JetBrains Mono via Google Fonts, with local system fallbacks.
