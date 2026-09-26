// Checksum engine: XXH64 (pure-JS BigInt) + MD5/SHA-1/SHA-256 (native crypto).
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const ALGORITHMS = {
  xxh64: { label: 'xxHash64', mhlTag: 'xxhash64', reportName: 'xxh64', fast: true },
  md5: { label: 'MD5', mhlTag: 'md5', reportName: 'md5', fast: false },
  sha1: { label: 'SHA-1', mhlTag: 'sha1', reportName: 'sha1', fast: false },
  sha256: { label: 'SHA-256', mhlTag: 'sha256', reportName: 'sha256', fast: false }
};

const MASK = 0xffffffffffffffffn;
const P1 = 0x9e3779b185ebca87n;
const P2 = 0xc2b2ae3d27d4eb4fn;
const P3 = 0x165667b19e3779f9n;
const P4 = 0x85ebca77c2b2ae63n;
const P5 = 0x27d4eb2f165667c5n;

function rotl64(x, r) {
  r = BigInt(r);
  return ((x << r) | (x >> (64n - r))) & MASK;
}

function round64(acc, lane) {
  acc = (acc + ((lane * P2) & MASK)) & MASK;
  acc = rotl64(acc, 31);
  return (acc * P1) & MASK;
}

function mergeRound64(acc, val) {
  val = round64(0n, val);
  acc = acc ^ val;
  return (((acc * P1) & MASK) + P4) & MASK;
}

export class XXH64 {
  constructor(seed = 0n) {
    this.seed = BigInt(seed);
    this.reset();
  }

  reset() {
    this.v1 = (this.seed + P1 + P2) & MASK;
    this.v2 = (this.seed + P2) & MASK;
    this.v3 = BigInt(this.seed);
    this.v4 = (this.seed - P1) & MASK;
    this.buf = Buffer.alloc(0);
    this.total = 0;
  }

  update(input) {
    this.total += input.length;
    let data = this.buf.length ? Buffer.concat([this.buf, input]) : input;
    const limit = data.length - (data.length % 32);
    if (limit >= 32) {
      for (let off = 0; off < limit; off += 32) {
        this.v1 = round64(this.v1, data.readBigUInt64LE(off));
        this.v2 = round64(this.v2, data.readBigUInt64LE(off + 8));
        this.v3 = round64(this.v3, data.readBigUInt64LE(off + 16));
        this.v4 = round64(this.v4, data.readBigUInt64LE(off + 24));
      }
    }
    this.buf = limit < data.length ? Buffer.from(data.subarray(limit)) : Buffer.alloc(0);
  }

  digest() {
    const len = BigInt(this.total);
    let h;
    if (this.total >= 32) {
      h =
        (rotl64(this.v1, 1) + rotl64(this.v2, 7) + rotl64(this.v3, 12) + rotl64(this.v4, 18)) & MASK;
      h = mergeRound64(h, this.v1);
      h = mergeRound64(h, this.v2);
      h = mergeRound64(h, this.v3);
      h = mergeRound64(h, this.v4);
    } else {
      h = (this.seed + P5) & MASK;
    }
    h = (h + len) & MASK;

    const b = this.buf;
    let off = 0;
    while (off + 8 <= b.length) {
      const k = round64(0n, b.readBigUInt64LE(off));
      h = (h ^ k) & MASK;
      h = (((rotl64(h, 27) * P1) & MASK) + P4) & MASK;
      off += 8;
    }
    if (off + 4 <= b.length) {
      h = (h ^ (BigInt(b.readUInt32LE(off)) * P1)) & MASK;
      h = (((rotl64(h, 23) * P2) & MASK) + P3) & MASK;
      off += 4;
    }
    while (off < b.length) {
      h = (h ^ (BigInt(b[off]) * P5)) & MASK;
      h = (rotl64(h, 11) * P1) & MASK;
      off++;
    }

    h ^= h >> 33n;
    h = (h * P2) & MASK;
    h ^= h >> 29n;
    h = (h * P3) & MASK;
    h ^= h >> 32n;
    return h.toString(16).padStart(16, '0');
  }
}

// Unified streaming hasher: { update(Buffer), digest() -> hex }
export function createHasher(algorithm) {
  if (algorithm === 'xxh64') {
    const x = new XXH64(0n);
    return {
      update: (buf) => x.update(buf),
      digest: () => x.digest()
    };
  }
  if (!ALGORITHMS[algorithm]) throw new Error(`Unsupported algorithm: ${algorithm}`);
  const h = crypto.createHash(algorithm);
  return {
    update: (buf) => h.update(buf),
    digest: () => h.digest('hex')
  };
}

export async function hashFile(filePath, algorithm) {
  const hasher = createHasher(algorithm);
  const buf = await readFile(filePath);
  hasher.update(buf);
  return hasher.digest();
}
