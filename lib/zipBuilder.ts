/**
 * zipBuilder.ts — minimal STORED (no compression) ZIP file builder.
 * Pure TypeScript, zero dependencies. Works in the browser.
 *
 * Usage:
 *   const bytes = buildZip([
 *     { name: 'hello.txt', content: 'Hello, world!' },
 *     { name: 'data.json', content: JSON.stringify({}) },
 *   ]);
 *   const blob = new Blob([bytes], { type: 'application/zip' });
 */

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Write helpers ─────────────────────────────────────────────────────────────
function writeU16(view: DataView, offset: number, val: number) { view.setUint16(offset, val, true); }
function writeU32(view: DataView, offset: number, val: number) { view.setUint32(offset, val, true); }

// ── Public API ────────────────────────────────────────────────────────────────
export function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();

  interface Entry {
    nameBytes:   Uint8Array;
    dataBytes:   Uint8Array;
    crc:         number;
    localOffset: number;
  }

  const entries: Entry[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  // ── Local file records ──────────────────────────────────────────────────────
  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes = enc.encode(file.content);
    const crc       = crc32(dataBytes);
    const localOffset = offset;

    // Local file header (30 bytes + name)
    const header = new Uint8Array(30 + nameBytes.length);
    const view   = new DataView(header.buffer);
    writeU32(view,  0, 0x04034B50);   // signature
    writeU16(view,  4, 20);            // version needed
    writeU16(view,  6, 0);             // flags
    writeU16(view,  8, 0);             // compression (stored)
    writeU16(view, 10, 0);             // mod time
    writeU16(view, 12, 0);             // mod date
    writeU32(view, 14, crc);           // CRC-32
    writeU32(view, 18, dataBytes.length); // compressed size
    writeU32(view, 22, dataBytes.length); // uncompressed size
    writeU16(view, 26, nameBytes.length); // filename length
    writeU16(view, 28, 0);             // extra field length
    header.set(nameBytes, 30);

    parts.push(header, dataBytes);
    offset += header.length + dataBytes.length;
    entries.push({ nameBytes, dataBytes, crc, localOffset });
  }

  // ── Central directory ───────────────────────────────────────────────────────
  const cdOffset = offset;
  for (const e of entries) {
    const cd   = new Uint8Array(46 + e.nameBytes.length);
    const view = new DataView(cd.buffer);
    writeU32(view,  0, 0x02014B50);          // signature
    writeU16(view,  4, 20);                   // version made by
    writeU16(view,  6, 20);                   // version needed
    writeU16(view,  8, 0);                    // flags
    writeU16(view, 10, 0);                    // compression
    writeU16(view, 12, 0);                    // mod time
    writeU16(view, 14, 0);                    // mod date
    writeU32(view, 16, e.crc);               // CRC-32
    writeU32(view, 20, e.dataBytes.length);  // compressed size
    writeU32(view, 24, e.dataBytes.length);  // uncompressed size
    writeU16(view, 28, e.nameBytes.length);  // filename length
    writeU16(view, 30, 0);                   // extra field length
    writeU16(view, 32, 0);                   // file comment length
    writeU16(view, 34, 0);                   // disk number start
    writeU16(view, 36, 0);                   // internal attr
    writeU32(view, 38, 0);                   // external attr
    writeU32(view, 42, e.localOffset);       // relative offset of local header
    cd.set(e.nameBytes, 46);
    parts.push(cd);
    offset += cd.length;
  }

  // ── End of central directory ────────────────────────────────────────────────
  const eocd = new Uint8Array(22);
  const ev   = new DataView(eocd.buffer);
  writeU32(ev,  0, 0x06054B50);          // signature
  writeU16(ev,  4, 0);                   // disk number
  writeU16(ev,  6, 0);                   // disk with start of CD
  writeU16(ev,  8, entries.length);      // entries on this disk
  writeU16(ev, 10, entries.length);      // total entries
  writeU32(ev, 12, offset - cdOffset);   // size of CD
  writeU32(ev, 16, cdOffset);            // offset of CD
  writeU16(ev, 20, 0);                   // comment length
  parts.push(eocd);

  // ── Concatenate all parts ───────────────────────────────────────────────────
  const total  = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

// ── CSV helper ────────────────────────────────────────────────────────────────
export function jsonToCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\r\n');
}
