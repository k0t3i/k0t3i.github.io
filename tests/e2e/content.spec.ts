import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { EN, FR, LANG_LINKS, SITE, absolute, type Copy } from '../helpers/copy';

// The private project names are never written in this public repository: they are read from the
// untracked local list (tests/static/repo.test.mjs checks the sources against the same list).
const NAMES_FILE = fileURLToPath(new URL('../../private-names.local.txt', import.meta.url));
const PRIVATE_NAMES = existsSync(NAMES_FILE)
  ? readFileSync(NAMES_FILE, 'utf8')
      .split(/\r?\n/)
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
  : [];
if (PRIVATE_NAMES.length === 0) console.warn('WARNING: private-names.local.txt is missing or empty, private names are not checked');

for (const copy of [FR, EN] as Copy[]) {
  const sheets = [...copy.principles, ...copy.connectors];

  test.describe(`content of ${copy.path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(copy.path);
    });

    test('landmarks', async ({ page }) => {
      for (const role of ['banner', 'main', 'contentinfo', 'navigation'] as const) {
        await expect(page.getByRole(role), role).toHaveCount(1);
      }
    });

    test('heading outline', async ({ page }) => {
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(`${copy.heroLead} ${copy.heroStrong}`);
      // The two sections of the front face, then the back face (after the front one in the DOM).
      await expect(page.locator('h2')).toHaveText([copy.sections.principles.title, copy.sections.connectors.title, copy.back.title]);
      await expect(page.locator('h3')).toHaveCount(sheets.length);
      for (const { id } of sheets) await expect(page.locator(`#sheet-${id} h3`), id).toHaveCount(1);
    });

    test('five principles in order, five connectors in order', async ({ page }) => {
      const { principles, connectors } = copy.sections;
      await expect(page.locator(`#${principles.id} .part__label`)).toHaveText(copy.principles.map((p) => p.label));
      await expect(page.locator(`#${connectors.id} .part__label`)).toHaveText(copy.connectors.map((p) => p.label));
      await expect(page.locator(`#${connectors.id} .part__ref`)).toHaveText(['J1', 'J2', 'J3', 'J4', 'J5']);
      // A French name on the English page is marked as French, on the board and on its sheet: J1 and J4.
      for (const part of copy.connectors) {
        for (const el of [page.locator(`#part-${part.id} .part__label`), page.locator(`#sheet-${part.id}-title`)]) {
          if (part.lang) await expect(el, part.id).toHaveAttribute('lang', part.lang);
          else await expect(el, part.id).not.toHaveAttribute('lang', /.*/);
        }
      }
      expect(copy.connectors.filter((p) => p.lang).map((p) => p.id)).toEqual(copy.lang === 'en' ? ['j1', 'j4'] : []);
      await expect(page.locator(`#${principles.id}`)).toHaveAttribute('aria-labelledby', `${principles.id}-title`);
      await expect(page.locator(`#${connectors.id}`)).toHaveAttribute('aria-labelledby', `${connectors.id}-title`);
    });

    test('every sheet has the exact proof, reference and title', async ({ page }) => {
      for (const part of sheets) {
        const sheet = page.locator(`#sheet-${part.id}`);
        expect(await sheet.locator('.sheet__ref').evaluate((el) => el.textContent), part.id).toBe(`${part.ref} · ${part.kind}`);
        expect(await page.locator(`#sheet-${part.id}-title`).evaluate((el) => el.textContent), part.id).toBe(part.label);
        if (part.body !== undefined) {
          expect(await sheet.locator('.sheet__body').evaluate((el) => el.textContent), part.id).toBe(part.body);
        }
        await expect(page.locator(`#part-${part.id} .part__ref`), part.id).toHaveText(part.ref);
        await expect(sheet.locator('.sheet__close'), part.id).toHaveText(copy.close);
      }
    });

    test('the project and contact sheets', async ({ page }) => {
      // Four projects, each with the name and the link of site.json, then the contact.
      expect(copy.connectors.filter((p) => p.link).map((p) => [p.label, p.link?.href])).toEqual(
        Object.values(SITE.projects).map((p) => [p.name, absolute(p.href)]),
      );
      for (const part of copy.connectors) {
        if (part.link) {
          const link = page.locator(`#sheet-${part.id} a.sheet__link`);
          expect(await link.evaluate((el) => el.firstChild?.textContent), part.id).toBe(part.link.text);
          await expect(link).toHaveAttribute('href', part.link.href);
          await expect(link.locator('span[aria-hidden="true"]')).toHaveText('↗');
        }
      }
      // The picture is rendered when the J1 sheet first opens.
      await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
      await expect(page.locator('#sheet-j1 img')).toHaveAttribute('alt', copy.connectors[0]?.mediaAlt ?? '');
      await page.keyboard.press('Escape');
      // The contact, J5: the e-mail and GitHub of site.json.
      const contact = copy.connectors.find((p) => p.contacts);
      expect(contact?.id).toBe('j5');
      const contacts = page.locator('#sheet-j5 ul.sheet__links > li');
      await expect(contacts).toHaveCount(2);
      for (const [i, text] of (contact?.contacts ?? []).entries()) {
        expect(await contacts.nth(i).evaluate((el) => el.textContent?.replace(/ ↗$/, '')), text).toBe(text);
      }
      await expect(page.locator('#sheet-j5 a[href^="mailto:"]')).toHaveAttribute('href', `mailto:${SITE.email}`);
      await expect(page.locator(`#sheet-j5 a[href="${SITE.github}"]`)).toHaveCount(1);
    });

    test('static parts of the board', async ({ page }) => {
      expect(await page.locator('.board__name').evaluate((el) => el.textContent)).toBe('ANTHONY');
      expect(await page.locator('.board__rev').evaluate((el) => el.textContent)).toBe(copy.header.replace('ANTHONY · ', ''));
      await expect(page.locator('.hero__sub')).toHaveText(copy.heroSub);
      await expect(page.locator('.skip-link')).toHaveText(copy.skipLink);
      await expect(page.locator('.skip-link')).toHaveAttribute('href', '#contenu');
      await expect(page.locator('main')).toHaveAttribute('id', 'contenu');
      await expect(page.locator('.disp__avatar')).toHaveAttribute('alt', copy.avatarAlt);
      await expect(page.locator('.disp__avatar')).toHaveAttribute('src', '/img/avatar.png');
      await expect(page.locator('.disp__pins')).toHaveText(copy.pins);
      await expect(page.locator('.disp__caption')).toHaveText(copy.captions.avatar);
      await expect(page.locator('.disp__caption')).toHaveAttribute('aria-live', 'polite');
      await expect(page.locator('figure.disp')).toHaveAttribute('aria-labelledby', 'disp1-caption');
      expect(await page.locator('.uptime').evaluate((el) => el.textContent)).toBe(copy.uptime);
    });

    test('SW1 is a named button', async ({ page }) => {
      const sw1 = page.getByRole('button', { name: new RegExp(copy.switchHidden) });
      await expect(sw1).toHaveCount(1);
      await expect(sw1).toHaveClass(/sw1/);
      await expect(sw1.locator('.part__ref')).toHaveText(copy.switchRef);
      await expect(sw1.locator('.vh')).toHaveText(copy.switchHidden);
    });

    test('JP1 is a named toggle next to the language pads', async ({ page }) => {
      const jp1 = page.getByRole('button', { name: `${copy.theme.ref} ${copy.theme.switchHidden}` });
      await expect(jp1).toHaveCount(1);
      await expect(jp1).toHaveClass(/jp1/);
      await expect(jp1).toHaveAttribute('aria-pressed', 'false');
      await expect(jp1.locator('.part__ref')).toHaveText(copy.theme.ref);
      await expect(jp1.locator('.jp1__pos[aria-hidden="true"]')).toHaveText([copy.theme.green, copy.theme.dark]);
      await expect(jp1.locator('.vh')).toHaveText(copy.theme.switchHidden);
      // In the banner, right after the language navigation.
      await expect(page.locator('header.board__header nav.lang + .board__jp1 > button.jp1')).toHaveCount(1);
    });

    test('SW2 is a named toggle after JP1, on both faces', async ({ page }) => {
      const name = `${copy.back.ref} ${copy.back.switchHidden}`;
      // The SW2 of the face that is up; the other face is inert.
      const front = page.getByRole('button', { name });
      await expect(front).toHaveCount(1);
      await expect(front).toHaveClass(/sw2/);
      await expect(front).toHaveAttribute('aria-pressed', 'false');
      await expect(front.locator('.sw2__pos[aria-hidden="true"]')).toHaveText([copy.back.top, copy.back.bot]);
      await expect(page.locator('header.board__header .board__jp1 + .board__sw2 > button.sw2')).toHaveCount(1);
      await expect(page.locator('section.board__face--back[aria-labelledby="back-title"] .board__sw2 > button.sw2')).toHaveCount(1);
    });

    test('the three PCB marks', async ({ page }) => {
      const marks = page.locator('.pcb-marks > li');
      await expect(marks).toHaveCount(copy.marks.length);
      for (const [i, m] of copy.marks.entries()) {
        await expect(marks.nth(i).locator('[aria-hidden="true"]')).toHaveText(m.visible);
        await expect(marks.nth(i).locator('.vh')).toHaveText(m.hidden);
      }
      // The marks live in the footer only.
      for (const m of copy.marks) await expect(page.locator('main').getByText(m.visible, { exact: true })).toHaveCount(0);
    });

    test('language links', async ({ page }) => {
      const nav = page.locator('nav.lang');
      await expect(nav).toHaveAttribute('aria-label', copy.langNavLabel);
      const links = nav.locator('a.lang__link');
      for (const [i, l] of LANG_LINKS.entries()) {
        const a = links.nth(i);
        await expect(a).toHaveText(l.text);
        await expect(a).toHaveAttribute('aria-label', l.label);
        await expect(a).toHaveAttribute('hreflang', l.lang);
        await expect(a).toHaveAttribute('lang', l.lang);
        await expect(a).toHaveAttribute('href', l.href);
      }
      const current = copy.lang === 'fr' ? 0 : 1;
      await expect(links.nth(current)).toHaveAttribute('aria-current', 'page');
      await expect(links.nth(1 - current)).not.toHaveAttribute('aria-current', /.*/);
    });

    test('external links are in the allowlist', async ({ page }) => {
      const { baseUrl, email, github } = SITE;
      const allowed = new Set([
        baseUrl,
        `${baseUrl}en/`,
        `${baseUrl}img/og-fr.jpg`,
        `${baseUrl}img/og-en.jpg`,
        github,
        // The link of each project, as site.json gives it.
        ...Object.values(SITE.projects).map((p) => absolute(p.href)),
        `mailto:${email}`,
        'https://schema.org',
      ]);
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], link[href]')]
          .map((el) => el.getAttribute('href') ?? '')
          .filter((h) => /^(https?:|mailto:)/.test(h)),
      );
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.filter((h) => !allowed.has(h))).toEqual([]);
      // Links open in the same tab.
      expect(await page.locator('a[target]').count()).toBe(0);
    });

    test('no inline style', async ({ page }) => {
      expect(await page.locator('[style]').count()).toBe(0);
    });

    test('no private name', async ({ page }) => {
      test.skip(PRIVATE_NAMES.length === 0, 'private-names.local.txt is missing or empty');
      const html = (await page.content()).toLowerCase();
      expect(PRIVATE_NAMES.filter((n) => html.includes(n))).toEqual([]);
    });
  });
}

test('french typography', async ({ page }) => {
  await page.goto(FR.path);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue ?? '';
      // Straight apostrophe, or a regular space before : ; ! ? or before the unit "h" after a number.
      if (/'| [:;!?]|\d h\b/.test(text)) out.push(text);
    }
    return out;
  });
  expect(bad).toEqual([]);
  expect(await page.locator('.uptime__value').evaluate((el) => el.textContent)).toBe('46 000');
});

test('english typography', async ({ page }) => {
  await page.goto(EN.path);
  const straight = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/'/.test(n.nodeValue ?? '')) out.push(n.nodeValue ?? '');
    return out;
  });
  expect(straight).toEqual([]);
  expect(await page.locator('.uptime__value').evaluate((el) => el.textContent)).toBe('46,000');
});
