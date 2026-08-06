// Minimal STORE-only ZIP writer (no compression). PNGs are already compressed,
// so storing them uncompressed keeps this dependency-free and tiny.

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return (~c) >>> 0
}

export function createZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const lh = new Uint8Array(30 + name.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)  // local file header sig
    lv.setUint16(4, 20, true)          // version needed
    lv.setUint16(6, 0, true)           // flags
    lv.setUint16(8, 0, true)           // method = store
    lv.setUint16(10, 0, true)          // mod time
    lv.setUint16(12, 0, true)          // mod date
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)       // compressed size
    lv.setUint32(22, size, true)       // uncompressed size
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)          // extra len
    lh.set(name, 30)
    parts.push(lh, f.data)

    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)  // central dir header sig
    cv.setUint16(4, 20, true)          // version made by
    cv.setUint16(6, 20, true)          // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)     // offset of local header
    ch.set(name, 46)
    central.push(ch)

    offset += lh.length + size
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)    // end of central dir sig
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)       // central dir offset
  ev.setUint16(20, 0, true)

  return new Blob([...parts, ...central, eocd], {type: 'application/zip'})
}
