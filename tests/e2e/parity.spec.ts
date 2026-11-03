import { expect, test, type Page } from '@playwright/test';

/** Section ids differ between the languages: they are mapped, never used as style hooks. */
const ID_MAP: Record<string, string> = {
  principes: 'principles',
  'principes-title': 'principles-title',
  connecteurs: 'connectors',
  'connecteurs-title': 'connectors-title',
};

const ATTRS = [
  'type',
  'popovertarget',
  'popovertargetaction',
  'role',
  'tabindex',
  'autofocus',
  'popover',
  'aria-live',
  'aria-hidden',
  'loading',
  'sizes',
];

/** The structure of the app: tags, classes and ids (mapped), key attributes; no text, no `lang`. */
async function skeleton(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  return page.evaluate(
    ({ idMap, attrs }) => {
      const out: string[] = [];
      const walk = (el: Element, depth: number): void => {
        const id = el.id ? `#${idMap[el.id] ?? el.id}` : '';
        const labelledby = el.getAttribute('aria-labelledby');
        const mapped = labelledby ? `[aria-labelledby=${idMap[labelledby] ?? labelledby}]` : '';
        const found = attrs
          .filter((a) => el.hasAttribute(a))
          .map((a) => `[${a}]`)
          .join('');
        const cls = el.getAttribute('class');
        const classes = cls ? `.${cls.trim().split(/\s+/).join('.')}` : '';
        out.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${id}${classes}${found}${mapped}`);
        for (const child of el.children) walk(child, depth + 1);
      };
      walk(document.querySelector('#app') as Element, 0);
      return out;
    },
    { idMap: ID_MAP, attrs: ATTRS },
  );
}

test('FR and EN have the same structure', async ({ page }) => {
  const fr = await skeleton(page, '/');
  const en = await skeleton(page, '/en/');
  expect(fr.length).toBeGreaterThan(100);
  expect(en).toEqual(fr);
});
