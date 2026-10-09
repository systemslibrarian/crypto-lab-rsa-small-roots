import { multiply } from '../math/polynomial';
import type { Matrix } from '../math/matrix';
export function buildBasis(f: bigint[], N: bigint, X: bigint, m:number,t:number) {
  const r=f.length-1,n=r*m+t;
  if(r<1 || f[r]!==1n || N<2n || X<1n || !Number.isInteger(m) || !Number.isInteger(t) || m<1 || t<1 || n>12) throw Error('Invalid lattice parameters');
  const powers:bigint[][]=[[1n]], B:Matrix=[],labels:string[]=[];
  for(let i=1;i<=m;i++) powers.push(multiply(powers[i-1],f));
  for(let i=0;i<=m;i++) for(let j=0;j<(i===m?t:r);j++) {
    const factor=N**BigInt(m-i);const row=Array<bigint>(n).fill(0n);
    powers[i].forEach((a,l)=>row[l+j]=a*factor*X**BigInt(l+j));B.push(row);
    labels.push(i===m?`x^${j} f^${m}`:`N^${m-i} x^${j} f^${i}`);
  }
  const D=N**BigInt(r*m*(m+1)/2)*X**BigInt(n*(n-1)/2);
  return {B,D,labels,n,r,m,t,X};
}
export function unscale(v:bigint[],X:bigint): bigint[] {
  return v.map((a,l)=>{const scale=X**BigInt(l);if(a%scale) throw Error('Scaled-column integrity failure');return a/scale;});
}
