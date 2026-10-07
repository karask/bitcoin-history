# Bitcoin Timechain

A local Bitcoin archive with a price-shaped 3D roller-coaster presentation. No
ChatGPT login is required to use the local website.

The public site is deployed automatically from `main` to
`https://kkarasavvas.com/bitcoin-history/` by GitHub Actions. `npm run build:pages`
creates the static export in `dist/client` with the `/bitcoin-history` base path
used in production. It also normalizes Vinext's asset output for the GitHub
project-site mount path.

## Run the local ride

```bash
npm run dev -- --hostname 100.96.113.72
```

Open `http://100.96.113.72:3000/present` from this machine or an authorized
Tailscale peer. For loopback-only development, use `npm run dev`.

The play bar holds only previous / play / next, the chapter timeline, **Settings** and
fullscreen. While the train is moving and nothing is touched for a few seconds, the
controls fade out so only the approach caption remains; any pointer, touch or key input
brings them back, and keyboard focus keeps them visible.

- **Camera** (top right on wide screens, in Settings on phones):
  - **Auto:** ride between consecutive chapters, then frame the exhibit.
  - **Front seat:** remain in the coaster, including at stops.
  - **Overhead:** see the price-shaped track from above.
- Drag the exhibit to orbit; scroll, pinch or use `+` / `-` to zoom. Focus the canvas and
  use arrow keys for keyboard orbiting. Outside the canvas, left/right navigate.
- Space plays/pauses. Playback speed affects travel and stop duration. All chapter
  arrows travel along the track; seeking on the bottom timeline teleports to the
  selected event and preserves playback. Initial deep links also position directly.
- **Read the story & sources** pauses the ride and opens the full sourced record.
- **Settings** gathers everything else in one sheet: display (3D ride or 2D reader),
  camera, speed, comfort, sound and volume, a postcard of the current stop, fullscreen,
  the track-data notes and the keyboard shortcuts. Escape closes the sheet before it
  exits the ride.
- **3D ride** is the default, including for reduced-motion preferences. The former
  Rail view is now the **2D reader**, a price chart with the full reading panel;
  the old separate Reader mode has been removed.
- Travel accelerates away from an exhibit and brakes before the next stop.
  Tight price bends also trigger anticipatory braking. The front-seat camera stays
  attached to the rail. **Comfort ON** is the default: the travelling camera has a
  stable horizon, ±20° pitch limit, a gently ramped 14°/second turn-rate cap, longer
  look-ahead and 3.6-second exhibit transfers. It removes banking and speed-related
  zoom; **OFF** adds those coaster effects and uses 2.4-second transfers. Both settings
  retain the rounded rail and gentler acceleration/braking. Comfort reduces abrupt
  motion but cannot guarantee that every viewer will be comfortable; the 2D reader
  remains available for a stationary experience.
- **Sound** (in Settings) plays a three-note confirmation and enables the synthesized
  arrival chimes, with no continuous engine/buzzing sound. Once on, a volume slider
  and **Test sound** button appear.
  If the cue is silent, check the tab mute, device volume, and selected output.

### Archive and event pages

- The archive opens as a compact **List**, grouped by year; **Story** restores the
  large reading cards. Search stays visible in a slim sticky bar with a year jump strip
  (press `/` to focus it). Topics, scope and the **Filters** panel sit just below it.
  **Price context** in Filters shows each event's daily reference price on one log scale.
- Each event page shows its ride exhibit, rendered in place. three.js loads only when
  the exhibit scrolls into view; drag or use the arrow keys to look around. Beside it,
  **Ride to this stop** opens the event's first show at that stop (exiting returns to
  the record), and the other shows that include it are listed. A small log-scale chart
  marks the event on the whole price history.
- Every archive page shares one header: **Timeline**, **3D ride**, **Method**.

### Data and interpretation

The rail follows a **smoothed price trend**, derived from 5,925 bundled Coin Metrics
daily PriceUSD observations (18 July 2010–6 October 2026). Centered Gaussian weighting
over ±7 days in log-price space removes small daily oscillations. After calendar
compression, positive-weight spatial filtering rounds the rail with a minimum
100-world-unit Gaussian sigma, widened adaptively for tight curvature. Vertical
exaggeration falls from 1,450 to 960 units. Peaks and turning points may soften or
shift; stations sit on the rounded rail rather than being forced onto raw-price
spikes. Raw data, the 2D reader's daily curve and the event-page charts remain unchanged.
Dates and unrounded values are preserved from the source. The displayed
event price uses its exact dated observation at 00:00 UTC, independently of the
interpolated rail. These are daily references, not live quotes, intraday highs/lows,
or exact event-time transaction prices. Missing observations and events dated only
to a month/year display no recorded daily price, and the charts leave gaps.
Separately sourced parity/threshold and intraday-high milestones appear alongside
the daily reference; differing exchange/index quotes are identified in their labels.
Dates are compressed horizontally to pace the chapters; lateral bends are scenic.
The pre-price section is flat. Exhibits are interpretive miniatures, not claims
to reconstruct actual buildings or rooms. Historical details and citations come
from the existing archive records; this change does not expand the corpus.

Refresh the checked-in daily bundle with `npm run prices:refresh`. Its default
preserves the archive coverage; `npm run prices:refresh -- YYYY-MM-DD` explicitly
changes the final observation day. The script validates the complete response
before replacing the bundle and records retrieval date, API request and raw-response
SHA-256. The published site has no runtime price API dependency.

