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
// They fetch origin first, and refuse while origin/master holds commits that master lacks (GitHub
// commits a CNAME there for a custom domain); every run refuses to drop a CNAME of master. The build
// date is the commit date of the sources: the same sources give the same build. The commit is made in
// a temporary worktree of master in .deploy/, removed afterwards; the Git identity is the one
// configured. DIST_DIR builds and publishes another folder than dist/.
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

/**
 * What to do once a push has failed: the deploy commit is on master already, so it is pushed as it
 * is. A new deploy would only build and commit again.
 * @returns {string}
 */
export function pushFailed() {
  return [
    `the push failed: the deploy commit is on the local ${MASTER} already. Once the cause is fixed (the network,`,
    `the rights, or origin moved: git fetch origin, then git log --oneline ${MASTER}..origin/${MASTER}), push it as it is:`,
    `  git push origin ${MASTER}`,
  ].join('\n');
}

/**
 * Runs a clean-up after `failure` (an error, or null when all went well); if the clean-up throws too,
 * the error thrown names both, the first one first: a clean-up never hides what went wrong before it.
 * @param {() => void} remove
 * @param {Error | null} failure
 */
export function cleanUp(remove, failure) {
  try {
    remove();
  } catch (error) {
    if (!failure) throw error;
    throw new Error(`${failure.message}\n  then the clean-up failed too: ${error.message}`, { cause: error });
  }
}

/**
 * The variables by which git finds its repository (`git rev-parse --local-env-vars`). A git running
 * this script (a hook, a `rebase --exec`) sets them: kept, they would point every command below,
 * those of the worktree included, at that repository. They are dropped from the commands' environment.
 */
const LOCAL_GIT_VARS = new Set(
  'GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_OBJECT_DIRECTORY GIT_DIR GIT_WORK_TREE GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE GIT_INDEX_FILE GIT_NO_REPLACE_OBJECTS GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE GIT_COMMON_DIR'.split(' '),
);
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !LOCAL_GIT_VARS.has(k) && !/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k)));

/** A git command in `cwd` (the sources by default); its output, trimmed. */
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
/** Whether a git command succeeds (a ref exists, a remote is set). */
const gitOk = (args) => spawnSync('git', args, { cwd: ROOT, env: ENV, stdio: 'ignore' }).status === 0;

/** The changes of the source tree, untracked files included (never the ignored ones). */
const changes = () => git(['--no-optional-locks', 'status', '--porcelain']).split('\n').filter(Boolean);

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

/** The blob sha of each file of `dir`, as the commit stores it (its bytes as they are), without writing anything. */
function blobsOf(dir, files) {
  const input = files.map((f) => join(dir, f)).join('\n');
  const shas = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd: ROOT, encoding: 'utf8', env: ENV, input }).trim().split('\n');
  if (shas.length !== files.length) throw new Error(`git hash-object gave ${shas.length} hashes for ${files.length} files`);
  return Object.fromEntries(files.map((f, i) => [f, shas[i]]));
}

/** The blob sha of each file of a tree, from lines "<mode> <type or sha> ...\t<path>": the sha is field `at`. */
const blobsOfLines = (out, at) =>
  Object.fromEntries(
    out
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split('\t');
        return [path, meta.split(' ')[at]];
      }),
  );

