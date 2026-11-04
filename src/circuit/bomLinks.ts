// Written by tests/unit/circuit-bom.spec.ts (UPDATE_BOM_LINKS=1 npx vitest run tests/unit/circuit-bom.spec.ts): never by hand.
// The parts each part of the bill of materials is linked to, computed from the netlist (links.ts): the
// page ships this, not the netlist.
import type { BomRef } from './bom';

export const BOM_LINKS: Readonly<Record<BomRef, readonly string[]>> = {
  U10: ['U11', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6', 'J7', 'R1', 'LED1', 'D1', 'U2', 'J1', 'J2', 'J3', 'J4', 'J5', 'DISP1'],
  U11: ['U10'],
  U12: [],
  U13: ['U10', 'J5'],
  U14: ['U10', 'SW1', 'SW2', 'JP1'],
  U15: ['U10', 'D2', 'D3', 'D4', 'D5'],
  U16: ['U10', 'Y2'],
  U17: ['U10', 'J6'],
  U18: ['U10'],
  Y1: ['U10'],
  J6: ['U10', 'U17'],
};
