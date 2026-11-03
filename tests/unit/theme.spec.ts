import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_KEY, THEME_SNIPPET } from '../../src/lib/theme';

describe('resolveTheme', () => {
  it('is green by default', () => expect(resolveTheme({ saved: null, prefersDark: false })).toBe('green'));
  it('follows a dark scheme', () => expect(resolveTheme({ saved: null, prefersDark: true })).toBe('dark'));
  it('lets a saved green win over a dark scheme', () => expect(resolveTheme({ saved: 'green', prefersDark: true })).toBe('green'));
  it('lets a saved dark win over a light scheme', () => expect(resolveTheme({ saved: 'dark', prefersDark: false })).toBe('dark'));
  it('ignores an unknown saved value', () => expect(resolveTheme({ saved: 'bogus', prefersDark: false })).toBe('green'));
});

describe('THEME_SNIPPET', () => {
  /** Runs the snippet against a fake page; returns the data-theme it set, or undefined. */
  function run(saved: string | null, prefersDark: boolean): string | undefined {
    const dataset: Record<string, string> = {};
    runInNewContext(THEME_SNIPPET, {
      localStorage: { getItem: (key: string) => (key === THEME_KEY ? saved : null) },
      matchMedia: (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && prefersDark }),
      document: { documentElement: { dataset } },
    });
    return dataset.theme;
  }

  it('uses the storage key k0t3i.theme', () => expect(THEME_KEY).toBe('k0t3i.theme'));
  it('does not close a script element early', () => expect(THEME_SNIPPET).not.toMatch(/<\/script/i));
  it('sets nothing without a saved choice: the CSS follows the scheme', () => {
    expect(run(null, false)).toBeUndefined();
    expect(run(null, true)).toBeUndefined();
  });
  it('sets the saved choice, whatever the scheme', () => {
    expect(run('dark', false)).toBe('dark');
    expect(run('green', true)).toBe('green');
  });
  it('ignores an unknown saved value', () => expect(run('bogus', true)).toBeUndefined());
  it('swallows a storage that throws', () => {
    const dataset: Record<string, string> = {};
    const context = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
      matchMedia: () => ({ matches: false }),
      document: { documentElement: { dataset } },
    };
    expect(() => runInNewContext(THEME_SNIPPET, context)).not.toThrow();
    expect(dataset.theme).toBeUndefined();
  });
  it('swallows a page without storage at all', () => expect(() => runInNewContext(THEME_SNIPPET, {})).not.toThrow());
});
