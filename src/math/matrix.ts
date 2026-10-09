import { Q, zero } from './rational';
export type Matrix=bigint[][];
export const identity=(n:number):Matrix=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1n:0n));
export function determinant(input: Matrix): bigint {
  const a=input.map(r=>r.slice()),n=a.length;let prev=1n,sign=1n;
  for(let k=0;k<n-1;k++) {
    const p=a.findIndex((r,i)=>i>=k && r[k]!==0n);if(p<0) return 0n;
    if(p!==k) {[a[p],a[k]]=[a[k],a[p]];sign=-sign;}
    const pivot=a[k][k];for(let i=k+1;i<n;i++) {for(let j=k+1;j<n;j++) {
      const v=a[i][j]*pivot-a[i][k]*a[k][j];if(v%prev) throw Error('Bareiss division was not exact');a[i][j]=v/prev;
    } a[i][k]=0n;} prev=pivot;
  } return sign*a[n-1][n-1];
}
export function gramSchmidt(b: Matrix) {
  const n=b.length,star:Q[][]=[],mu:Q[][]=[],norms:Q[]=[];
  for(let i=0;i<n;i++) {
    const v=b[i].map(x=>new Q(x));mu[i]=Array<Q>(n).fill(zero);
    for(let j=0;j<i;j++) {
      mu[i][j]=b[i].reduce((s,x,k)=>s.add(new Q(x).mul(star[j][k])),zero).div(norms[j]);
      for(let k=0;k<n;k++) v[k]=v[k].sub(mu[i][j].mul(star[j][k]));
    }
    star.push(v);const norm=v.reduce((s,x)=>s.add(x.mul(x)),zero);
    if(norm.a<=0n) throw Error('Rank-deficient basis');norms.push(norm);
  } return {mu,norms};
}
export function fractionFreeGSO(b:Matrix) {
  const n=b.length,d:bigint[]=[],lambda:Matrix=Array.from({length:n},()=>Array<bigint>(n).fill(0n));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++) {
    let value=b[i].reduce((s,v,k)=>s+v*b[j][k],0n);
    for(let k=0;k<j;k++)value=exactDivide(d[k]*value-lambda[i][k]*lambda[j][k],k===0?1n:d[k-1]);
    if(i===j){if(value<=0n)throw Error('Rank-deficient basis');d[i]=value;}else lambda[i][j]=value;
  }
  return {d,lambda};
}
export function exactDivide(a:bigint,b:bigint):bigint {
  if(!b || a%b)throw Error('Fraction-free GSO division was not exact');return a/b;
}
