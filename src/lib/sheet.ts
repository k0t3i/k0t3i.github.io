/**
 * A sheet is open (a popover of PartSheet.vue): while one is, Escape is the sheet's and the game under
 * it takes no key, tap or press of the keypad (useDisplay.ts, game/play.ts, TestKeypad.vue). An engine
 * without popovers has none.
 */
export function sheetOpen(): boolean {
  try {
    return document.querySelector('.sheet:popover-open') !== null;
  } catch {
    return false;
  }
}
