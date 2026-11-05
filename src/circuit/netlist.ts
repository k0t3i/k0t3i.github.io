import { DEVICES, type Device, type DeviceId } from './devices';

/**
 * The schematic of the board (spec 4.10, revision 9): a real circuit on an ESP32-S3 that runs the
 * parts of the front face. Every part, its value and the net of each of its pins; the pins left open,
 * each with its reason from the datasheet. Checked by tests/unit/circuit-erc.spec.ts.
 *
 * - Power: J5 (USB-C, a USB 2.0 sink: 5.1 kΩ on CC1 and CC2) brings VBUS; U12 (AP2112K) makes +3V3.
 * - U10, the ESP32-S3: its decoupling as Espressif asks, CHIP_PU with its RC (10 kΩ, 1 µF) and the reset
 *   of U17, GPIO0 pulled up (boot from flash), Y1 40 MHz and its load capacitors (2 · (CL − 3 pF) ≈ 15 pF),
 *   its native USB on J5 through U13, UART0 and the boot pins on J6, the radio out through the π network
 *   (C14, L1, C15) to J7, its quad flash U11 on VDD_SPI (3.3 V: GPIO45 left to its weak pull-down).
 * - The front: DISP1 on SPI (SCK, MOSI, DC, CS); J3 (microSD) on the same bus, in SPI mode; J1, four
 *   GPIOs and 3.3 V; J2, the I²C bus (SCL, SDA, 3V3, GND, as a Grove port); J4, a 1-Wire port (4.7 kΩ pull-up, D1
 *   clamps it to 3.3 V, a Schottky); LED1 lit through R1; C1 the bulk of the 3.3 V rail; U2 (LM75B) measures the
 *   temperature, away from the hot parts; SW1 (debounced by R9 and C18), SW2 and JP1 (the theme) read by
 *   U14 (TCA9554, JP1 on P0, SW2 on P1, SW1 on P2), which raises EXP_INT.
 * - The test keypad of the front (spec 4.11): SW3 to SW8 (↑ ↓ ← → B A), each between a free GPIO of the
 *   chip and the ground, pulled up by 10 kΩ (RN1, a bussed network), its pads on the TEST row J8
 *   (the targets of a test bed); TP5, the ground of the bed. The 5 V of J5 (VBUS_C) reaches the board
 *   through the ferrite bead FB1, filtered by C27.
 *   The four JTAG pins are GPIOs (JTAG runs over the native USB): LED_DRV, RTC_INT, SDA and SCL leave the
 *   chip there, by the devices they serve, so that the keys take six pins of its bottom side.
 * - On I²C (4.7 kΩ pull-ups): U14 0x20, U15 (PCA9633, the four status LEDs) 0x62, U16 (PCF8563, the
 *   uptime, its 32.768 kHz crystal Y2) 0x51, U18 (BH1750, ambient light) 0x23, U2 0x48.
 */

export type NetKind = 'power' | 'ground' | 'signal';

export interface Net {
  name: string;
  kind: NetKind;
  /** Its pins, "REF.PIN". */
  pins: string[];
  /** A shared bus the chip U10 is the master of: its devices list the chip only (spec 4.10). */
  bus?: 'i2c' | 'spi';
}

export interface Part {
  ref: string;
  /**
   * A part of the front drawn by its art only, out of the content of the page: its pads are on the
   * page, but « Relié à » looks through it without naming it (the pull-ups of the keypad, spec 4.11).
   */
  art?: true;
  dev: DeviceId;
  value?: string;
  face: 'back' | 'front';
  /** Its I²C address, on the bus. */
  address?: number;
  /** For each power pin of a chip, its decoupling capacitors (placed by it, layout.ts). */
  decoupling?: Record<string, string[]>;
}

const part = (ref: string, dev: DeviceId, value?: string, extra: Partial<Part> = {}): Part => ({ ref, dev, value, face: 'back', ...extra });
const front = (ref: string, dev: DeviceId, value?: string, extra: Partial<Part> = {}): Part => part(ref, dev, value, { face: 'front', ...extra });

