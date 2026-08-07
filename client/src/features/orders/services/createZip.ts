const table = (() => {
  const values = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; values[n] = c >>> 0 }
  return values
})()
const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
const u16 = (value: number) => [value & 255, value >>> 8 & 255]
const u32 = (value: number) => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]

export async function createZip(files: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder(); const parts: BlobPart[] = []; const central: BlobPart[] = []; let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name); const bytes = new Uint8Array(await file.blob.arrayBuffer()); const crc = crc32(bytes)
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0), ...name])
    parts.push(local, bytes)
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]))
    offset += local.length + bytes.length
  }
  const centralSize = central.reduce((size, part) => size + (part as Uint8Array).length, 0)
  parts.push(...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]))
  return new Blob(parts, { type: 'application/zip' })
}
