# Bitcoin Timechain

A local Bitcoin archive with a price-shaped 3D roller-coaster presentation. No
ChatGPT login is required to use the local website.

The public site is deployed automatically from `main` to
`https://kkarasavvas.com/bitcoin-history/` by GitHub Actions. `npm run build:pages`
creates the static export in `dist/client` with the `/bitcoin-history` base path
used in production.

## Run the local ride

```bash
npm run dev -- --hostname 100.96.113.72
```

Open `http://100.96.113.72:3000/present` from this machine or an authorized
Tailscale peer. For loopback-only development, use `npm run dev`.

- **Auto / exhibits:** ride between consecutive chapters, then frame the exhibit.
- **Front seat:** remain in the coaster, including at stops.
- **Overhead:** see the price-shaped track from above.
- Drag the exhibit to orbit; scroll or use `+` / `-` to zoom. Focus the canvas and
  use arrow keys for keyboard orbiting. Outside the canvas, left/right navigate.
- Space plays/pauses. Playback speed affects travel and stop duration. All chapter
  selections travel along the track; only the initial deep link positions directly.
- **Read the story & sources** pauses the ride and opens the full sourced record.
- **Ride** is the default, including for reduced-motion preferences. The former
  Rail view is now **Reader**, a 2D price chart with the full reading panel;
  the old separate Reader mode has been removed.
- Travel accelerates away from an exhibit and brakes before the next stop.
  Tight price bends also trigger anticipatory braking. The front-seat camera stays
  attached to the rail, with bounded pitch/yaw and eased 2.4-second exhibit transfers.
  **Comfort ON** removes camera banking and speed-related zoom; **OFF** adds
  those coaster effects. Both settings retain animated travel. Comfort starts
  on when the device requests reduced motion.
- **Sound ON** plays a three-note confirmation and enables the synthesized
  soundtrack. **Audio settings** has a volume slider and **Test sound** button.
  If the cue is silent, check the tab mute, device volume, and selected output.

### Data and interpretation

The track's height follows the bundled Coin Metrics monthly closing snapshots,
using bounded, monotone interpolation in logarithmic price space. Monthly closes
are dated at month-end, except the last partial observation (23 August 2026).
These are not live quotes, daily highs/lows, or exact event-day transaction prices.
Dates are compressed horizontally to pace the chapters; lateral bends are scenic.
The pre-price section is flat. Exhibits are interpretive miniatures, not claims
to reconstruct actual buildings or rooms. Historical details and citations come
from the existing archive records; this change does not expand the corpus.

The 3D scene is lazy-loaded. Rail, vehicle, exhibits and HUD share a single
chronological path mapping; arc length is used only for physical travel speed.
Only three adjacent exhibits are resident, static details are material-batched,
and graphics resolution drops on slow devices before falling back to 2D.

### Verification

`npm test` builds the site and runs corpus, server-rendering, hydration, track,
and 3D geometry/movement regressions. `npm run lint` checks source quality.

The rebuilt ride passes the build, all 56 automated tests, lint, and the optional
desktop/mobile browser smoke test (including a live bear-market descent).
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