export const PARTS: readonly Part[] = [
  // The 11 parts of the bill of materials.
  part('U10', 'esp32s3', 'ESP32-S3', { decoupling: { 2: ['C4', 'C5'], 3: ['C4', 'C5'], 20: ['C6'], 46: ['C8'], 55: ['C9', 'C10'], 56: ['C9', 'C10'] } }),
  part('U11', 'w25q128', '16 MB', { decoupling: { 8: ['C16'] } }),
  part('U12', 'ap2112k', '3.3 V', { decoupling: { 1: ['C2'] } }),
  part('U13', 'usblc6', undefined, { decoupling: { 5: ['C26'] } }),
  part('U14', 'tca9554', undefined, { address: 0x20, decoupling: { 16: ['C17'] } }),
  part('U15', 'pca9633', undefined, { address: 0x62, decoupling: { 8: ['C19'] } }),
  part('U16', 'pcf8563', undefined, { address: 0x51, decoupling: { 8: ['C20'] } }),
  part('U17', 'apx803', '2.93 V', { decoupling: { 3: ['C21'] } }),
  part('U18', 'bh1750', undefined, { address: 0x23, decoupling: { 1: ['C22'] } }),
  part('Y1', 'xtal40m', '40 MHz'),
  part('J6', 'header6smd'),
  // The rest of the back face.
  part('J7', 'ufl'),
  part('Y2', 'xtal32k', '32.768 kHz'),
  part('L1', 'l0402', '2.7 nH'),
  part('C2', 'c0603', '4.7 µF'),
  part('C3', 'c0603', '10 µF'),
  part('C4', 'c0603', '10 µF'),
  part('C5', 'c0402', '100 nF'),
  part('C6', 'c0402', '100 nF'),
  part('C7', 'c0402', '1 µF'),
  part('C8', 'c0402', '100 nF'),
  part('C9', 'c0402', '100 nF'),
  part('C10', 'c0402', '1 µF'),
  part('C11', 'c0402', '1 µF'),
  part('C12', 'c0402', '15 pF'),
  part('C13', 'c0402', '15 pF'),
  part('C14', 'c0402', '1.5 pF'),
  part('C15', 'c0402', '1.2 pF'),
  part('C16', 'c0402', '100 nF'),
  part('C17', 'c0402', '100 nF'),
  part('C18', 'c0402', '100 nF'),
  part('C19', 'c0402', '100 nF'),
  part('C20', 'c0402', '100 nF'),
  part('C21', 'c0402', '100 nF'),
  part('C22', 'c0402', '100 nF'),
  part('C23', 'c0402', '100 nF'),
  part('C24', 'c0402', '100 nF'),
  part('C25', 'c0402', '100 nF'),
  part('C26', 'c0402', '100 nF'),
  part('R2', 'r0402', '5.1 kΩ'),
  part('R3', 'r0402', '5.1 kΩ'),
  part('R4', 'r0402', '10 kΩ'),
  part('R5', 'r0402', '10 kΩ'),
  part('R6', 'r0402', '4.7 kΩ'),
  part('R7', 'r0402', '4.7 kΩ'),
  part('R8', 'r0402', '10 kΩ'),
  part('R9', 'r0402', '10 kΩ'),
  part('R10', 'r0402', '1 kΩ'),
  part('R11', 'r0402', '1 kΩ'),
  part('R12', 'r0402', '1 kΩ'),
  part('R13', 'r0402', '1 kΩ'),
  part('R14', 'r0402', '10 kΩ'),
  part('R15', 'r0402', '10 kΩ'),
  part('R16', 'r0402', '10 kΩ'),
  part('R17', 'r0402', '10 kΩ'),
  part('R18', 'r0402', '10 kΩ'),
  part('R19', 'r0402', '10 kΩ'),
  part('R20', 'r0402', '4.7 kΩ'),
  part('D2', 'led0603', 'green'),
  part('D3', 'led0603', 'amber'),
  part('D4', 'led0603', 'red'),
  part('D5', 'led0603', 'blue'),
  part('TP2', 'tp', 'VBUS'),
  part('TP3', 'tp', 'GND'),
  part('TP4', 'tp', 'EN'),
  // The front face: its principles, its connectors, its switches, its display, its test point.
  // The values of the principles are printed on the front too (DISP1's readouts, content/readouts.ts):
  // - R1, 10 kΩ: LED1 as a dim status indicator, (3.3 V − 2.0 V) / 10 kΩ ≈ 0.13 mA, the brightness of a
  //   standby light; its readout « 20mA » is the rated current of the LED, not what it draws here.
  // - C1, 10 µF: the bulk capacitance of the 3.3 V rail at the far end of its run on the front (the row
  //   of the principles, where no chip needs a decoupling capacitor), as C3 is at the regulator.
  // - D1, BAT42W: the Schottky clamp of the 1-Wire line to 3.3 V, about 0.25 V at 1 mA: a fault lifts
  //   the line to about 3.55 V, within the 3.6 V the ESP32-S3 allows (Anthony's choice, 05/11/2026).
  front('R1', 'r0805', '10 kΩ'),
  front('C1', 'c0805', '10 µF'),
  front('LED1', 'led0805', 'amber'),
  front('D1', 'bat42w', 'BAT42W'),
  front('U2', 'lm75b', undefined, { address: 0x48, decoupling: { 8: ['C25'] } }),
  front('J1', 'header6'),
  front('J2', 'header4'),
  front('J3', 'microsd'),
  front('J4', 'jst3'),
  front('J5', 'usbc'),
  front('SW1', 'tact'),
  front('SW2', 'slide'),
  front('JP1', 'jumper3'),
  front('DISP1', 'display'),
  front('TP1', 'tp', '3V3'),
  // The test keypad (spec 4.11, keypad.ts): ↑ ↓ ← → B A, their pull-ups, the TEST row, the ground of the bed.
  front('SW3', 'b3fs'),
  front('SW4', 'b3fs'),
  front('SW5', 'b3fs'),
  front('SW6', 'b3fs'),
  front('SW7', 'b3fs'),
  front('SW8', 'b3fs'),
  front('RN1', 'rn7bussed', '10 kΩ'),
  front('J8', 'testpads10'),
  front('TP5', 'tp', 'GND'),
  // The 5 V input: the ferrite bead and its capacitor, by J5.
  front('FB1', 'fb0603', '220 Ω', { art: true }),
  front('C27', 'c0603', '4.7 µF', { art: true }),
];

