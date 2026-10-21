import { bitLength, integerRoot, powMod } from '../math/integer';
import { type WienerChallenge, type WienerResult, type WienerRow, wienerBoundary } from './attack';

export interface WienerReveal {
  d: bigint; p: bigint; q: bigint; dBits: number; boundary: bigint;
  insideGuarantee: boolean; belowBonehDurfee: boolean;
  verification: { message: bigint; ciphertext: bigint; decrypted: bigint; roundTrip: boolean };
}

// Independent Euclidean recurrence and row arithmetic: do not import the attack's
// convergent generator or candidate tester at the worker-to-page trust boundary.
export function validateWienerResult(c: WienerChallenge, r: WienerResult): boolean {
  try {
    if (r.version !== 1 || r.scenario !== 'wiener' || r.challenge.N !== c.N || r.challenge.e !== c.e || r.challenge.scenario !== c.scenario ||
        r.lemmaBound !== 2 * bitLength(c.N) || r.testedCount !== r.rows.length || r.rows.length > r.lemmaBound || !Number.isFinite(r.runtimeMs) || r.runtimeMs < 0) return false;
    let n = c.e, denominator = c.N, k0 = 0n, k1 = 1n, d0 = 1n, d1 = 0n;
    let winning: WienerRow | undefined;
    for (const [i, row] of r.rows.entries()) {
      if (!denominator || winning) return false;
      const a = n / denominator, k = a * k1 + k0, d = a * d1 + d0;
      [n, denominator] = [denominator, n % denominator]; [k0, k1] = [k1, k]; [d0, d1] = [d1, d];
      const divides = k !== 0n && (c.e * d - 1n) % k === 0n;
      const phi = divides ? (c.e * d - 1n) / k : undefined;
      const s = phi === undefined ? undefined : c.N - phi + 1n;
      const delta = s === undefined ? undefined : s * s - 4n * c.N;
      const root = delta !== undefined && delta >= 0n ? integerRoot(delta, 2) : undefined;
      const square = root !== undefined && root * root === delta;
      const parity = square && (s! + root!) % 2n === 0n && (s! - root!) % 2n === 0n;
      const p = parity ? (s! + root!) / 2n : undefined, q = parity ? (s! - root!) / 2n : undefined;
      const product = p !== undefined && q !== undefined && p > 1n && q > 1n && p * q === c.N;
      if (row.i !== i || row.a !== a || row.k !== k || row.d !== d || row.divides !== divides || row.phi !== phi || row.s !== s || row.delta !== delta || row.square !== square || row.parity !== parity || row.p !== p || row.q !== q || row.product !== product) return false;
      if (product) winning = row;
    }
    if (winning) {
      const recovered = r.recovered, checks = recovered?.checks;
      if (!recovered || !checks || r.status !== 'verified-recovery' || r.searchComplete !== true || recovered.d !== winning.d || recovered.p !== winning.p || recovered.q !== winning.q) return false;
      const phi = (recovered.p - 1n) * (recovered.q - 1n);
      return checks.message >= 2n && checks.message <= c.N - 2n &&
        powMod(checks.message, c.e, c.N) === checks.ciphertext && powMod(checks.ciphertext, recovered.d, c.N) === checks.decrypted && checks.decrypted === checks.message &&
        c.e * recovered.d % phi === 1n && checks.product === true && checks.inverse === true && checks.roundTrip === true && checks.valid === true;
    }
    return r.recovered === null && (r.status === 'resource-limit' ? r.searchComplete === false : r.status === 'no-verified-root-found' && r.searchComplete === true && denominator === 0n);
  } catch { return false; }
}

export function validateWienerReveal(c: WienerChallenge, r: WienerResult, reveal: WienerReveal): boolean {
  try {
    const { d, p, q, verification: v } = reveal, phi = (p - 1n) * (q - 1n);
    const inside = 81n * d ** 4n < c.N;
    return r.searchComplete && d > 0n && p > 1n && q > 1n && p !== q && bitLength(p) === bitLength(q) && p * q === c.N && c.e * d % phi === 1n &&
      reveal.dBits === bitLength(d) && reveal.boundary === wienerBoundary(c.N) && reveal.insideGuarantee === inside && reveal.belowBonehDurfee === (d ** 250n < c.N ** 73n) &&
      v.message >= 2n && v.message <= c.N - 2n && powMod(v.message, c.e, c.N) === v.ciphertext && powMod(v.ciphertext, d, c.N) === v.decrypted && v.decrypted === v.message && v.roundTrip === true &&
      (r.recovered ? r.recovered.d === d : !inside);
  } catch { return false; }
}
