// A small reader of CSS for the static tests: enough for the stylesheets of this site (layers, nested
// at-rules and rules, quoted strings, parentheses in selectors and values), not a full parser.

/**
 * The blocks and the declarations of a stylesheet. Each one has the preludes of the blocks around it,
 * outermost first (`@layer motion`, `@media (...)`, `.sheet`, `@keyframes x`, `50%`): `parents`.
 * A block has its `prelude`; a declaration its `property` (lower case) and its `value`.
 * Comments are dropped; `;` and braces inside strings or parentheses do not count.
 */
export function parseCss(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  const declarations = [];
  const stack = [];
  let text = '';
  let quote = null;
  let depth = 0;
  const declare = () => {
    const t = text.trim();
    text = '';
    const colon = t.indexOf(':');
    // At-rule statements (`@layer a, b;`) and empty text are not declarations.
    if (colon < 1 || t.startsWith('@')) return;
    declarations.push({ property: t.slice(0, colon).trim().toLowerCase(), value: t.slice(colon + 1).trim(), parents: [...stack] });
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      text += ch;
      if (ch === '\\') text += source[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && ch === '{') {
      const prelude = text.trim().replace(/\s+/g, ' ');
      blocks.push({ prelude, parents: [...stack] });
      stack.push(prelude);
      text = '';
      continue;
    } else if (depth === 0 && (ch === ';' || ch === '}')) {
      declare();
      if (ch === '}') stack.pop();
      continue;
    }
    text += ch;
  }
  return { blocks, declarations };
}

/** Splits a value at the top level (outside parentheses): on commas, or on white space. */
export function splitTopLevel(value, on = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && (on === ' ' ? /\s/.test(ch) : ch === on)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