const net = (name: string, kind: NetKind, pins: string, bus?: Net['bus']): Net => ({ name, kind, pins: pins.trim().split(/\s+/), ...(bus ? { bus } : {}) });

export const NETS: readonly Net[] = [
  net('GND', 'ground', `
    U10.57 U11.4 U12.2 U13.2 U14.8 U14.1 U14.2 U14.3 U15.5 U16.4 U17.1 U18.3 U18.2 Y1.2 Y1.4 J6.6 J7.2 J7.3
    C2.2 C3.2 C4.2 C5.2 C6.2 C7.2 C8.2 C9.2 C10.2 C11.2 C12.2 C13.2 C14.2 C15.2 C16.2 C17.2 C18.2 C19.2 C20.2
    C21.2 C22.2 C23.2 C24.2 C25.2 C26.2 R2.2 R3.2 TP3.1
    C1.2 LED1.K U2.4 U2.5 U2.6 U2.7 J1.6 J2.4 J3.6 J3.S1 J3.S2 J4.3
    J5.A1 J5.A12 J5.B1 J5.B12 J5.S1 J5.S2 J5.S3 J5.S4 SW1.3 SW1.4 SW2.3 JP1.3 DISP1.1
    SW3.3 SW3.4 SW4.3 SW4.4 SW5.3 SW5.4 SW6.3 SW6.4 SW7.3 SW7.4 SW8.3 SW8.4 TP5.1 C27.2`),
  net('VBUS_C', 'power', 'J5.A4 J5.B4 J5.A9 J5.B9 FB1.1'),
  net('VBUS', 'power', 'FB1.2 C27.1 U12.1 U12.3 U13.5 C2.1 C26.1 TP2.1'),
  net('+3V3', 'power', `
    U12.5 C3.1 U10.2 U10.3 U10.20 U10.46 U10.55 U10.56 C4.1 C5.1 C6.1 C8.1 C9.1 C10.1
    R4.1 R5.1 R6.1 R7.1 R8.1 R9.1 R10.1 R11.1 R12.1 R13.1 R14.1 R15.1 R16.1 R17.1 R18.1 R19.1 R20.1
    U14.16 C17.1 U15.8 C19.1 U16.8 C20.1 U17.3 C21.1 U18.1 C22.1 C24.1 C25.1 J6.1
    C1.1 D1.K U2.8 J1.5 J2.3 J3.4 J4.2 SW2.1 JP1.1 DISP1.2 TP1.1 RN1.1`),
  net('VDD_SPI', 'power', 'U10.29 U11.8 C7.1 C16.1'),
  // The radio, through the π network.
  net('LNA_IN', 'signal', 'U10.1 C14.1 L1.1'),
  net('RF', 'signal', 'L1.2 C15.1 J7.1'),
  // Reset, boot and the debug header.
  net('EN', 'signal', 'U10.4 R4.2 C11.1 U17.2 J6.2 TP4.1'),
  net('IO0', 'signal', 'U10.5 R5.2 J6.3'),
  net('TXD', 'signal', 'U10.49 J6.4'),
  net('RXD', 'signal', 'U10.50 J6.5'),
  net('XTAL_P', 'signal', 'U10.54 Y1.1 C12.1'),
  net('XTAL_N', 'signal', 'U10.53 Y1.3 C13.1'),
  // The quad flash.
  net('FLASH_CS', 'signal', 'U10.32 U11.1'),
  net('FLASH_CLK', 'signal', 'U10.33 U11.6'),
  net('FLASH_IO0', 'signal', 'U10.35 U11.5'),
  net('FLASH_IO1', 'signal', 'U10.34 U11.2'),
  net('FLASH_IO2', 'signal', 'U10.31 U11.3'),
  net('FLASH_IO3', 'signal', 'U10.30 U11.7'),
  // USB: the receptacle, the protection, the chip; a sink on CC1 and CC2.
  net('USB_DP_C', 'signal', 'J5.A6 J5.B6 U13.3'),
  net('USB_DN_C', 'signal', 'J5.A7 J5.B7 U13.1'),
  net('USB_DP', 'signal', 'U10.26 U13.4'),
  net('USB_DN', 'signal', 'U10.25 U13.6'),
  net('CC1', 'signal', 'J5.A5 R2.1'),
  net('CC2', 'signal', 'J5.B5 R3.1'),
  // The SPI bus: DISP1 and the microSD card (J3, its unused lines pulled up).
  net('SPI_SCK', 'signal', 'U10.6 DISP1.3 J3.5', 'spi'),
  net('SPI_MOSI', 'signal', 'U10.7 DISP1.4 J3.3', 'spi'),
  net('SPI_MISO', 'signal', 'U10.11 J3.7 R17.2', 'spi'),
  net('DISP_CS', 'signal', 'U10.10 DISP1.6'),
  net('DISP_DC', 'signal', 'U10.9 DISP1.5'),
  net('SD_CS', 'signal', 'U10.19 J3.2 R16.2'),
  net('SD_DAT1', 'signal', 'J3.8 R18.2'),
  net('SD_DAT2', 'signal', 'J3.1 R19.2'),
  // The I²C bus.
  net('SDA', 'signal', 'U10.47 R6.2 U14.15 U15.7 U16.5 U18.4 U2.1 J2.2', 'i2c'),
  net('SCL', 'signal', 'U10.48 R7.2 U14.14 U15.6 U16.6 U18.6 U2.2 J2.1', 'i2c'),
  // The inputs of the front, read by U14, and its interrupt.
  net('EXP_INT', 'signal', 'U10.12 U14.13 R8.2'),
  net('BTN', 'signal', 'SW1.1 SW1.2 U14.6 R9.2 C18.1'),
  net('FLIP', 'signal', 'SW2.2 U14.5'),
  net('THEME', 'signal', 'JP1.2 U14.4'),
  // J1: four GPIOs.
  net('EXT1', 'signal', 'U10.18 J1.1'),
  net('EXT2', 'signal', 'U10.17 J1.2'),
  net('EXT3', 'signal', 'U10.16 J1.3'),
  net('EXT4', 'signal', 'U10.15 J1.4'),
  // J4: 1-Wire.
  net('ONEWIRE', 'signal', 'U10.23 J4.1 R20.2 D1.A'),
  // LED1, through R1.
  net('LED_DRV', 'signal', 'U10.44 R1.1'),
  net('LED_A', 'signal', 'R1.2 LED1.A'),
  // The test keypad: each key on a GPIO of the chip (GPIO33 to GPIO36, GPIO47, GPIO48: with a quad
  // flash, the octal pins are free), its pull-up in RN1, its TEST pads. GPIO47 and GPIO48 (SPICLK_P,
  // SPICLK_N) are in the VDD_SPI power domain: VDD_SPI is 3.3 V here (GPIO45 low, its strap), so their
  // pull-ups to +3V3 never drive them above their own supply.
  net('KEY_UP', 'signal', 'U10.41 SW3.1 SW3.2 RN1.2 J8.1 J8.2'),
  net('KEY_DOWN', 'signal', 'U10.40 SW4.1 SW4.2 RN1.3 J8.3 J8.4'),
  net('KEY_LEFT', 'signal', 'U10.39 SW5.1 SW5.2 RN1.4 J8.5 J8.7'),
  net('KEY_RIGHT', 'signal', 'U10.38 SW6.1 SW6.2 RN1.5 J8.6 J8.8'),
  net('KEY_B', 'signal', 'U10.37 SW7.1 SW7.2 RN1.6 J8.9'),
  net('KEY_A', 'signal', 'U10.36 SW8.1 SW8.2 RN1.7 J8.10'),
  // The status LEDs, sunk by U15.
  net('STAT0', 'signal', 'U15.1 D2.K'),
  net('STAT1', 'signal', 'U15.2 D3.K'),
  net('STAT2', 'signal', 'U15.3 D4.K'),
  net('STAT3', 'signal', 'U15.4 D5.K'),
  net('STAT0_A', 'signal', 'R10.2 D2.A'),
  net('STAT1_A', 'signal', 'R11.2 D3.A'),
  net('STAT2_A', 'signal', 'R12.2 D4.A'),
  net('STAT3_A', 'signal', 'R13.2 D5.A'),
  // The RTC: its crystal, its interrupt.
  net('OSCI', 'signal', 'U16.1 Y2.1'),
  net('OSCO', 'signal', 'U16.2 Y2.2'),
  net('RTC_INT', 'signal', 'U10.45 U16.3 R14.2'),
  // The light sensor: DVI held low for a while after power-up (R15, C23).
  net('DVI', 'signal', 'U18.5 R15.2 C23.1'),
];

