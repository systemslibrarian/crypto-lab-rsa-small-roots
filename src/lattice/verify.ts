import { abs } from '../math/integer';
import { determinant,gramSchmidt,type Matrix } from '../math/matrix';
import { Q } from '../math/rational';
export function verifyReduction(original:Matrix,reduced:Matrix,U:Matrix,D:bigint) {
  const n=original.length;
  if([original,reduced,U].some(b=>b.length!==n || b.some(r=>r.length!==n))) throw Error('Verifier shape mismatch');
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) {
    if(U[i].reduce((s,u,k)=>s+u*original[k][j],0n)!==reduced[i][j]) throw Error('Transformation equivalence failure');
  }
  const detU=determinant(U);if(abs(detU)!==1n) throw Error('Transformation is not unimodular');
  if(abs(determinant(original))!==D || abs(determinant(reduced))!==D || D===0n) throw Error('Lattice determinant mismatch');
  const {mu,norms}=gramSchmidt(reduced);
  for(let i=1;i<n;i++) {
    for(let j=0;j<i;j++) if(abs(mu[i][j].a)*2n>mu[i][j].b) throw Error('Size-reduction inequality failed');
    const rhs=new Q(3n,4n).sub(mu[i][i-1].mul(mu[i][i-1])).mul(norms[i-1]);
    if(norms[i].cmp(rhs)<0n) throw Error('Lovász inequality failed');
  }
  return {equivalence:true,unimodular:true,sizeReduced:true,lovasz:true,determinant:D,detU};
}
