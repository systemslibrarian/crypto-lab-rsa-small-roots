import { gcd, abs } from './integer';
import { Q, zero } from './rational';
export function trim<T extends bigint | Q>(p: T[]): T[] {
  p=p.slice();while(p.length>1 && (typeof p.at(-1)==='bigint'?p.at(-1)===0n:(p.at(-1) as Q).a===0n)) p.pop();return p;
}
export function multiply(a: bigint[],b: bigint[]): bigint[] {
  const c=Array<bigint>(a.length+b.length-1).fill(0n);a.forEach((v,i)=>b.forEach((w,j)=>c[i+j]+=v*w));return trim(c);
}
export function evaluate(p: bigint[], x: bigint): bigint {return p.reduceRight((v,c)=>v*x+c,0n);}
export function derivative(p: bigint[]): bigint[] {return p.length===1?[0n]:p.slice(1).map((v,i)=>v*BigInt(i+1));}
export function primitive(p: bigint[], positive=false): bigint[] {
  p=trim(p);const g=p.reduce((d,v)=>gcd(d,v),0n);if(!g) return [0n];
  const sign=positive && p.at(-1)!<0n?-1n:1n;return p.map(v=>sign*v/g);
}
export function quotientRemainder(a: bigint[], b: bigint[]): {q: Q[];r: bigint[]} {
  if(b.every(v=>v===0n)) throw Error('Zero polynomial divisor');
  let r=a.map(v=>new Q(v));const q=Array<Q>(Math.max(1,a.length-b.length+1)).fill(zero);
  while(r.length>=b.length && r.some(v=>v.a!==0n)) {
    const offset=r.length-b.length, c=r.at(-1)!.div(new Q(b.at(-1)!));q[offset]=c;
    b.forEach((v,i)=>r[i+offset]=r[i+offset].sub(c.mul(new Q(v))));r=trim(r);
  }
  return {q:trim(q),r:integerize(r)};
}
export function integerize(p: Q[]): bigint[] {
  const lcm=p.reduce((a,q)=>a/gcd(a,q.b)*q.b,1n);return primitive(p.map(q=>q.a*(lcm/q.b)));
}
export function polynomialGcd(a: bigint[],b: bigint[]): bigint[] {
  while(b.some(v=>v!==0n)) {const r=quotientRemainder(a,b).r;a=b;b=r;} return primitive(a,true);
}
export function squareFree(p: bigint[]): bigint[] {
  p=primitive(p,true);const g=polynomialGcd(p,derivative(p));return integerize(quotientRemainder(p,g).q);
}
export function signAtHalf(p: bigint[], numerator: bigint): number {
  // Evaluate at numerator/2, multiplied by positive 2^degree.
  let y=p.at(-1)!;let scale=2n;for(let i=p.length-2;i>=0;i--) {y=y*numerator+p[i]*scale;scale*=2n;}
  return y>0n?1:y<0n?-1:0;
}
export const coefficientBits=(p: bigint[])=>Math.max(...p.map(v=>abs(v).toString(2).length));
