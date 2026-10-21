import { bitLength, Budget, integerRoot, LimitError, mod, powMod } from '../math/integer';
import { convergents } from './cf';

export interface WienerChallenge {
  scenario: 'wiener';
  N: bigint;
  e: bigint;
}

export interface WienerRow {
  i: number;
  a: bigint;
  k: bigint;
  d: bigint;
  divides: boolean;
  phi?: bigint;
  s?: bigint;
  delta?: bigint;
  square: boolean;
  parity: boolean;
  p?: bigint;
  q?: bigint;
  product: boolean;
  reason: string;
}

export interface WienerChecks {
  product: boolean;
  inverse: boolean;
  roundTrip: boolean;
  message: bigint;
  ciphertext: bigint;
  decrypted: bigint;
  valid: boolean;
}

export interface WienerResult {
  version: 1;
  scenario: 'wiener';
  challenge: WienerChallenge;
  status: 'verified-recovery' | 'no-verified-root-found' | 'resource-limit';
  rows: WienerRow[];
  recovered: { d: bigint; p: bigint; q: bigint; checks: WienerChecks } | null;
  testedCount: number;
  lemmaBound: number;
  searchComplete: boolean;
  runtimeMs: number;
}

export function wienerBoundary(N: bigint): bigint {
  if (N <= 81n) return 0n;
  let D = integerRoot((N - 1n) / 81n, 4);
  while (81n * D ** 4n >= N) D -= 1n;
  while (81n * (D + 1n) ** 4n < N) D += 1n;
  return D;
}

export function withinWienerGuarantee(N: bigint, d: bigint): boolean {
  return 81n * d ** 4n < N;
}

export function verifyWiener(c: WienerChallenge, d: bigint, p: bigint, q: bigint, message = c.N > 44n ? 42n : 2n): WienerChecks {
  const product = p * q === c.N;
  const phi = (p - 1n) * (q - 1n);
  const inverse = p > 1n && q > 1n && mod(c.e * d, phi) === 1n;
  if (message < 2n || message > c.N - 2n) throw Error('Round-trip message must lie in [2, N − 2]');
  const sample = message;
  const ciphertext = powMod(sample, c.e, c.N);
  const decrypted = powMod(ciphertext, d, c.N);
  const roundTrip = decrypted === sample;
  return { product, inverse, roundTrip, message: sample, ciphertext, decrypted, valid: product && inverse && roundTrip };
}

function randomMessage(N: bigint): bigint {
  const bytes = new Uint8Array(Math.ceil(bitLength(N - 4n) / 8));
  let value: bigint;
  do {
    crypto.getRandomValues(bytes);
    value = bytes.reduce((n, byte) => (n << 8n) | BigInt(byte), 0n);
  } while (value >= N - 3n);
  return value + 2n;
}

function testConvergent(c: WienerChallenge, row: { i: number; a: bigint; k: bigint; d: bigint }): WienerRow {
  const base: WienerRow = { ...row, divides: false, square: false, parity: false, product: false, reason: '' };
  if (row.k === 0n) return { ...base, reason: 'k = 0, not a candidate' };
  const numerator = c.e * row.d - 1n;
  if (numerator % row.k !== 0n) return { ...base, reason: '(e·d − 1) is not divisible by k' };
  const phi = numerator / row.k;
  const s = c.N - phi + 1n;
  const delta = s * s - 4n * c.N;
  if (delta < 0n) return { ...base, divides: true, phi, s, delta, reason: 'Δ is negative' };
  const root = integerRoot(delta, 2);
  const square = root * root === delta;
  if (!square) return { ...base, divides: true, phi, s, delta, reason: 'Δ is not a perfect square' };
  const parity = (s + root) % 2n === 0n && (s - root) % 2n === 0n;
  if (!parity) return { ...base, divides: true, phi, s, delta, square, reason: 's ± √Δ is not even' };
  const p = (s + root) / 2n;
  const q = (s - root) / 2n;
  const product = p > 1n && q > 1n && p * q === c.N;
  return { ...base, divides: true, phi, s, delta, square, parity, p, q, product, reason: product ? 'factors N' : 'candidate does not divide N' };
}

export function wienerAttack(
  challenge: WienerChallenge,
  budget = new Budget(),
  progress: (row: WienerRow) => void = () => {},
): WienerResult {
  if (challenge.scenario !== 'wiener' || challenge.N < 15n || challenge.e < 3n || challenge.e >= challenge.N || bitLength(challenge.N) > 1024) {
    throw Error('Expected a public Wiener challenge with 15 ≤ N, 3 ≤ e < N, and modulus ≤1024 bits');
  }
  const c = { scenario: 'wiener' as const, N: challenge.N, e: challenge.e };
  const started = performance.now();
  const rows: WienerRow[] = [];
  const lemmaBound = 2 * bitLength(c.N);
  try {
    for (const approximation of convergents(c.e, c.N)) {
      budget.check('continued-fraction convergent', [approximation.k, approximation.d]);
      const row = testConvergent(c, approximation);
      rows.push(row);
      progress(row);
      if (row.product && row.p !== undefined && row.q !== undefined) {
        const checks = verifyWiener(c, row.d, row.p, row.q, randomMessage(c.N));
        if (checks.valid) {
          return { version: 1, scenario: 'wiener', challenge: c, status: 'verified-recovery', rows, recovered: { d: row.d, p: row.p, q: row.q, checks }, testedCount: rows.length, lemmaBound, searchComplete: true, runtimeMs: performance.now() - started };
        }
      }
      if (rows.length > lemmaBound) throw Error('Continued-fraction ladder exceeded Lemma 16.6 bound');
    }
  } catch (error) {
    if (error instanceof LimitError) {
      return { version: 1, scenario: 'wiener', challenge: c, status: 'resource-limit', rows, recovered: null, testedCount: rows.length, lemmaBound, searchComplete: false, runtimeMs: performance.now() - started };
    }
    throw error;
  }
  return { version: 1, scenario: 'wiener', challenge: c, status: 'no-verified-root-found', rows, recovered: null, testedCount: rows.length, lemmaBound, searchComplete: true, runtimeMs: performance.now() - started };
}

// [extension] point: Boneh–Durfee would reuse the existing lattice machinery,
// but is deliberately not implemented by this continued-fraction scenario.
