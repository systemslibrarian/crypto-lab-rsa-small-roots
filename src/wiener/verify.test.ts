import { expect, it } from 'vitest';
import { verifyWiener, wienerAttack, wienerBoundary } from './attack';
import { validateWienerResult, validateWienerReveal } from './verify';
const c = { scenario: 'wiener' as const, N: 145157n, e: 115517n };
const result = () => wienerAttack(c);
const reveal = () => ({ d: 5n, p: 383n, q: 379n, dBits: 3, boundary: wienerBoundary(c.N), insideGuarantee: true, belowBonehDurfee: true, verification: verifyWiener(c, 5n, 383n, 379n, 42n) });
it('public round-trip verification preserves the exact supplied message', () => {
  const checks = verifyWiener(c, 5n, 383n, 379n, 42n);
  expect(checks.message).toBe(42n); expect(checks.valid).toBe(true);
});
it('independent verifier accepts the exact ladder and reveal', () => {
  expect(validateWienerResult(c, result())).toBe(true); expect(validateWienerReveal(c, result(), reveal())).toBe(true);
});
it('independent verifier rejects truncated ladders and forged counts', () => {
  const r = result(); r.rows = []; r.testedCount = 0; expect(validateWienerResult(c, r)).toBe(false);
  const altered = result(); altered.testedCount++; expect(validateWienerResult(c, altered)).toBe(false);
});
it('independent verifier rejects a partial negative ladder and a changed public key', () => {
  const negative = wienerAttack({scenario:'wiener',N:19n,e:11n}); negative.rows.pop(); negative.testedCount--;
  expect(validateWienerResult(negative.challenge, negative)).toBe(false);
  const r = result(); r.challenge = {...c,e:17995n}; expect(validateWienerResult(c,r)).toBe(false);
});
it('independent verifier rejects false discriminants and fabricated encryption checks', () => {
  const r = result(); r.rows.at(-1)!.delta!++; expect(validateWienerResult(c,r)).toBe(false);
  const altered = result(); altered.recovered!.checks.ciphertext++; expect(validateWienerResult(c,altered)).toBe(false);
});
it('reveal verification rejects false theorem, bit length, and stronger-attack labels', () => {
  for (const patch of [{insideGuarantee:false},{dBits:4},{belowBonehDurfee:false}]) expect(validateWienerReveal(c,result(),{...reveal(),...patch})).toBe(false);
});
it('reveal verification checks forward encryption and rejects trivial or malformed samples', () => {
  const r = reveal(); r.verification.ciphertext++; expect(validateWienerReveal(c,result(),r)).toBe(false);
  r.verification = {...r.verification,message:1n,ciphertext:1n,decrypted:1n}; expect(validateWienerReveal(c,result(),r)).toBe(false);
  expect(validateWienerReveal(c,result(),{...reveal(),p:1n,q:1n})).toBe(false);
});
