/**
 * The parts library of the circuit of the board (spec 4.10): every part placed on it is a real one,
 * its pins as in its datasheet (number, name, electrical type). Used by the netlist (netlist.ts), the
 * electrical rules check (tests/unit/circuit-erc.spec.ts) and the layout; none of it ships in the page.
 *
 * Pin types:
 * - power: a supply input; ground: a ground pin; supply: a supply output (a regulator, VDD_SPI);
 * - in: an input that must never float; out / od: a push-pull / open-drain output (may be left open);
 * - io: an input/output (may be left open when unused, with its reason); analog; passive: a pin of a
 *   passive part or a connector; nc: not connected inside, per the datasheet.
 */
export type PinType = 'power' | 'ground' | 'supply' | 'in' | 'out' | 'od' | 'io' | 'analog' | 'passive' | 'nc';

export interface Device {
  /** The manufacturer part number. */
  mpn: string;
  /** Where its pinout comes from. */
  datasheet: string;
  /** Its pins: number (or name, for a connector) → [name, type]. */
  pins: Record<string, [string, PinType]>;
  /** Pins joined inside the part (a flow-through ESD array, the two legs of a switch). */
  bridges?: [string, string][];
  /** The supply voltage it runs at, when it matters to the rules (the flash). */
  supply?: number;
  /** Passive parts are looked through by « Relié à » (spec 4.10): resistors, capacitors, inductors, clamps, test points. */
  transparent?: true;
}

/** "1 NAME type, 2 NAME type, ...": a pinout as the datasheet prints it. */
function pinout(list: string): Device['pins'] {
  return Object.fromEntries(
    list
      .trim()
      .split(/\s*,\s*/)
      .map((entry) => {
        const [pin = '', name = '', type = ''] = entry.split(/\s+/);
        return [pin, [name, type as PinType]];
      }),
  );
}

const two = (a: string, b: string): Device['pins'] => ({ [a]: [a, 'passive'], [b]: [b, 'passive'] });
const header = (n: number): Device['pins'] => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), [String(i + 1), 'passive']]));

