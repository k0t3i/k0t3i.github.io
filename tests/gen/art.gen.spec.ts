import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { renderBackArt } from '../../src/circuit/art';
import { liveLayer } from '../../src/circuit/live';

/** From the routed board (routes.json): the art of the back face, and its live layer (npm run gen:circuit). */
it('draws the back face', () => {
  writeFileSync(new URL('../../src/assets/img/board-back.svg', import.meta.url), renderBackArt());
  writeFileSync(new URL('../../src/assets/img/board-back-small.svg', import.meta.url), renderBackArt({ refs: false }));
  writeFileSync(new URL('../../src/circuit/live.json', import.meta.url), `${JSON.stringify(liveLayer())}\n`);
});
