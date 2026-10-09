import { Budget } from '../math/integer';
import { identity, fractionFreeGSO,exactDivide,type Matrix } from '../math/matrix';
import { abs } from '../math/integer';
export interface Trace {type:'reduce'|'swap'|'keep';k:number;j:number;multiplier?:bigint;lhs?:string;rhs?:string;}
export function reduceLLL(input: Matrix, budget=new Budget()) {
  const n=input.length;
  if(n<2 || n>12 || input.some(r=>r.length!==n || r.some(v=>typeof v!=='bigint'))) throw Error('Expected a square integer basis, dimension 2–12');
  const B=input.map(r=>r.slice()),U=identity(n),{d,lambda}=fractionFreeGSO(B);
  const trace:Trace[]=[];let swaps=0,reductions=0,events=0,k=1,traceBytes=0,traceStopped=false;
  const record=(e:Trace)=>{
    events++;const bytes=(e.lhs?.length??0)+(e.rhs?.length??0)+(e.multiplier?.toString().length??0)+100;
    // ASCII exact operands: 600 events / 2 MiB, whichever arrives first.
    if(!traceStopped && trace.length<600 && traceBytes+bytes<=2*1024*1024){trace.push(e);traceBytes+=bytes;}else traceStopped=true;
  };
  while(k<n) {
    budget.check('exact LLL', [...B[k],...d]);
    for(let j=k-1;j>=0;j--) {
      const l=lambda[k][j],q=(l<0n?-1n:1n)*((2n*abs(l)+d[j])/(2n*d[j]));if(!q) continue;
      for(let l=0;l<n;l++) {B[k][l]-=q*B[j][l];U[k][l]-=q*U[j][l];}
      for(let l=0;l<j;l++)lambda[k][l]-=q*lambda[j][l];
      lambda[k][j]-=q*d[j];reductions++;record({type:'reduce',k,j,multiplier:q});
    }
    const coefficient=lambda[k][k-1],previous=k===1?1n:d[k-2],oldD=d[k-1];
    const left=4n*d[k]*previous,right=3n*oldD*oldD-4n*coefficient*coefficient;
    const comparison={lhs:`${d[k]}/${oldD}`,rhs:`${right}/${4n*oldD*previous}`};
    if(left>=right) {record({type:'keep',k,j:k-1,...comparison});k++;continue;}
    record({type:'swap',k,j:k-1,...comparison});swaps++;
    [B[k],B[k-1]]=[B[k-1],B[k]];[U[k],U[k-1]]=[U[k-1],U[k]];
    // d[j] is the leading Gram determinant, μ[i,j]=λ[i,j]/d[j],
    // ||b*j||²=d[j]/d[j−1] (d[−1]=1). These are the exact rational
    // swap equations with common denominators cancelled by exact division.
    d[k-1]=exactDivide(previous*d[k]+coefficient*coefficient,oldD);
    for(let j=0;j<k-1;j++)[lambda[k][j],lambda[k-1][j]]=[lambda[k-1][j],lambda[k][j]];
    for(let i=k+1;i<n;i++){
      const a=lambda[i][k-1],b=lambda[i][k];
      lambda[i][k]=exactDivide(d[k]*a-coefficient*b,oldD);
      lambda[i][k-1]=exactDivide(previous*b+coefficient*a,oldD);
    }
    k=Math.max(1,k-1);
  }
  return {B,U,trace,events,swaps,reductions,traceBytes,traceTruncated:events>trace.length};
}
