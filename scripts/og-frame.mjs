// The framing of the share images (scripts/og.mjs), without a browser: the static tests import it.

/**
 * The part of a capture that becomes the image: the ratio of the output, as tall as the capture,
 * centred on the board. The board (16:9) is narrower than 1.905:1, so the frame goes past the
 * capture on both sides: the flat colour of the page fills it there, as a wider window would show
 * it. Nothing of the board, its edge or its shadow is cut. In capture pixels.
 */
export function frameOf(board, capture, out) {
  const height = capture.height;
  const width = (height * out.width) / out.height;
  return {
    x: board.x + board.width / 2 - width / 2,
    y: board.y + board.height / 2 - height / 2,
    width,
    height,
  };
}

/**
 * The colour that fills the frame past the capture: the background of the page as computed, opaque.
 * A see-through colour (or one this cannot read) throws: the JPEG would get black or seamed side bands.
 */
export function opaqueFill(colour) {
  const m = /^rgba?\(\s*\d+(?:\.\d+)?,\s*\d+(?:\.\d+)?,\s*\d+(?:\.\d+)?(?:,\s*([\d.]+))?\s*\)$/.exec(colour ?? '');
  if (!m || (m[1] !== undefined && Number(m[1]) !== 1)) {
    throw new Error(`og: the page colour must be opaque to fill the sides of the image, got "${colour}"`);
  }
  return colour;
}
