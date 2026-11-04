// The output folder of a script that replaces its own previous output there (scripts/captures.mjs).
import { isAbsolute, relative, resolve } from 'node:path';

/**
 * `folder`, resolved, unless it is the repository at `root` or a folder that holds it: there, the
 * clean-up of the previous output would delete sources (the root index.html of Vite, for one).
 * @param {string} folder
 * @param {string} root
 * @returns {string}
 */
export function outputFolder(folder, root) {
  const out = resolve(folder);
  // From the folder to the repository: empty when they are one, a path down when the folder holds it.
  const down = relative(out, resolve(root));
  if (down === '' || (!down.startsWith('..') && !isAbsolute(down))) {
    throw new Error(`${out} holds the repository: give the captures a folder of their own (captures/ by default)`);
  }
  return out;
}
