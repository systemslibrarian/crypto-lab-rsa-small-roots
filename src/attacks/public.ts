import { bitLength,Budget,mod,powMod } from '../math/integer';
import { buildBasis,unscale } from '../lattice/build';
import { reduceLLL } from '../lattice/lll';
import { verifyReduction } from '../lattice/verify';
import { finiteBound,certificate,type Scenario } from '../coppersmith/bounds';
import { integerRoots } from '../coppersmith/roots';
import type { WienerChallenge } from '../wiener/attack';
export type LatticeChallenge={scenario:'message';N:bigint;e:3;prefixValue:bigint;suffixBits:number;ciphertext:bigint}|{scenario:'factor';N:bigint;pHigh:bigint;suffixBits:number;model:'larger-prime'};
export type Challenge=LatticeChallenge|WienerChallenge;
export type Parameters={m:number;t:number};
export function allowlistChallenge(c:Challenge):Challenge {
  if(c.scenario==='message')return {scenario:'message',N:c.N,e:c.e,prefixValue:c.prefixValue,suffixBits:c.suffixBits,ciphertext:c.ciphertext};
  if(c.scenario==='factor')return {scenario:'factor',N:c.N,pHigh:c.pHigh,suffixBits:c.suffixBits,model:c.model};
  const wienerPublic={scenario:'wiener' as const,N:c.N,e:c.e};
  return wienerPublic;
}
export function derive(c:Challenge,params:Parameters) {
  if(c.scenario==='wiener' || typeof c.N!=='bigint')throw Error('Expected a public lattice RSA challenge');
  if(!Number.isInteger(c.suffixBits) || c.suffixBits<1 || c.suffixBits>256 || c.N<3n || bitLength(c.N)>1024) throw Error('Supported range: modulus ≤1024 bits; unknown width 1–256 bits');
  const X=2n**BigInt(c.suffixBits),r=c.scenario==='message'?3:1;
  if(!Number.isInteger(params.m)|| !Number.isInteger(params.t)|| params.m<1 || params.t<1 || r*params.m+params.t>12) throw Error('Lattice dimension must be 2–12; m and t must be positive integers');
  let f:bigint[],A=0n;
  if(c.scenario==='message') {
    if(typeof c.prefixValue!=='bigint' || typeof c.ciphertext!=='bigint')throw Error('Expected exact public prefix and ciphertext integers');
    A=c.prefixValue*X;if(c.e!==3 || c.prefixValue<0n || A+X>c.N || c.ciphertext<0n || c.ciphertext>=c.N) throw Error('The full prefix/suffix message interval must fit below N');
    const center=(v:bigint)=>{v=mod(v,c.N);return 2n*v>c.N?v-c.N:v;};
    f=[center(A**3n-c.ciphertext),center(3n*A*A),center(3n*A),1n];
  } else {
    if(typeof c.pHigh!=='bigint')throw Error('Expected exact public prime-hint integer');
    if(c.model!=='larger-prime'|| c.pHigh<0n || c.pHigh%X || c.pHigh+X>c.N) throw Error('Expected an aligned high-bit hint under the larger-prime model');f=[c.pHigh,1n];
  }
  return {X,r,f,A,bound:finiteBound(c.N,r,params.m,params.t,c.scenario,X)};
}
export function verifyCandidate(c:Challenge,x:bigint):boolean {
  if(c.scenario==='wiener')return false;
  const X=2n**BigInt(c.suffixBits);if(x<0n || x>=X) return false;
  if(c.scenario==='message') {const M=c.prefixValue*X+x;return M>=0n && M<c.N && powMod(M,3n,c.N)===c.ciphertext;}
  const p=c.pHigh+x;return c.model==='larger-prime' && p>1n && p<c.N && c.N%p===0n && p*p>=c.N && p/X*X===c.pHigh;
}
export function attack(challenge:Challenge,params:Parameters,budget=new Budget(),progress=(stage:string)=>{}) {
  const c=allowlistChallenge(challenge),start=performance.now();progress('Constructing the scaled integer lattice');
  if(c.scenario==='wiener')throw Error('Wiener challenges use the continued-fraction attack entry point');
  const derived=derive(c,params),lattice=buildBasis(derived.f,c.N,derived.X,params.m,params.t);
  budget.check('basis construction',lattice.B.flat());progress('Reducing with exact LLL');const reduction=reduceLLL(lattice.B,budget);
  progress('Independently verifying the lattice');budget.check('lattice verification');
  const verified=verifyReduction(lattice.B,reduction.B,reduction.U,lattice.D);
  const rows=reduction.B.map(v=>({v,h:unscale(v,derived.X),certificate:certificate(v,c.N,params.m,c.scenario)}));
  if(derived.bound.satisfied && !rows[0].certificate.satisfied) throw Error('Satisfied prediction but failed first-row certificate');
  progress('Isolating integer roots with exact Sturm sequences');
  const searches:{row:number;roots:bigint[];complete:boolean;nodes:number}[]=[],candidates:{x:bigint;row:number;valid:boolean}[]=[];let recovered:bigint|null=null,complete=true;
  // First reduced vector, then remaining rows in ascending index, stop on public verification.
  for(let i=0;i<rows.length;i++) {
    const found=integerRoots(rows[i].h,derived.X,budget);searches.push({row:i,...found});
    for(const x of found.roots) {const valid=verifyCandidate(c,x);candidates.push({x,row:i,valid});if(valid && recovered===null) recovered=x;}
    if(recovered!==null) break;if(!found.complete) {complete=false;break;}
  }
  const status=recovered!==null?'verified-recovery':complete?'no-verified-root-found':'resource-limit';
  return {version:1,challenge:c,params,scenario:c.scenario as Scenario,status,derived,lattice,reduction,verified,rows,searches,candidates,recovered,searchComplete:complete,rowPolicy:'Ascending row index; stop after verified recovery or resource limit.',lift:'Centered non-leading coefficients; monic leading coefficient 1.',runtimeMs:performance.now()-start};
}
export type AttackResult=ReturnType<typeof attack>;
