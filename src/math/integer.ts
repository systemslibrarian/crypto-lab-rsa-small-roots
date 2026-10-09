export const abs = (x: bigint) => x < 0n ? -x : x;
export function gcd(a: bigint, b: bigint): bigint { a = abs(a); b = abs(b); while (b) [a,b] = [b,a%b]; return a; }
export const mod = (a: bigint, n: bigint) => ((a % n) + n) % n;
export function powMod(a: bigint, e: bigint, n: bigint): bigint {
  if (n < 1n || e < 0n) throw Error('Invalid modular power');
  let y = 1n; a = mod(a,n); while (e) { if (e & 1n) y = y*a%n; a = a*a%n; e >>= 1n; } return y%n;
}
export function inverse(a: bigint, n: bigint): bigint {
  let [r,s,t,u] = [n,mod(a,n),0n,1n];
  while(s) { const q=r/s; [r,s,t,u]=[s,r-q*s,u,t-q*u]; }
  if(r!==1n) throw Error('No inverse'); return mod(t,n);
}
export const bitLength = (x: bigint) => abs(x).toString(2).length;
export function integerRoot(a: bigint, degree: number): bigint {
  if (a < 0n || !Number.isInteger(degree) || degree < 1) throw Error('Invalid integer root');
  if(a < 2n) return a;
  let lo=0n, hi=1n << BigInt(Math.ceil(bitLength(a)/degree));
  while(lo < hi) { const mid=(lo+hi+1n)/2n; if(mid**BigInt(degree)<=a) lo=mid; else hi=mid-1n; } return lo;
}
export class LimitError extends Error { constructor(public stage: string, message: string) { super(message); } }
export class Budget {
  started=performance.now(); steps=0;
  constructor(public ms=15000, public maxSteps=100000, public maxBits=65536) {}
  check(stage: string, values: bigint[]=[]): void {
    if(++this.steps>this.maxSteps || performance.now()-this.started>this.ms) throw new LimitError(stage, 'Time / operation budget exceeded');
    if(values.some(v=>bitLength(v)>this.maxBits)) throw new LimitError(stage,'Arithmetic bit-length budget exceeded');
  }
}