The 3D scene is lazy-loaded. Rail, vehicle, exhibits and HUD share a single
chronological path mapping; arc length is used only for physical travel speed.
Only three adjacent exhibits are resident, static details are material-batched,
and graphics resolution drops on slow devices before falling back to 2D.
Exhibits are prepared at chapter boundaries, not halfway through a moving ride.

The scenery follows seven fictional landscape families: sheep pastures (with a
shepherd, dog and distant wolf), oak forest and deer clearings, a river gorge and
waterfall, alpine lake and chalet, autumn orchard and watermill, a fishing village
with an open sea, and willow wetlands with herons. Longer timelines revisit these
families with seeded variations. These landscapes are decorative, not claims
about the geography of historical events.

The land rises with the smoothed railway and is terraced beneath every station.
Paved aprons and steps meet the exhibit foundations. Polished running tubes,
braced frames, mounting plates and bolts sit on piers anchored to the same terrain
height field; gorge crossings have masonry arches. Water occupies level carved
basins instead of inheriting the changing price elevation.

Trees and other repeated models share instanced geometry. Spatial batches are
culled, distant trees switch to lighter models, and small ground details disappear
at lower quality. Breeze, circling birds, watermill rotation and gently bobbing
boats freeze when paused or when the device requests reduced motion. The scenery
is generated locally and needs no external model, texture or wildlife downloads.

### Review the detailed stations locally

```bash
npm run preview:stations
```

Open `http://localhost:4178/` (or `http://100.96.113.72:4178/` on Tailscale).
Search all 292 events, filter the 24 scene families, and orbit/zoom each actual
production model. This is a local review tool, not an extra published site route.
The gallery's main-site link expects the ride on port 4173:
`npm run dev -- --hostname 0.0.0.0 --port 4173`.

Scene assignments live in `app/present/ride/exhibit-design.ts`; new records need
an explicit assignment. `exhibit-kit.ts` owns reusable materials and detailed
objects, `exhibit-scenes.ts` contains the narrative scenes, and `exhibit-pizza.ts`
contains the approved pizzeria. Proposals, passage, effective dates, reversals,
closures and repayments have different visual states. Generic gold tokens are
symbolic; the NEM/ETH thefts and customer-data breach are not depicted as BTC
thefts. Memorials and disputed identities use artifacts, not invented portraits.
The pizza offer has empty boxes; the purchase has two finished pizzas. Upright
lids no longer intersect the oven masonry.

The ride uses one shared reflection environment and fixed lights; exhibits add
no lights of their own. Each is material-batched to fewer than 65 meshes and
700,000 vertices, with explicit geometry/material/texture cleanup on eviction.
Market lows are a valley with a lake under a painted sky, and crashes break the
trail down into it with a rockslide. Their plaques show the sourced price milestone,
else the daily reference, else no figure, and are labelled "interpretive landscape ·
not a price chart": the mountains are not data. Highs, first quotes and index listings
keep the labelled directional sculpture. The rail remains the smoothed price-trend
visualization; its mini-chart uses the same rounded curve.

Every stop also gets a small grove ahead of its exhibit, where the stop's camera
looks (`stationGroves` in `landscape-layout.ts`); scattered planting alone left some
later stops, and the last one, framed by bare hillside. The coast's sea sits below the
lowest rail across its bay, so it can no longer float above earlier regions or flood
a station.

### Before/after captures

`npm run capture -- capture <dir> --clean [slug …]` opens the ride at each station,
pauses, waits for the exhibit framing to settle and screenshots it with the HUD hidden.
`npm run capture -- pages <dir> [--full] [/path …]` screenshots site routes, and
`npm run capture -- compare <before> <after> <out.png> [--width=1600]` pairs same-named
files from two runs into one labelled sheet (a narrower width suits phone captures). Set `RIDE_URL`, and `PLAYWRIGHT_MODULE_PATH` /
`CHROMIUM_EXECUTABLE_PATH` as for the browser tests.

Capture on a real GPU. Under software GL the quality watchdog disables shadows, so ride
captures abort when frames exceed `CAPTURE_MAX_FRAME_MS` (30 ms) rather than produce a
"before" and "after" at different quality levels.

### Verification

`npm test` builds the site and runs corpus, server-rendering, hydration, track,
and 3D geometry/movement regressions. `npm run lint` checks source quality.

The automated suite includes all-record scene coverage, narrative-state checks,
geometry budgets, bounded placement and GPU-resource lifecycle regressions.
The full `npx tsc --noEmit` command still reports missing Cloudflare starter
declarations in the unchanged `db/index.ts` and `worker/index.ts`
(`cloudflare:workers`, `Fetcher`, `D1Database`); no ride-file type errors remain.

The optional `node tests/ride-browser.mjs` smoke test checks a running local
server and saves desktop/mobile renders under `artifacts/ride-qa/`. Set
`PLAYWRIGHT_MODULE_PATH` and `CHROMIUM_EXECUTABLE_PATH` to existing installations
when Playwright is not a project dependency, and `RIDE_TEST_URL` for another URL.
`node tests/presentation-controls-browser.mjs` uses the same environment variables
to check the two modes, default Ride under reduced-motion preferences, departure
and braking, and non-silent Web Audio output followed by muting. It cannot check
the physical speakers or the operating system's output volume.
`node tests/ride-smoothness-browser.mjs` checks continuous distant chapter selection
and measures real-time seat alignment and camera motion through the 2017–2018 descent.

## Underlying starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
