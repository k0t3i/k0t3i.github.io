// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanUp, compareTrees, parseArgs, pushFailed, pushNotice, refusal, validateDist } from '../../scripts/deploy.mjs';

/*
 * scripts/deploy.mjs publishes dist/ on master. Here it only ever runs in throwaway repositories of the
 * temporary folder, with no remote or a local bare one, and never with --push: nothing is pushed anywhere.
 */

const DEPLOY = fileURLToPath(new URL('../../scripts/deploy.mjs', import.meta.url));

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** Writes files (path relative to `root` → content), folders included. */
function write(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/** A build as it must be: the three pages, an empty .nojekyll, the assets. */
const GOOD: Record<string, string> = {
  'index.html': '<!doctype html><title>fr</title>',
  'en/index.html': '<!doctype html><title>en</title>',
  '404.html': '<!doctype html><title>404</title>',
  '.nojekyll': '',
  'assets/app.js': 'console.log(1)',
};

const dist = (files: Record<string, string> = GOOD): string => {
  const dir = temp('k0t3i-dist-');
  write(dir, files);
  return dir;
};
const without = (name: string): Record<string, string> => Object.fromEntries(Object.entries(GOOD).filter(([path]) => path !== name));

describe('validateDist', () => {
  test('a correct build has no error', () => {
    expect(validateDist(dist())).toEqual([]);
  });

  for (const page of ['index.html', 'en/index.html', '404.html']) {
    test(`${page} is required`, () => {
      expect(validateDist(dist(without(page)))).toEqual([`${page} is missing`]);
    });
  }

  test('an empty .nojekyll is required', () => {
    expect(validateDist(dist(without('.nojekyll')))).toEqual(['.nojekyll is missing']);
    expect(validateDist(dist({ ...GOOD, '.nojekyll': 'x' }))).toEqual(['.nojekyll must be empty (1 byte)']);
  });

  test('no kit-urgence folder: it would hide the site of that project', () => {
    expect(validateDist(dist({ ...GOOD, 'kit-urgence/index.html': 'x' }))).toEqual(['kit-urgence/ must not exist: https://k0t3i.github.io/kit-urgence/ is another repository']);
    expect(validateDist(dist({ ...GOOD, 'img/kit-urgence/a.jpg': 'x' }))).toEqual(['img/kit-urgence/ must not exist: https://k0t3i.github.io/kit-urgence/ is another repository']);
    // The pictures of the project are files, not a folder.
    expect(validateDist(dist({ ...GOOD, 'img/kit-urgence-380.jpg': 'x' }))).toEqual([]);
  });

  test('no source map', () => {
    expect(validateDist(dist({ ...GOOD, 'assets/app.js.map': '{}' }))).toEqual(['assets/app.js.map: no source map is published']);
  });

  test('nothing private and no repository inside', () => {
    expect(validateDist(dist({ ...GOOD, 'private-names.local.txt': 'x', '.git/HEAD': 'x' }))).toEqual([
      '.git must not be published',
      'private-names.local.txt must not be published',
    ]);
  });

  test('a folder that does not exist is one error', () => {
    expect(validateDist(join(tmpdir(), 'k0t3i-no-such-dist'))).toEqual([`${join(tmpdir(), 'k0t3i-no-such-dist')} does not exist: run npm run build`]);
  });
});

describe('the options and the guards', () => {
  test('--push commits first; unknown options are refused', () => {
    expect(parseArgs([])).toEqual({ commit: false, push: false, yesPublish: false });
    expect(parseArgs(['--commit'])).toEqual({ commit: true, push: false, yesPublish: false });
    expect(parseArgs(['--push', '--yes-publish'])).toEqual({ commit: true, push: true, yesPublish: true });
    expect(() => parseArgs(['--force'])).toThrow(/unknown option --force/);
  });

  test('a dry run always may run, even on a dirty tree', () => {
    expect(refusal(parseArgs([]), [' M src/App.vue'])).toBeNull();
  });

  test('--commit and --push refuse a dirty source tree', () => {
    for (const argv of [['--commit'], ['--push', '--yes-publish']]) {
      expect(refusal(parseArgs(argv), ['?? notes.txt'])).toMatch(/working tree is not clean/);
      expect(refusal(parseArgs(argv), [])).toBeNull();
    }
  });

  test('--push needs --yes-publish, and --yes-publish goes with --push only', () => {
    expect(refusal(parseArgs(['--push']), [])).toMatch(/--yes-publish/);
    expect(refusal(parseArgs(['--commit', '--yes-publish']), [])).toMatch(/with --push only/);
  });

  test('the push says where it goes and what it sends before sending it', () => {
    const notice = pushNotice('https://github.com/k0t3i/k0t3i.github.io.git', '1234567890abcdef deploy: 66e3426');
    expect(notice).toContain('https://github.com/k0t3i/k0t3i.github.io.git');
    expect(notice).toContain('1234567890abcdef deploy: 66e3426');
  });

  test('a failed push is retried as a plain push of the commit already made, never as a new deploy', () => {
    const advice = pushFailed();
    expect(advice).toContain('git push origin master');
    expect(advice).not.toMatch(/--push|--yes-publish|deploy\.mjs/);
  });

  test('a failing clean-up never hides the error it follows', () => {
    const boom = () => {
      throw new Error('worktree locked');
    };
    expect(() => cleanUp(boom, new Error('the commit failed'))).toThrow(/the commit failed[\s\S]*worktree locked/);
    expect(() => cleanUp(boom, null)).toThrow(/^worktree locked$/);
    expect(() => cleanUp(() => {}, new Error('the commit failed'))).not.toThrow();
  });
});

describe('compareTrees', () => {
  test('what the build adds to master, changes, removes and leaves as it is', () => {
    expect(compareTrees({ 'a.html': '1', 'b.html': '2', 'c.html': '3' }, { 'b.html': '2', 'c.html': 'x', 'old.js': '9' })).toEqual({
      added: ['a.html'],
      changed: ['c.html'],
      removed: ['old.js'],
      same: ['b.html'],
    });
  });
});

describe('a deploy in a throwaway repository', () => {
  /** The environment of every command here, without the variables of a git that may run this test (a hook, a rebase). */
  const clean = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'DIST_DIR'));
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: clean() }).trim();

  /** A build that prints its date, as the real one does in the uptime and the sitemap. */
  const STAMP = '{{BUILD_DATE}}';

  interface Fixture {
    /** What the build writes into dist/, as `npm run build` does; STAMP becomes the build date. */
    build?: Record<string, string>;
    /** More files of the old build on master. */
    master?: Record<string, string>;
    /** A local bare origin: master as it is, or one commit ahead (GitHub committing a CNAME). */
    origin?: 'same' | 'ahead';
  }

  /**
   * A source repository: master holds an old build, the source branch a build script and a copy of
   * scripts/deploy.mjs. Its origin, if any, is a bare clone of it in the temporary folder.
   */
  function repository({ build = GOOD, master = {}, origin }: Fixture = {}): string {
    const root = temp('k0t3i-deploy-');
    git(root, 'init', '--quiet', '--initial-branch=master');
    git(root, 'config', 'user.name', 'Builder');
    git(root, 'config', 'user.email', 'builder@example.invalid');
    // Files as written, whatever the machine's own setting (no line-ending warning in the output).
    git(root, 'config', 'core.autocrlf', 'false');
    // The old build: a page the new one changes, a page it keeps byte for byte, a file it drops.
    write(root, { 'index.html': 'old', '404.html': GOOD['404.html'] ?? '', 'assets/old.js': 'old', ...master });
    git(root, 'add', '--all');
    git(root, 'commit', '--quiet', '-m', 'deploy');
    if (origin === 'ahead') {
      write(root, { CNAME: 'board.example.org\n' });
      git(root, 'add', 'CNAME');
      git(root, 'commit', '--quiet', '-m', 'Create CNAME');
    }
    git(root, 'checkout', '--quiet', '-b', 'source');
    git(root, 'rm', '--quiet', '-r', '.');
    write(root, {
      '.gitignore': 'dist/\n.deploy/\nnode_modules/\n',
      'package.json': JSON.stringify({ private: true, type: 'module', scripts: { build: 'node make-dist.mjs' } }),
      'make-dist.mjs': [
        `import { mkdirSync, writeFileSync } from 'node:fs';`,
        `import { dirname } from 'node:path';`,
        `const date = process.env.BUILD_DATE ?? new Date().toISOString();`,
        `for (const [p, c] of Object.entries(${JSON.stringify(build)})) { mkdirSync(dirname('dist/' + p), { recursive: true }); writeFileSync('dist/' + p, c.replaceAll(${JSON.stringify(STAMP)}, date)); }`,
        '',
      ].join('\n'),
    });
    mkdirSync(join(root, 'scripts'));
    copyFileSync(DEPLOY, join(root, 'scripts', 'deploy.mjs'));
    git(root, 'add', '--all');
    git(root, 'commit', '--quiet', '-m', 'source');
    if (origin) {
      const bare = join(temp('k0t3i-origin-'), 'origin.git');
      git(root, 'clone', '--quiet', '--bare', root, bare);
      // Ahead: GitHub's commit is on origin only.
      if (origin === 'ahead') git(root, 'branch', '--quiet', '--force', 'master', 'master~1');
      git(root, 'remote', 'add', 'origin', bare);
      git(root, 'fetch', '--quiet', 'origin');
    }
    return root;
  }

  const deploy = (root: string, args: string[] = [], extra: NodeJS.ProcessEnv = {}) => {
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'deploy.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...clean(), ...extra } });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };

  /** What may not change unless a commit is asked for: master, the branch, the tree, the worktrees, origin. */
  const state = (root: string) => ({
    master: git(root, 'rev-parse', 'master'),
    head: git(root, 'rev-parse', 'HEAD'),
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'),
    status: git(root, 'status', '--porcelain'),
    worktrees: git(root, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length,
    origin: git(root, 'remote').includes('origin') ? git(git(root, 'remote', 'get-url', 'origin'), 'rev-parse', 'master') : null,
  });

  test('the dry run builds, lists what would be published and how it differs from master, and changes nothing', { timeout: 60_000 }, () => {
    const root = repository();
    const before = state(root);
    const { status, out } = deploy(root);
    expect(status, out).toBe(0);
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, '.deploy'))).toBe(false);
    for (const file of Object.keys(GOOD)) expect(out).toContain(file);
    expect(out).toMatch(/added\s+3: \.nojekyll, assets\/app\.js, en\/index\.html/);
    expect(out).toMatch(/changed\s+1: index\.html/);
    expect(out).toMatch(/removed\s+1: assets\/old\.js/);
    expect(out).toMatch(/same\s+1/);
    expect(out).toContain(`deploy: ${git(root, 'rev-parse', '--short', 'HEAD')}`);
    expect(out).toMatch(/nothing was changed/i);
  });

  test('--commit puts the build alone on master, as one commit named after the sources, and cleans up', { timeout: 60_000 }, () => {
    const root = repository();
    const before = state(root);
    const source = git(root, 'rev-parse', '--short', 'HEAD');
    const { status, out } = deploy(root, ['--commit']);
    expect(status, out).toBe(0);
    expect(out).toMatch(/no origin/i);
    const after = state(root);
    expect({ ...after, master: before.master }).toEqual(before);
    expect(git(root, 'rev-parse', 'master~1')).toBe(before.master);
    expect(git(root, 'log', '-1', '--format=%s|%an <%ae>', 'master')).toBe(`deploy: ${source}|Builder <builder@example.invalid>`);
    expect(git(root, 'ls-tree', '-r', '--name-only', 'master').split('\n').sort()).toEqual(Object.keys(GOOD).sort());
    expect(git(root, 'show', 'master:index.html')).toBe(GOOD['index.html']);
    expect(existsSync(join(root, '.deploy'))).toBe(false);
    // Once more, with nothing new: no empty commit.
    const again = deploy(root, ['--commit']);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/nothing to commit/i);
    expect(git(root, 'rev-parse', 'master')).toBe(after.master);
  });

  test('the build date is the commit date of the sources: --commit twice makes one deploy commit', { timeout: 60_000 }, () => {
    const root = repository({ build: { ...GOOD, 'index.html': `<!doctype html><title>fr</title><p>${STAMP}</p>` } });
    const before = git(root, 'rev-parse', 'master');
    const first = deploy(root, ['--commit']);
    expect(first.status, first.out).toBe(0);
    const committed = git(root, 'rev-parse', 'master');
    expect(git(root, 'rev-parse', 'master~1')).toBe(before);
    const date = new Date(git(root, 'log', '-1', '--format=%cI', 'source')).toISOString();
    expect(git(root, 'show', 'master:index.html')).toContain(date);
    const again = deploy(root, ['--commit']);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/nothing to commit/i);
    expect(git(root, 'rev-parse', 'master')).toBe(committed);
  });

  test('with a local origin that master already holds, --commit fetches it and commits, and pushes nothing', { timeout: 60_000 }, () => {
    const root = repository({ origin: 'same' });
    const before = state(root);
    const { status, out } = deploy(root, ['--commit']);
    expect(status, out).toBe(0);
    expect(git(root, 'rev-parse', 'master~1')).toBe(before.master);
    expect(state(root).origin).toBe(before.origin);
  });

  test('origin ahead of master (GitHub committed a CNAME): --commit is refused before building, with the way out', { timeout: 60_000 }, () => {
    const root = repository({ origin: 'ahead' });
    const before = state(root);
    const { status, out } = deploy(root, ['--commit']);
    expect(status).not.toBe(0);
    expect(out).toMatch(/origin\/master has 1 commit/);
    expect(out).toContain('git fetch origin master:master');
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(existsSync(join(root, '.deploy'))).toBe(false);
  });

  test('master holds a CNAME the build lacks: --commit is refused, the dry run says why', { timeout: 60_000 }, () => {
    const root = repository({ master: { CNAME: 'board.example.org\n' } });
    const before = state(root);
    const dry = deploy(root);
    expect(dry.status, dry.out).toBe(0);
    expect(dry.out).toMatch(/CNAME[\s\S]*public\//);
    const { status, out } = deploy(root, ['--commit']);
    expect(status).not.toBe(0);
    expect(out).toMatch(/CNAME[\s\S]*public\//);
    expect(state(root)).toEqual(before);
    // With the CNAME in the build (public/), the deploy goes ahead and keeps it.
    const kept = repository({ build: { ...GOOD, CNAME: 'board.example.org\n' }, master: { CNAME: 'board.example.org\n' } });
    expect(deploy(kept, ['--commit']).status).toBe(0);
    expect(git(kept, 'show', 'master:CNAME')).toBe('board.example.org');
  });

  test('the commit holds the build byte for byte, or nothing is committed', { timeout: 60_000 }, () => {
    // A build whose own .gitattributes would make git rewrite a page on its way into the commit.
    const root = repository({ build: { ...GOOD, '.gitattributes': '*.html text\n', 'index.html': 'a\r\nb\r\n' } });
    const before = state(root);
    const { status, out } = deploy(root, ['--commit']);
    expect(status).not.toBe(0);
    expect(out).toMatch(/byte for byte[\s\S]*index\.html/);
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, '.deploy'))).toBe(false);
  });

  test('the variables of a git running the deploy (a hook) never point it at another repository', { timeout: 60_000 }, () => {
    const root = repository();
    const decoy = repository();
    const decoyBefore = state(decoy);
    const before = state(root);
    const env = { GIT_DIR: join(decoy, '.git'), GIT_WORK_TREE: decoy, GIT_INDEX_FILE: join(decoy, '.git', 'index') };
    const { status, out } = deploy(root, ['--commit'], env);
    expect(status, out).toBe(0);
    expect(git(root, 'rev-parse', 'master~1')).toBe(before.master);
    expect(state(decoy)).toEqual(decoyBefore);
  });

  test('--commit refuses a dirty tree before building anything', { timeout: 60_000 }, () => {
    const root = repository();
    writeFileSync(join(root, 'notes.txt'), 'not committed');
    const before = state(root);
    const { status, out } = deploy(root, ['--commit']);
    expect(status).not.toBe(0);
    expect(out).toMatch(/working tree is not clean/);
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('--push without --yes-publish is refused before anything is built or committed', { timeout: 60_000 }, () => {
    const root = repository({ origin: 'same' });
    const before = state(root);
    const { status, out } = deploy(root, ['--push']);
    expect(status).not.toBe(0);
    expect(out).toMatch(/--yes-publish/);
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('a build that fails validateDist is never committed', { timeout: 60_000 }, () => {
    const root = repository({ build: { ...GOOD, 'kit-urgence/index.html': 'x' } });
    const before = state(root);
    const { status, out } = deploy(root, ['--commit']);
    expect(status).not.toBe(0);
    expect(out).toContain('kit-urgence/ must not exist');
    expect(state(root)).toEqual(before);
    expect(existsSync(join(root, '.deploy'))).toBe(false);
  });
});
