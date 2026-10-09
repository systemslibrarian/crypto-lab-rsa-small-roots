import { Budget,LimitError } from '../math/integer';
import { derivative,evaluate,primitive,quotientRemainder,signAtHalf,squareFree,trim } from '../math/polynomial';
function sturm(p:bigint[],budget:Budget):bigint[][] {
  const seq=[squareFree(p)];if(seq[0].length<2) return seq;seq.push(primitive(derivative(seq[0])));
  while(seq.at(-1)!.length>1) {
    budget.check('Sturm sequence',seq.at(-1)!);
    const r=quotientRemainder(seq.at(-2)!,seq.at(-1)!).r;if(r.every(v=>v===0n)) break;
    seq.push(r.map(v=>-v));
  } return seq;
}
function oneSidedSign(p:bigint[],at:bigint,side:1|-1):number {
  let order=0,s=signAtHalf(p,at);
  while(!s && p.length>1) {p=derivative(p);order++;s=signAtHalf(p,at);}
  return side===-1 && order%2?-s:s;
}
function variations(seq:bigint[][],at:bigint,side:1|-1):number {
  let prev=0,v=0;for(const p of seq) {const s=oneSidedSign(p,at,side);if(s && prev && s!==prev) v++;if(s) prev=s;}return v;
}
export function integerRoots(original:bigint[],X:bigint,budget=new Budget()) {
  const p=trim(original);if(p.every(v=>v===0n)) throw Error('Zero reduced polynomial');
  if(X<1n) throw Error('Invalid root interval');if(p.length===1) return {roots:[] as bigint[],complete:true,nodes:0};
  const roots:bigint[]=[],pending:[bigint,bigint][]=[[0n,X-1n]];let nodes=0;
  try {
    budget.check('Sturm sequence',p);const seq=sturm(p,budget);
    while(pending.length) {
      budget.check('integer-root isolation',seq.flat());nodes++;
      const [lo,hi]=pending.pop()!;
      const count=variations(seq,2n*lo-1n,1)-variations(seq,2n*hi+1n,-1);
      if(count<=0) continue;
      if(lo===hi) {if(evaluate(original,lo)===0n) roots.push(lo);continue;}
      const mid=(lo+hi)/2n;pending.push([mid+1n,hi],[lo,mid]);
    }
    return {roots:roots.sort((a,b)=>a<b?-1:1),complete:true,nodes};
  } catch(e) {if(e instanceof LimitError) return {roots,complete:false,nodes,reason:e.message};throw e;}
}
