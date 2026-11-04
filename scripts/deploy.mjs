// Publishes the build on master, the branch GitHub Pages serves (its root, as it is, about a minute
// after each push). master holds the built site only; the sources live on their own branch.
//
//   node scripts/deploy.mjs                        dry run: builds, checks dist/, shows what would be
//                                                  published and how it differs from master. Changes nothing.
//   node scripts/deploy.mjs --commit               the same, then commits dist/ on the local master:
//                                                  "deploy: <short sha of the sources>". Nothing leaves the machine.
//   node scripts/deploy.mjs --push --yes-publish   the same, then `git push origin master`: the site goes
//                                                  online. The owner's call only.
//
// --commit and --push need a clean source tree, so that the sha in the message names what was built.
// The commit is made in a temporary worktree of master in .deploy/, removed afterwards; the Git
// identity is the one configured. DIST_DIR builds and publishes another folder than dist/.
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const WORKTREE = join(ROOT, '.deploy');
const MASTER = 'master';
const USAGE = 'usage: node scripts/deploy.mjs [--commit | --push --yes-publish]';

/** Every file of a folder, relative to it, with forward slashes, sorted. */
function filesOf(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort();
}

/** Never published, whatever the build puts in its folder: a repository, the working notes, the list of private names. */
const PRIVATE = ['.git', '.superpowers', 'private-names.local.txt'];

/**
 * The errors of a build folder, none when it may be published: the three pages, an empty .nojekyll
 * (GitHub Pages then serves every file as it is), no kit-urgence/ folder (it would hide
 * https://k0t3i.github.io/kit-urgence/, the site of another repository), no source map, nothing private.
 * @param {string} dir
 * @returns {string[]}
 */
export function validateDist(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`${dir} does not exist: run npm run build`];
  const errors = [];
  for (const page of ['index.html', 'en/index.html', '404.html']) {
    if (!existsSync(join(dir, page))) errors.push(`${page} is missing`);
  }
  const nojekyll = join(dir, '.nojekyll');
  if (!existsSync(nojekyll)) errors.push('.nojekyll is missing');
  else if (statSync(nojekyll).size !== 0) errors.push(`.nojekyll must be empty (${statSync(nojekyll).size} byte${statSync(nojekyll).size === 1 ? '' : 's'})`);
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true }).map((d) => ({
    path: relative(dir, join(d.parentPath, d.name)).split(sep).join('/'),
    folder: d.isDirectory(),
  }));
  for (const { path, folder } of entries) {
    if (folder && /(^|\/)kit-urgence$/i.test(path)) errors.push(`${path}/ must not exist: https://k0t3i.github.io/kit-urgence/ is another repository`);
    if (!folder && path.endsWith('.map')) errors.push(`${path}: no source map is published`);
  }
  for (const name of PRIVATE) if (existsSync(join(dir, name))) errors.push(`${name} must not be published`);
  return errors;
}

/**
 * The options: --push commits first. Unknown options are an error.
 * @param {string[]} argv
 * @returns {{ commit: boolean, push: boolean, yesPublish: boolean }}
 */
export function parseArgs(argv) {
  const known = ['--commit', '--push', '--yes-publish'];
  const unknown = argv.filter((a) => !known.includes(a));
  if (unknown.length) throw new Error(`unknown option ${unknown.join(' ')}; ${USAGE}`);
  const push = argv.includes('--push');
  return { commit: push || argv.includes('--commit'), push, yesPublish: argv.includes('--yes-publish') };
}

/**
 * Why the run must stop before anything is built, or null.
 * @param {{ commit: boolean, push: boolean, yesPublish: boolean }} options
 * @param {string[]} dirty the lines of `git status --porcelain`
 * @returns {string | null}
 */
export function refusal({ commit, push, yesPublish }, dirty) {
  if (yesPublish && !push) return '--yes-publish goes with --push only';
  if (push && !yesPublish) return '--push puts the site online for everyone: confirm it with --yes-publish (the owner only)';
  if (commit && dirty.length) {
    return `the source working tree is not clean (${dirty.length} change${dirty.length === 1 ? '' : 's'}: ${dirty.slice(0, 3).join(', ').trim()}): commit or stash first, so that "deploy: <sha>" names the sources of the build`;
  }
  return null;
}

/**
 * What publishing `published` on a branch holding `current` does.
 * @param {Record<string, string>} published path -> blob sha
 * @param {Record<string, string>} current path -> blob sha
 * @returns {{ added: string[], changed: string[], removed: string[], same: string[] }}
 */
export function compareTrees(published, current) {
  const added = [];
  const changed = [];
  const same = [];
  for (const path of Object.keys(published).sort()) {
    if (!(path in current)) added.push(path);
    else if (current[path] !== published[path]) changed.push(path);
    else same.push(path);
  }
  const removed = Object.keys(current).filter((path) => !(path in published)).sort();
  return { added, changed, removed, same };
}

/**
 * What is printed before the push, which is then made: where to, and which commit.
 * @param {string} remote the URL of origin
 * @param {string} commit its sha and subject
 * @returns {string}
 */
export function pushNotice(remote, commit) {
  return `Pushing ${MASTER} to origin, ${remote}\n  commit ${commit}\nGitHub Pages publishes it about a minute later.`;
}

/** A git command in `cwd` (the sources by default); its output, trimmed. */
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

/** The changes of the source tree, untracked files included (never the ignored ones). */
const changes = () => git(['--no-optional-locks', 'status', '--porcelain']).split('\n').filter(Boolean);

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

