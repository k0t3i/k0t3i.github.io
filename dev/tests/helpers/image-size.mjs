/** Reads type and dimensions from a PNG, JPEG or ICO buffer (no dependency). */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('latin1', 12, 16) === 'IHDR') {
    const colorType = buf[25];
    let alpha = colorType === 6 || colorType === 4;
    if (colorType === 3) {
      for (let p = 8; p + 8 <= buf.length; ) {
        const len = buf.readUInt32BE(p);
        const name = buf.toString('latin1', p + 4, p + 8);
        if (name === 'tRNS') { alpha = true; break; }
        if (name === 'IDAT') break;
        p += 12 + len;
      }
    }
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) { p++; continue; }
      const m = buf[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
      // SOF0-SOF15 except DHT (C4), JPG (C8), DAC (CC): baseline, extended, progressive...
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { type: 'jpeg', height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7) };
      }
      p += 2 + buf.readUInt16BE(p + 2);
    }
    throw new Error('JPEG: no SOF marker');
  }
  if (buf.length > 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const count = buf.readUInt16LE(4);
    return { type: 'ico', width: buf[6] || 256, height: buf[7] || 256, count };
  }
  throw new Error('Unsupported image format');
}