export const DEVICES = {
  // Espressif ESP32-S3 Series Datasheet v2.2, Table 2-1 Pin Overview (QFN56, 7 x 7 mm); the bare chip,
  // no flash and no PSRAM in package (an external quad flash on SPI0/1). Pin 57 is the exposed pad.
  esp32s3: {
    mpn: 'ESP32-S3 (Espressif, QFN56 7 x 7 mm)',
    datasheet: 'ESP32-S3 Series Datasheet v2.2, §2 Table 2-1, §3 Table 3-1',
    pins: pinout(`
      1 LNA_IN analog, 2 VDD3P3 power, 3 VDD3P3 power, 4 CHIP_PU in, 5 GPIO0 io, 6 GPIO1 io, 7 GPIO2 io,
      8 GPIO3 io, 9 GPIO4 io, 10 GPIO5 io, 11 GPIO6 io, 12 GPIO7 io, 13 GPIO8 io, 14 GPIO9 io,
      15 GPIO10 io, 16 GPIO11 io, 17 GPIO12 io, 18 GPIO13 io, 19 GPIO14 io, 20 VDD3P3_RTC power,
      21 XTAL_32K_P io, 22 XTAL_32K_N io, 23 GPIO17 io, 24 GPIO18 io, 25 GPIO19 io, 26 GPIO20 io,
      27 GPIO21 io, 28 SPICS1 io, 29 VDD_SPI supply, 30 SPIHD io, 31 SPIWP io, 32 SPICS0 io,
      33 SPICLK io, 34 SPIQ io, 35 SPID io, 36 SPICLK_N io, 37 SPICLK_P io, 38 GPIO33 io, 39 GPIO34 io,
      40 GPIO35 io, 41 GPIO36 io, 42 GPIO37 io, 43 GPIO38 io, 44 MTCK io, 45 MTDO io,
      46 VDD3P3_CPU power, 47 MTDI io, 48 MTMS io, 49 U0TXD io, 50 U0RXD io, 51 GPIO45 io, 52 GPIO46 io,
      53 XTAL_N analog, 54 XTAL_P analog, 55 VDDA power, 56 VDDA power, 57 GND ground`),
  },
  // Winbond W25Q128JV datasheet, §3.1 Pin Configuration SOIC 208-mil (W25Q128JVSIQ), 2.7–3.6 V.
  w25q128: {
    mpn: 'W25Q128JVSIQ (Winbond, SOIC-8 208 mil)',
    datasheet: 'W25Q128JV datasheet, §3.1–3.2',
    pins: pinout('1 /CS in, 2 DO(IO1) io, 3 /WP(IO2) io, 4 GND ground, 5 DI(IO0) io, 6 CLK in, 7 /HOLD(IO3) io, 8 VCC power'),
    supply: 3.3,
  },
  // Diodes Inc. AP2112 datasheet, Pin Descriptions, SOT-23-5 (K): EN high to turn on, never floating.
  ap2112k: {
    mpn: 'AP2112K-3.3TRG1 (Diodes Inc., SOT-23-5)',
    datasheet: 'AP2112 datasheet, Pin Descriptions (SOT-23-5)',
    pins: pinout('1 VIN power, 2 GND ground, 3 EN in, 4 NC nc, 5 VOUT supply'),
  },
  // STMicroelectronics USBLC6-2 datasheet, Figure 1 (SOT23-6L): I/O1 on pins 1 and 6, I/O2 on 3 and 4.
  usblc6: {
    mpn: 'USBLC6-2SC6 (STMicroelectronics, SOT-23-6)',
    datasheet: 'USBLC6-2 datasheet, Figure 1 and §3 Application',
    pins: pinout('1 I/O1 io, 2 GND ground, 3 I/O2 io, 4 I/O2 io, 5 VBUS power, 6 I/O1 io'),
    bridges: [['1', '6'], ['3', '4']],
  },
  // Texas Instruments TCA9554 datasheet SCPS233, §5 Pin Configuration (PW, TSSOP-16); the ports are
  // inputs at power-up with an internal 100 kΩ pull-up (§8.3), so an unused port may stay open.
  tca9554: {
    mpn: 'TCA9554PWR (Texas Instruments, TSSOP-16)',
    datasheet: 'TCA9554 datasheet SCPS233, §5 and §8.3',
    pins: pinout(`
      1 A0 in, 2 A1 in, 3 A2 in, 4 P0 io, 5 P1 io, 6 P2 io, 7 P3 io, 8 GND ground,
      9 P4 io, 10 P5 io, 11 P6 io, 12 P7 io, 13 /INT od, 14 SCL in, 15 SDA io, 16 VCC power`),
  },
  // NXP PCA9633 datasheet, Table 2 Pin description (TSSOP8, PCA9633DP1): fixed address 0x62.
  pca9633: {
    mpn: 'PCA9633DP1 (NXP, TSSOP-8)',
    datasheet: 'PCA9633 datasheet, §6 Pinning information, Table 2',
    pins: pinout('1 LED0 od, 2 LED1 od, 3 LED2 od, 4 LED3 od, 5 VSS ground, 6 SCL in, 7 SDA io, 8 VDD power'),
  },
  // NXP PCF8563 datasheet, Table 3 Pin description (SO8, PCF8563T): oscillator capacitors integrated.
  pcf8563: {
    mpn: 'PCF8563T/5 (NXP, SO-8)',
    datasheet: 'PCF8563 datasheet, §7 Pinning information, Table 3',
    pins: pinout('1 OSCI analog, 2 OSCO analog, 3 /INT od, 4 VSS ground, 5 SDA io, 6 SCL in, 7 CLKOUT od, 8 VDD power'),
  },
  // Diodes Inc. APX803 datasheet, Pin Descriptions (SOT23, SA): open-drain active-low reset, 2.93 V (-29).
  apx803: {
    mpn: 'APX803-29SAG-7 (Diodes Inc., SOT-23)',
    datasheet: 'APX803 datasheet, Pin Descriptions (SA package)',
    pins: pinout('1 GND ground, 2 /RESET od, 3 VCC power'),
  },
  // ROHM BH1750FVI datasheet, Pin Descriptions (WSOF6I): ADDR low = 0x23, DVI low for 1 µs at power-up.
  bh1750: {
    mpn: 'BH1750FVI-TR (ROHM, WSOF6I)',
    datasheet: 'BH1750FVI datasheet, Pin Descriptions and Measurement sequence',
    pins: pinout('1 VCC power, 2 ADDR in, 3 GND ground, 4 SDA io, 5 DVI in, 6 SCL in'),
  },
  // NXP LM75B datasheet, Table 3 Pin description (SO8, LM75BD): the address A2..A0 tied, OS open-drain.
  lm75b: {
    mpn: 'LM75BD,118 (NXP, SO-8)',
    datasheet: 'LM75B datasheet, §6 Pinning information, Table 3',
    pins: pinout('1 SDA io, 2 SCL in, 3 OS od, 4 GND ground, 5 A2 in, 6 A1 in, 7 A0 in, 8 VCC power'),
  },
  // ECS ECX-32B crystal, 3.2 x 2.5 mm: the crystal between pads 1 and 3, the lid on 2 and 4 (ground).
  xtal40m: {
    mpn: 'ECS-400-10-37B2-CKM-TR (ECS, 40 MHz, CL 10 pF, ±10 ppm, 3225)',
    datasheet: 'ECX-32B datasheet, Pad connections',
    pins: pinout('1 X1 passive, 2 GND ground, 3 X2 passive, 4 GND ground'),
  },
  // Abracon ABS07 tuning-fork crystal, 32.768 kHz, 3.2 x 1.5 mm, two pads.
  xtal32k: {
    mpn: 'ABS07-32.768KHZ-T (Abracon, 3215)',
    datasheet: 'ABS07 datasheet, Recommended land pattern',
    pins: two('1', '2'),
  },
  // Samtec TSM-106-01-L-SV: a 6-way 2.54 mm surface-mount header, the debug header.
  header6smd: {
    mpn: 'TSM-106-01-L-SV (Samtec, 1 x 6, 2.54 mm, SMT)',
    datasheet: 'Samtec TSM series drawing',
    pins: header(6),
  },
  // Hirose U.FL-R-SMT-1(10): the centre contact and its two ground legs.
  ufl: {
    mpn: 'U.FL-R-SMT-1(10) (Hirose)',
    datasheet: 'Hirose U.FL series, Recommended PCB mounting pattern',
    pins: pinout('1 SIG analog, 2 GND ground, 3 GND ground'),
  },
  // Passives: resistors and capacitors (Yageo RC, Murata GRM), the inductor of the π network (Murata
  // LQP15MN), clamp diode, status LEDs (Kingbright APT1608), test points (Keystone 5019).
  r0402: { mpn: 'RC0402FR-07 (Yageo, 0402)', datasheet: 'Yageo RC series', pins: two('1', '2'), transparent: true },
  r0805: { mpn: 'RC0805FR-07 (Yageo, 0805)', datasheet: 'Yageo RC series', pins: two('1', '2'), transparent: true },
  c0402: { mpn: 'GRM155 (Murata, 0402)', datasheet: 'Murata GRM series', pins: two('1', '2'), transparent: true },
  c0603: { mpn: 'GRM188 (Murata, 0603)', datasheet: 'Murata GRM series', pins: two('1', '2'), transparent: true },
  c0805: { mpn: 'GRM21B (Murata, 0805)', datasheet: 'Murata GRM series', pins: two('1', '2'), transparent: true },
  l0402: { mpn: 'LQP15MN2N7B02 (Murata, 0402, 2.7 nH)', datasheet: 'Murata LQP15MN series', pins: two('1', '2'), transparent: true },
  // Vishay 1N4148W (SOD-123): anode, cathode.
  d1n4148: { mpn: '1N4148W-E3-08 (Vishay, SOD-123)', datasheet: '1N4148W datasheet', pins: pinout('A A passive, K K passive'), transparent: true },
  led0603: { mpn: 'APT1608 (Kingbright, 0603)', datasheet: 'Kingbright APT1608 series', pins: pinout('A A passive, K K passive') },
  led0805: { mpn: 'APT2012SECK (Kingbright, 0805, amber)', datasheet: 'Kingbright APT2012SECK', pins: pinout('A A passive, K K passive') },
  tp: { mpn: '5019 (Keystone, SMT test point)', datasheet: 'Keystone 5019', pins: { 1: ['TP', 'passive'] }, transparent: true },
  // The parts of the front face: the headers J1 and J2 (2.54 mm), the microSD socket J3, the JST PH J4,
  // the USB-C receptacle J5 (USB 2.0, 16 contacts), the switches and the jumper, the display module.
  header6: { mpn: '61300611121 (Würth WR-PHD, 1 x 6, 2.54 mm)', datasheet: 'Würth WR-PHD 2.54 mm', pins: header(6) },
  header4: { mpn: '61300411121 (Würth WR-PHD, 1 x 4, 2.54 mm)', datasheet: 'Würth WR-PHD 2.54 mm', pins: header(4) },
  jumper3: { mpn: '61300311121 + 60900213421 (Würth, 1 x 3 header and its shunt)', datasheet: 'Würth WR-PHD 2.54 mm', pins: header(3) },
  // Molex 104031-0811 microSD push-push socket: the contacts of the card (SD spec pin numbers), the shell.
  microsd: {
    mpn: '104031-0811 (Molex, microSD)',
    datasheet: 'Molex 104031 drawing; SD Physical Layer Spec, microSD pin assignment',
    pins: pinout('1 DAT2 io, 2 CD/DAT3 io, 3 CMD io, 4 VDD power, 5 CLK in, 6 VSS ground, 7 DAT0 io, 8 DAT1 io, S1 SHELL ground, S2 SHELL ground'),
  },
  // JST B3B-PH-K-S: 3 pins, 2 mm.
  jst3: { mpn: 'B3B-PH-K-S (JST PH, 3 pins)', datasheet: 'JST PH connector', pins: header(3) },
  // GCT USB4105-GF-A: USB 2.0 Type-C receptacle; SBU unused in a USB 2.0 sink (USB Type-C spec).
  usbc: {
    mpn: 'USB4105-GF-A (GCT, USB 2.0 Type-C)',
    datasheet: 'GCT USB4105 drawing; USB Type-C spec, USB 2.0 sink',
    pins: pinout(`
      A1 GND ground, A4 VBUS passive, A5 CC1 passive, A6 DP1 passive, A7 DN1 passive, A8 SBU1 nc, A9 VBUS passive, A12 GND ground,
      B1 GND ground, B4 VBUS passive, B5 CC2 passive, B6 DP2 passive, B7 DN2 passive, B8 SBU2 nc, B9 VBUS passive, B12 GND ground,
      S1 SHIELD ground, S2 SHIELD ground, S3 SHIELD ground, S4 SHIELD ground`),
  },
  // Omron B3F-1000 tactile switch: pins 1/2 and 3/4 joined inside, the contact between the pairs.
  tact: { mpn: 'B3F-1000 (Omron)', datasheet: 'Omron B3F, Internal connections', pins: header(4), bridges: [['1', '2'], ['3', '4']] },
  // C&K PCM12SMTR: SPDT slide switch, its common on pin 2.
  slide: { mpn: 'PCM12SMTR (C&K, SPDT)', datasheet: 'C&K PCM12 drawing', pins: pinout('1 1 passive, 2 COM passive, 3 3 passive') },
  // The display: a 240 x 240 TFT module on an ST7789V, its 6-pin header as silkscreened on the front.
  display: {
    mpn: 'TFT module 1.54″ 240 x 240, ST7789V (6-pin SPI header)',
    datasheet: 'Sitronix ST7789V datasheet, 4-line serial interface',
    pins: pinout('1 GND ground, 2 VCC power, 3 SCK in, 4 MOSI in, 5 DC in, 6 CS in'),
  },
} as const satisfies Record<string, Device>;

export type DeviceId = keyof typeof DEVICES;