/** The blob sha of each file of `dir`, as the commit stores it (its bytes as they are), without writing anything. */
function blobsOf(dir, files) {
  const input = files.map((f) => join(dir, f)).join('\n');
  const shas = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd: ROOT, encoding: 'utf8', input }).trim().split('\n');
  if (shas.length !== files.length) throw new Error(`git hash-object gave ${shas.length} hashes for ${files.length} files`);
  return Object.fromEntries(files.map((f, i) => [f, shas[i]]));
}

/** The blob sha of each file on master. */
function blobsOnMaster() {
  const out = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', MASTER], { cwd: ROOT, encoding: 'utf8' });
  return Object.fromEntries(
    out
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split('\t');
        return [path, meta.split(' ')[2]];
      }),
  );
}

const bytes = (n) => `${n.toLocaleString('en-GB')} B`;

/** Prints the build, what would be published and how it differs from master. */
function report({ source, files, diff, master }) {
  const sizes = files.map((f) => statSync(join(DIST, f)).size);
  const width = Math.max(...files.map((f) => f.length));
  console.log(`\nWhat would be published (the root of ${MASTER} = ${relative(ROOT, DIST) || '.'}/): ${files.length} files, ${bytes(sizes.reduce((a, b) => a + b, 0))}`);
  files.forEach((f, i) => console.log(`  ${f.padEnd(width)}  ${bytes(sizes[i]).padStart(10)}`));
  console.log(`\nAgainst ${MASTER} (${master}):`);
  for (const [name, list] of Object.entries(diff)) {
    const shown = name === 'same' ? '' : list.length ? `: ${list.join(', ')}` : '';
    console.log(`  ${name.padEnd(8)} ${String(list.length).padStart(3)}${shown}`);
  }
  console.log(`\nCommit message: deploy: ${source}`);
}

/**
 * Commits the build on master through a temporary worktree, removed whatever happens; returns whether
 * a commit was made. It throws, never exits, so that the worktree always goes.
 */
function commitOnMaster(source, files) {
  if (existsSync(WORKTREE)) throw new Error(`${WORKTREE} exists: a deploy stopped half-way. Remove it (git worktree remove --force .deploy), then run again`);
  // The record of a worktree whose folder is gone (a deploy killed half-way) would block the next one.
  git(['worktree', 'prune']);
  git(['worktree', 'add', '--quiet', WORKTREE, MASTER]);
  try {
    // Everything of master goes, but its .git link: master holds this build alone.
    for (const entry of readdirSync(WORKTREE)) if (entry !== '.git') rmSync(join(WORKTREE, entry), { recursive: true, force: true });
    cpSync(DIST, WORKTREE, { recursive: true });
    // Every file as it is: no line-ending conversion, no ignore rule.
    git(['-c', 'core.autocrlf=false', 'add', '--all', '--force'], WORKTREE);
    const staged = git(['ls-files', '-z'], WORKTREE).split('\0').filter(Boolean).sort();
    if (staged.join('\n') !== files.join('\n')) throw new Error(`the commit would not hold exactly the build (${staged.length} files for ${files.length})`);
    if (git(['diff', '--cached', '--name-only'], WORKTREE) === '') {
      console.log(`\n${MASTER} already holds this build: nothing to commit.`);
      return false;
    }
    git(['-c', 'core.autocrlf=false', 'commit', '--quiet', '-m', `deploy: ${source}`], WORKTREE);
    console.log(`\nCommitted on ${MASTER}: ${git(['log', '-1', '--format=%h %s (%an <%ae>)', MASTER])}`);
    return true;
  } finally {
    git(['worktree', 'remove', '--force', WORKTREE]);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dirty = changes();
  const reason = refusal(options, dirty);
  if (reason) fail(reason);

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === MASTER) fail(`run it from the branch of the sources, not from ${MASTER}`);
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${MASTER}`], { cwd: ROOT }).status !== 0) fail(`there is no local ${MASTER} branch`);
  const source = git(['rev-parse', '--short', 'HEAD']);
  const master = git(['log', '-1', '--format=%h %s', MASTER]);
  console.log(`Sources: ${branch} at ${source}, ${dirty.length ? `${dirty.length} uncommitted change(s): --commit would refuse` : 'working tree clean'}`);

  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) fail('the build failed');
  if (changes().join('\n') !== dirty.join('\n')) fail('the build changed the sources: look at git status');

  const errors = validateDist(DIST);
  if (errors.length) fail(`${relative(ROOT, DIST)}/ may not be published:\n  ${errors.join('\n  ')}`);
  const files = filesOf(DIST);
  report({ source, files, diff: compareTrees(blobsOf(DIST, files), blobsOnMaster()), master });

  if (!options.commit) {
    console.log('\nDry run: nothing was changed. Next: node scripts/deploy.mjs --commit (local), then --push --yes-publish (online).');
    return;
  }
  commitOnMaster(source, files);
  if (!options.push) {
    console.log(`Nothing was pushed. To publish: node scripts/deploy.mjs --push --yes-publish`);
    return;
  }
  console.log(`\n${pushNotice(git(['remote', 'get-url', 'origin']), git(['log', '-1', '--format=%H %s', MASTER]))}`);
  const push = spawnSync('git', ['push', 'origin', MASTER], { cwd: ROOT, stdio: 'inherit' });
  if (push.status !== 0) fail('the push failed: master is committed locally, run --push --yes-publish again');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error.message);
  }
}