const UNUSED = 'unused GPIO, input disabled until set up';

/** The pins left open, and why (types out, od, io; nc pins need no reason). */
export const NC: Readonly<Record<string, string>> = {
  'U10.8': 'GPIO3 strap (JTAG source): floating by default, read only with an eFuse burnt',
  'U10.51': 'GPIO45 strap (VDD_SPI voltage): its weak pull-down gives 3.3 V for the flash',
  'U10.52': 'GPIO46 strap (boot mode, ROM log): its weak pull-down, with GPIO0 high, boots from flash',
  'U10.21': 'XTAL_32K_P: no 32 kHz crystal on the chip, the RTC U16 keeps its own',
  'U10.22': 'XTAL_32K_N: no 32 kHz crystal on the chip, the RTC U16 keeps its own',
  'U10.24': UNUSED,
  'U10.27': UNUSED,
  'U10.28': 'SPICS1: chip select of an external PSRAM, none fitted',
  'U10.13': UNUSED,
  'U10.14': UNUSED,
  'U10.42': UNUSED,
  'U10.43': UNUSED,
  'U14.7': 'P3 unused: an input with its internal 100 kΩ pull-up',
  'U14.9': 'P4 unused: an input with its internal 100 kΩ pull-up',
  'U14.10': 'P5 unused: an input with its internal 100 kΩ pull-up',
  'U14.11': 'P6 unused: an input with its internal 100 kΩ pull-up',
  'U14.12': 'P7 unused: an input with its internal 100 kΩ pull-up',
  'U16.7': 'CLKOUT: open-drain clock output, not used',
  'U2.3': 'OS: open-drain thermostat output, not used',
};

/** The device of a part. */
export function deviceOf(ref: string): Device {
  const p = PARTS.find((x) => x.ref === ref);
  if (!p) throw new Error(`no part ${ref}`);
  return DEVICES[p.dev];
}

/** Every pin of a part, "REF.PIN". */
export const pinsOf = (ref: string): string[] => Object.keys(deviceOf(ref).pins).map((p) => `${ref}.${p}`);

/** The net of a pin, if any. */
export const netOf = (pin: string): Net | undefined => NETS.find((n) => n.pins.includes(pin));