/** The blob sha of each file on master. */
const blobsOnMaster = () => blobsOfLines(execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', MASTER], { cwd: ROOT, encoding: 'utf8', env: ENV }), 2);

/**
 * master holds a CNAME (the custom domain of the site) that the build lacks: publishing it would take
 * the domain off. The message, or null.
 * @param {Record<string, string>} onMaster
 * @param {string[]} files the files of the build
 * @returns {string | null}
 */
export function cnameDropped(onMaster, files) {
  if (!('CNAME' in onMaster) || files.includes('CNAME')) return null;
  return `${MASTER} holds a CNAME (the custom domain of the site) that the build lacks: publishing it would take the domain off. A custom domain's CNAME lives in public/: git show ${MASTER}:CNAME > public/CNAME, commit it, then run again.`;
}

/**
 * Compares master with origin/master (fetched first when `fetch`): the commits of origin/master that
 * master lacks (GitHub commits there too: a CNAME for a custom domain), as a message, or null. No
 * origin, or never fetched: nothing to compare, said so.
 */
function originAhead(fetch) {
  if (!gitOk(['remote', 'get-url', 'origin'])) {
    console.log(`No origin remote: ${MASTER} is not compared with a remote.`);
    return null;
  }
  if (fetch) git(['fetch', '--quiet', 'origin', MASTER]);
  if (!gitOk(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${MASTER}`])) {
    console.log(`origin/${MASTER} is unknown (never fetched): ${MASTER} is not compared with it.`);
    return null;
  }
  const ahead = Number(git(['rev-list', '--count', `${MASTER}..origin/${MASTER}`]));
  if (ahead === 0) {
    console.log(`origin/${MASTER}${fetch ? ' (just fetched)' : ' (as last fetched)'} is in ${MASTER}.`);
    return null;
  }
  return [
    `origin/${MASTER} has ${ahead} commit${ahead === 1 ? '' : 's'} that ${MASTER} lacks (GitHub commits there too: a CNAME for a custom domain, say).`,
    `  git log --oneline ${MASTER}..origin/${MASTER}    shows them`,
    `  git fetch origin ${MASTER}:${MASTER}              brings them into ${MASTER} (when it has nothing of its own: a fast-forward)`,
    'then run the deploy again.',
  ].join('\n');
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
 * a commit was made. It throws, never exits, so that the worktree always goes; a failed removal never
 * hides the error before it.
 */
function commitOnMaster(source, files, built) {
  if (existsSync(WORKTREE)) throw new Error(`${WORKTREE} exists: a deploy stopped half-way. Remove it (git worktree remove --force .deploy), then run again`);
  // The record of a worktree whose folder is gone (a deploy killed half-way) would block the next one.
  git(['worktree', 'prune']);
  git(['worktree', 'add', '--quiet', WORKTREE, MASTER]);
  let failure = null;
  try {
    // Everything of master goes, but its .git link: master holds this build alone.
    for (const entry of readdirSync(WORKTREE)) if (entry !== '.git') rmSync(join(WORKTREE, entry), { recursive: true, force: true });
    cpSync(DIST, WORKTREE, { recursive: true });
    // Every file as it is: no line-ending conversion, no ignore rule.
    git(['-c', 'core.autocrlf=false', 'add', '--all', '--force'], WORKTREE);
    // The index holds the build, byte for byte: the same files, the same blobs.
    const staged = blobsOfLines(git(['ls-files', '-s', '-z'], WORKTREE), 1);
    const off = [...new Set([...Object.keys(staged), ...files])].filter((f) => staged[f] !== built[f]).sort();
    if (off.length) throw new Error(`the commit would not hold the build byte for byte: ${off.join(', ')}`);
    if (git(['diff', '--cached', '--name-only'], WORKTREE) === '') {
      console.log(`\n${MASTER} already holds this build: nothing to commit.`);
      return false;
    }
    git(['-c', 'core.autocrlf=false', 'commit', '--quiet', '-m', `deploy: ${source}`], WORKTREE);
    console.log(`\nCommitted on ${MASTER}: ${git(['log', '-1', '--format=%h %s (%an <%ae>)', MASTER])}`);
    return true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    cleanUp(() => git(['worktree', 'remove', '--force', WORKTREE]), failure);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dirty = changes();
  const reason = refusal(options, dirty);
  if (reason) fail(reason);

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === MASTER) fail(`run it from the branch of the sources, not from ${MASTER}`);
  if (!gitOk(['rev-parse', '--verify', '--quiet', `refs/heads/${MASTER}`])) fail(`there is no local ${MASTER} branch`);
  const source = git(['rev-parse', '--short', 'HEAD']);
  const master = git(['log', '-1', '--format=%h %s', MASTER]);
  console.log(`Sources: ${branch} at ${source}, ${dirty.length ? `${dirty.length} uncommitted change(s): --commit would refuse` : 'working tree clean'}`);

  // A commit builds on what origin holds: fetched first, and refused while master lacks some of it.
  const behind = originAhead(options.commit);
  if (behind && options.commit) fail(behind);
  if (behind) console.log(`Note: --commit would refuse: ${behind}`);

  // The date of the sources, not of the run: the same sources give the same build (no second deploy commit).
  const buildDate = new Date(git(['log', '-1', '--format=%cI', 'HEAD'])).toISOString();
  console.log(`Build date: ${buildDate}, the commit date of the sources`);
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, env: { ...ENV, BUILD_DATE: buildDate }, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) fail('the build failed');
  if (changes().join('\n') !== dirty.join('\n')) fail('the build changed the sources: look at git status');

  const errors = validateDist(DIST);
  if (errors.length) fail(`${relative(ROOT, DIST)}/ may not be published:\n  ${errors.join('\n  ')}`);
  const files = filesOf(DIST);
  const built = blobsOf(DIST, files);
  const onMaster = blobsOnMaster();
  report({ source, files, diff: compareTrees(built, onMaster), master });
  const domain = cnameDropped(onMaster, files);
  if (domain && options.commit) fail(domain);
  if (domain) console.log(`\nNote: --commit would refuse: ${domain}`);

  if (!options.commit) {
    console.log('\nDry run: nothing was changed. Next: node scripts/deploy.mjs --commit (local), then --push --yes-publish (online).');
    return;
  }
  commitOnMaster(source, files, built);
  if (!options.push) {
    console.log(`Nothing was pushed. To publish: node scripts/deploy.mjs --push --yes-publish`);
    return;
  }
  console.log(`\n${pushNotice(git(['remote', 'get-url', 'origin']), git(['log', '-1', '--format=%H %s', MASTER]))}`);
  const push = spawnSync('git', ['push', 'origin', MASTER], { cwd: ROOT, env: ENV, stdio: 'inherit' });
  if (push.status !== 0) fail(pushFailed());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error.message);
  }
}
