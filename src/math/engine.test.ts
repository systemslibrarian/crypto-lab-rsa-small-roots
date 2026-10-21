import { describe,expect,it } from 'vitest';
import { abs,Budget,integerRoot,LimitError,powMod } from './integer';
import { Q } from './rational';
import { determinant,identity } from './matrix';
import { evaluate,multiply } from './polynomial';
import { buildBasis,unscale } from '../lattice/build';
import { reduceLLL } from '../lattice/lll';
import { verifyReduction } from '../lattice/verify';
import { finiteBound,certificate } from '../coppersmith/bounds';
import { integerRoots } from '../coppersmith/roots';
import { attack,allowlistChallenge,verifyCandidate,derive,type Challenge } from '../attacks/public';
describe('exact arithmetic and lattice invariants',()=>{
  it('normalizes rationals and rounds ties away from zero',()=>{
    expect(new Q(6n,-8n).toString()).toBe('-3/4');for(const [a,b,x] of [[1n,2n,1n],[-1n,2n,-1n],[3n,2n,2n],[-3n,2n,-2n],[4n,3n,1n],[-4n,3n,-1n]])expect(new Q(a,b).round()).toBe(x);
    expect(new Q(7n,15n).mul(new Q(30n,49n)).toString()).toBe('2/7');
  });
  it('finds floor roots exactly, including the adjacent integer',()=>{
    for(const d of [1,2,3,8,56]){const x=12345n,p=x**BigInt(d);expect(integerRoot(p,d)).toBe(x);expect(integerRoot(p-1n,d)).toBe(x-1n);}
  });
  it('Bareiss pivots and asserts exact determinant',()=>{
    expect(determinant([[0n,2n],[3n,4n]])).toBe(-6n);expect(determinant([[1n,2n],[2n,4n]])).toBe(0n);
  });
  it('matches an independently expanded scaled basis and determinant',()=>{
    const {B,D}=buildBasis([2n,1n],11n,4n,2,2);
    expect(B).toEqual([[121n,0n,0n,0n],[22n,44n,0n,0n],[4n,16n,16n,0n],[0n,16n,64n,64n]]);
    expect(abs(determinant(B))).toBe(D);expect(D).toBe(11n**3n*4n**6n);
    expect(()=>unscale([1n,3n],4n)).toThrow('integrity');
  });
  it('reduces exactly, tracks U, independently verifies and rejects corruption',()=>{
    const input=[[1n,1n,1n],[-1n,0n,2n],[3n,5n,6n]],D=abs(determinant(input));
    const result=reduceLLL(input);expect(verifyReduction(input,result.B,result.U,D).lovasz).toBe(true);expect(result.swaps).toBeGreaterThan(0);
    const bad=result.B.map(r=>r.slice());bad[0][0]++;
    expect(()=>verifyReduction(input,bad,result.U,D)).toThrow('equivalence');
    expect(()=>verifyReduction(input,result.B,identity(3),D)).toThrow();
    expect(()=>reduceLLL([[1n,2n],[2n,4n]])).toThrow('Rank');
  });
  it('rejects a determinant-matching basis from a different lattice',()=>{
    expect(()=>verifyReduction([[2n,0n],[0n,3n]],[[1n,0n],[0n,6n]],identity(2),6n)).toThrow('equivalence');
  });
  it('rejects equivalent but unreduced bases',()=>{
    expect(()=>verifyReduction([[1n,0n],[3n,1n]],[[1n,0n],[3n,1n]],identity(2),1n)).toThrow('Size');
    expect(()=>verifyReduction([[5n,0n],[0n,1n]],[[5n,0n],[0n,1n]],identity(2),5n)).toThrow('Lovász');
  });
  it('fraction-free reduction agrees with independent rational verification over many small full-rank bases',()=>{
    for(let k=1n;k<=20n;k++) {
      const B=[[k,1n,0n],[1n,k+2n,1n],[k+1n,1n,k+3n]],D=abs(determinant(B));
      const reduced=reduceLLL(B);expect(verifyReduction(B,reduced.B,reduced.U,D).lovasz).toBe(true);
    }
  });
  it('every constructed row preserves the correct higher-power divisibility in each model',()=>{
    const a:Challenge={scenario:'message',N:55n,e:3,prefixValue:2n,suffixBits:3,ciphertext:powMod(17n,3n,55n)};
    const b:Challenge={scenario:'factor',N:55n,pHigh:8n,suffixBits:2,model:'larger-prime'};
    for(const [c,root,divisor] of [[a,1n,55n],[b,3n,11n]] as const){
      const d=derive(c,{m:2,t:2}),basis=buildBasis(d.f,c.N,d.X,2,2);
      for(const v of basis.B)expect(evaluate(unscale(v,d.X),root)%divisor**2n).toBe(0n);
    }
  });
  it('uses strict, different certificate thresholds',()=>{
    expect(certificate([2n,2n],16n,1,'factor').satisfied).toBe(false);
    expect(certificate([2n,2n],16n,1,'message').satisfied).toBe(true);
  });
  it('derives and verifies the finite sufficient bound and neighboring widths',()=>{
    for(const [r,m,t,scenario] of [[3,2,2,'message'],[1,3,3,'factor']] as const){
      const N=(1n<<512n)-569n,b=finiteBound(N,r,m,t,scenario,1n),n=r*m+t;
      const E=(scenario==='message'?2:1)*m*n-r*m*(m+1),C=BigInt(n)**BigInt(n)*2n**BigInt(n*(n-1)/2);
      expect(C*b.sufficient**BigInt(n*(n-1))<N**BigInt(E)).toBe(true);
      expect(C*(b.sufficient+1n)**BigInt(n*(n-1))>=N**BigInt(E)).toBe(true);
      expect(finiteBound(N,r,m,t,scenario,2n**BigInt(b.bits!)).satisfied).toBe(true);
      expect(finiteBound(N,r,m,t,scenario,2n**BigInt(b.bits!+1)).satisfied).toBe(false);
    }
    expect(finiteBound(101n,3,1,1,'message',1n).sufficient).toBe(0n);
  });
});
describe('complete bounded Sturm search',()=>{
  const cases:[string,bigint[],bigint,bigint[]][]=[
    ['zero, upper endpoint, excluded X, negative root',multiply(multiply([0n,1n],[-9n,1n]),multiply([-10n,1n],[1n,1n])),10n,[0n,9n]],
    ['repeated integer roots',multiply(multiply([-3n,1n],[-3n,1n]),[-7n,1n]),10n,[3n,7n]],
    ['half-integer endpoints and a split root',multiply(multiply([-1n,2n],[-3n,2n]),[-1n,1n]),5n,[1n]],
    ['only noninteger real roots',[-2n,0n,1n],10n,[]],
    ['no real roots',[1n,0n,1n],10n,[]],
    ['nonzero constant',[4n],10n,[]],
    ['large integer roots',multiply([-(1n<<100n),1n],[-((1n<<110n)-1n),1n]),1n<<110n,[1n<<100n,(1n<<110n)-1n]]
  ];
  for(const [name,p,X,expected] of cases)it(name,()=>{const found=integerRoots(p,X);expect(found.complete).toBe(true);expect(found.roots).toEqual(expected);for(const x of found.roots)expect(evaluate(p,x)).toBe(0n);expect(found.nodes).toBeLessThan(1000);});
  it('reports incomplete on a resource limit',()=>{expect(integerRoots([-3n,1n],100n,new Budget(15000,1)).complete).toBe(false);});
  it('rejects a zero polynomial',()=>expect(()=>integerRoots([0n],10n)).toThrow('Zero'));
});
describe('public-only attack acceptance',()=>{
  it('recovers the published Sage root-4 polynomial through LLL, not evaluation alone',()=>{
    const f=[-222n,5000n,10n,1n],N=10001n,X=8n,{B,D}=buildBasis(f,N,X,2,2),reduced=reduceLLL(B);
    verifyReduction(B,reduced.B,reduced.U,D);const roots=reduced.B.flatMap(v=>integerRoots(unscale(v,X),X).roots).filter(x=>evaluate(f,x)%N===0n);
    expect(roots).toContain(4n);
  });
  it('validates messages and rejects wrong, negative, excluded candidates',()=>{
    const c:Challenge={scenario:'message',N:3233n,e:3,prefixValue:10n,suffixBits:4,ciphertext:powMod(167n,3n,3233n)};
    expect(verifyCandidate(c,7n)).toBe(true);for(const x of [-1n,8n,16n])expect(verifyCandidate(c,x)).toBe(false);
  });
  it('validates only the divisor matching the promised larger-prime hint',()=>{
    const c:Challenge={scenario:'factor',N:3233n,pHigh:48n,suffixBits:4,model:'larger-prime'};
    expect(verifyCandidate(c,13n)).toBe(true);expect(verifyCandidate(c,5n)).toBe(false);expect(verifyCandidate(c,12n)).toBe(false);
  });
  it('rejects malformed parameters before constructing powers',()=>{
    const c:Challenge={scenario:'message',N:10001n,e:3,prefixValue:5n,suffixBits:4,ciphertext:5n};
    expect(()=>derive(c,{m:100000,t:2})).toThrow('dimension');expect(()=>derive({...c,suffixBits:9999},{m:2,t:2})).toThrow('range');
  });
  it('allowlists the actual public payload',()=>{
    const c={scenario:'message' as const,N:10001n,e:3 as const,prefixValue:5n,suffixBits:4,ciphertext:5n,secret:7n,p:73n,dPriv:41n};
    expect(Object.keys(allowlistChallenge(c)).sort()).toEqual(['N','ciphertext','e','prefixValue','scenario','suffixBits']);
    expect(allowlistChallenge({scenario:'wiener',N:90581n,e:17993n,secret:5n} as Challenge)).toEqual({scenario:'wiener',N:90581n,e:17993n});
  });
  it('tiny exhaustive controls agree with verified candidates and a genuine negative challenge',()=>{
    for(const ciphertext of [powMod(160n,3n,3233n),powMod(167n,3n,3233n),powMod(900n,3n,3233n)]) {
      const c:Challenge={scenario:'message',N:3233n,e:3,prefixValue:10n,suffixBits:4,ciphertext};
      const reference=Array.from({length:16},(_,i)=>BigInt(i)).filter(x=>verifyCandidate(c,x));
      const result=attack(c,{m:2,t:2});if(result.recovered!==null)expect(reference).toContain(result.recovered);
      if(reference.length===0)expect(result.status).toBe('no-verified-root-found');
    }
  });
  it('labels engine resource limits separately',()=>expect(()=>reduceLLL([[5n,0n],[0n,1n]],new Budget(15000,0))).toThrow(LimitError));
});
