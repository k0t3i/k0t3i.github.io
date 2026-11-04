# k0t3i.github.io

The home page of Anthony, front-end engineer, drawn as an electronic circuit board: https://k0t3i.github.io/

Vue 3, Vite and TypeScript, prerendered at build time (vite-ssg): the page reads in full without
JavaScript, in French (`/`) and in English (`/en/`), then Vue adds the interactions. The texts live in
`src/content/` (`fr.ts`, `en.ts`, `site.json`).

## Commands

Node 22.12 or later. The end-to-end tests and the scripts below use Playwright's browsers
(`npx playwright install`) and Google Chrome.

| Command | What it does |
|---|---|
| `npm ci` | installs the exact dependencies |
| `npm run dev` | Vite dev server (the language redirect of `/` exists in the build only) |
| `npm run build` | the prerendered site in `dist/` |
| `npm run serve` | serves `dist/` as GitHub Pages does, on http://localhost:4173/ (`PORT` to change it) |
| `npm test` | typecheck, lint, unit tests, build, static tests, end-to-end tests (5 browsers), HTML validation |
| `npm run test:lh` | Lighthouse gates on `/` and `/en/`, mobile and desktop (after a build) |
| `node scripts/captures.mjs [folder]` | screenshots of every page, size, state, theme and engine, with a contact sheet (`index.html`) |
| `node scripts/og.mjs` | the share images, `public/img/og-{fr,en}.jpg` |
| `node scripts/deploy.mjs` | the dry run of a deploy (below) |

## Publishing

GitHub Pages serves the root of the `master` branch as it is, about a minute after each push. `master`
holds the built site only; the sources live on their own branch. `scripts/deploy.mjs` goes in three steps:

1. `node scripts/deploy.mjs`: builds, checks `dist/`, lists what would be published and how it differs
   from `master`. It changes nothing.
2. `node scripts/deploy.mjs --commit`: the same, then commits `dist/` on the local `master` as
   `deploy: <short sha of the sources>`. The source tree must be clean. Nothing leaves the machine.
3. `node scripts/deploy.mjs --push --yes-publish`: the same, then pushes `master`. This puts the site
   online: only the owner runs it.

Then check https://k0t3i.github.io/ and https://k0t3i.github.io/kit-urgence/.

The build must hold an empty `.nojekyll`, so that Pages serves every file as it is, and **never a
`kit-urgence/` folder**: https://k0t3i.github.io/kit-urgence/ is the site of another repository, and
such a folder here would hide it. The deploy script refuses a build that breaks either rule.
