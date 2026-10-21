export interface Convergent {
  i: number;
  a: bigint;
  k: bigint;
  d: bigint;
}

export function partialQuotients(numerator: bigint, denominator: bigint): bigint[] {
  if (numerator < 0n || denominator <= 0n) throw Error('Continued fractions require a non-negative numerator and a positive denominator');
  const values: bigint[] = [];
  let x = numerator;
  let y = denominator;
  while (y !== 0n) {
    const a = x / y;
    values.push(a);
    [x, y] = [y, x % y];
  }
  return values;
}

export function* convergents(numerator: bigint, denominator: bigint): Generator<Convergent> {
  let previousNumerator = 0n;
  let numeratorNow = 1n;
  let previousDenominator = 1n;
  let denominatorNow = 0n;
  for (const [i, a] of partialQuotients(numerator, denominator).entries()) {
    const k = a * numeratorNow + previousNumerator;
    const d = a * denominatorNow + previousDenominator;
    yield { i, a, k, d };
    [previousNumerator, numeratorNow] = [numeratorNow, k];
    [previousDenominator, denominatorNow] = [denominatorNow, d];
  }
}
