# k0t3i.github.io

The home page of Anthony, front-end engineer, drawn as an electronic circuit board: https://k0t3i.github.io/

Vue 3, Vite and TypeScript, prerendered at build time (vite-ssg): the page reads in full without
JavaScript, in French (`/`) and in English (`/en/`), then Vue adds the interactions. The texts live in
`src/content/` (`fr.ts`, `en.ts`, `site.json`).

The sources live on the `source` branch; `master` holds the built site only (the sources of the 2020
site are on `dev/master`).

## Prerequisites

- Node 22.12 or later.
- For `npm test`: Playwright's browsers (`npx playwright install`) and Google Chrome; Java, for the Nu
  HTML checker; Python 3 with fontTools and brotli (`pip install fonttools brotli`), for the font checks.
- To rebuild the fonts, `python scripts/fonts.py build`: the variable fonts `HankenGrotesk[wght].ttf`
  and `JetBrainsMono[wght].ttf` (both OFL) in `fonts-src/`.
- To rebuild the images, `python scripts/images.py`: Pillow and ffmpeg (libwebp, libaom); for the
  Kit d'urgence picture, the cover image of that project (its path is at the top of the script).

## Commands

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

GitHub Pages serves the root of the `master` branch as it is, about a minute after each push.
`scripts/deploy.mjs` builds with the commit date of the sources (the same sources give the same build),
and goes in three steps:

1. `node scripts/deploy.mjs`: builds, checks `dist/`, lists what would be published and how it differs
   from `master`. It changes nothing.
2. `node scripts/deploy.mjs --commit`: the same, then commits `dist/` on the local `master` as
   `deploy: <short sha of the sources>`. The source tree must be clean, and `master` must hold
   everything of `origin/master` (it is fetched first). Nothing leaves the machine.
3. `node scripts/deploy.mjs --push --yes-publish`: the same, then pushes `master`. This puts the site
   online: only the owner runs it. If the push fails, the commit is there: `git push origin master`.

Then check https://k0t3i.github.io/ and https://k0t3i.github.io/kit-urgence/.

The build must hold an empty `.nojekyll`, so that Pages serves every file as it is, and **never a
`kit-urgence/` folder**: https://k0t3i.github.io/kit-urgence/ is the site of another repository, and
such a folder here would hide it. A custom domain's `CNAME` lives in `public/`: the deploy refuses to
drop one that `master` holds.
