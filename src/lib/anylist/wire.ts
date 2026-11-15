/**
 * Minimal protobuf wire-format codec for the handful of AnyList messages we use.
 * (protobufjs relies on runtime code generation, which is unreliable on Hermes, and we only
 * need a few fields.) Field numbers come from AnyList's pcov.proto as published in the
 * open-source `anylist` Node library.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- encoding ----------

export type PbValue = string | boolean | number | Uint8Array | PbMessage | undefined | null;
/** Ordered list of [fieldNumber, value]. Nested messages are themselves PbMessage arrays. */
export type PbMessage = [number, PbValue][];

function varint(n: number, out: number[]) {
  let v = Math.max(0, Math.floor(n));
  while (v > 0x7f) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function encodeMessage(msg: PbMessage): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  for (const [field, value] of msg) {
    if (value === undefined || value === null) continue;
    const head: number[] = [];
    if (typeof value === 'boolean' || typeof value === 'number') {
      varint((field << 3) | 0, head);
      varint(typeof value === 'boolean' ? (value ? 1 : 0) : value, head);
      chunks.push(Uint8Array.from(head));
      continue;
    }
    const bytes = typeof value === 'string' ? enc.encode(value) : value instanceof Uint8Array ? value : encodeMessage(value);
    varint((field << 3) | 2, head);
    varint(bytes.length, head);
    chunks.push(Uint8Array.from(head), bytes);
  }
  return concat(chunks);
}

// ---------- decoding ----------

export type PbField = { field: number; wire: number; varint?: number; bytes?: Uint8Array };

export function decodeFields(buf: Uint8Array): PbField[] {
  const out: PbField[] = [];
  let i = 0;
  const readVarint = (): number => {
    let result = 0;
    let mul = 1;
    for (;;) {
      if (i >= buf.length) throw new Error('Truncated protobuf varint');
      const b = buf[i++];
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
  };
  while (i < buf.length) {
    const key = readVarint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) out.push({ field, wire, varint: readVarint() });
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else if (wire === 2) {
      const len = readVarint();
      if (i + len > buf.length) throw new Error('Truncated protobuf field');
      out.push({ field, wire, bytes: buf.subarray(i, i + len) });
      i += len;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
  return out;
}

export const pb = {
  string(fields: PbField[], n: number): string | null {
    const f = fields.find((x) => x.field === n && x.bytes);
    return f?.bytes ? dec.decode(f.bytes) : null;
  },
  bool(fields: PbField[], n: number): boolean {
    return fields.find((x) => x.field === n && x.varint !== undefined)?.varint === 1;
  },
  message(fields: PbField[], n: number): PbField[] | null {
    const f = fields.find((x) => x.field === n && x.bytes);
    return f?.bytes ? decodeFields(f.bytes) : null;
  },
  messages(fields: PbField[], n: number): PbField[][] {
    return fields.filter((x) => x.field === n && x.bytes).map((x) => decodeFields(x.bytes!));
  },
  strings(fields: PbField[], n: number): string[] {
    return fields.filter((x) => x.field === n && x.bytes).map((x) => dec.decode(x.bytes!));
  },
};

// ---------- multipart/form-data (what AnyList's endpoints expect) ----------

export function multipartBody(
  parts: { name: string; value: string | Uint8Array }[],
  boundary: string,
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    const binary = p.value instanceof Uint8Array;
    const header =
      `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n` +
      (binary ? 'Content-Type: application/octet-stream\r\n' : '') +
      '\r\n';
    chunks.push(enc.encode(header), binary ? (p.value as Uint8Array) : enc.encode(p.value as string), enc.encode('\r\n'));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  return concat(chunks);
}
