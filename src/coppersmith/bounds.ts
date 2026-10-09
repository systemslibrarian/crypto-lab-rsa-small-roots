import { integerRoot } from '../math/integer';
export type Scenario='message'|'factor';
export function finiteBound(N:bigint,r:number,m:number,t:number,scenario:Scenario,X:bigint) {
  const n=r*m+t,Q=n*(n-1),C=BigInt(n)**BigInt(n)*2n**BigInt(n*(n-1)/2);
  const E=(scenario==='message'?2:1)*m*n-r*m*(m+1);
  const right=E>0?N**BigInt(E):0n,left=C*X**BigInt(Q);
  const sufficient=E>0?integerRoot((right-1n)/C,Q):0n;
  const bits=sufficient>0n?sufficient.toString(2).length-1:null;
  if(sufficient>0n && !(C*sufficient**BigInt(Q)<right && C*(sufficient+1n)**BigInt(Q)>=right)) throw Error('Finite bound maximality failed');
  return {n,Q,C,E,left,right,sufficient,bits,satisfied:E>0 && left<right};
}
export function certificate(v:bigint[],N:bigint,m:number,scenario:Scenario) {
  const S=v.reduce((s,x)=>s+x*x,0n),left=BigInt(v.length)*S,right=N**BigInt(scenario==='message'?2*m:m);
  return {S,left,right,satisfied:left<right};
}
