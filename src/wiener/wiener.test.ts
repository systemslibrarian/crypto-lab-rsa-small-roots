import { describe,expect,it } from 'vitest';
import { Budget } from '../math/integer';
import { convergents,partialQuotients } from './cf';
import { verifyWiener,wienerAttack,wienerBoundary,withinWienerGuarantee } from './attack';

describe('Wiener continued-fraction attack',()=>{
  const challenge={scenario:'wiener' as const,N:90581n,e:17993n};
  const longDivision=(x:bigint,y:bigint)=>{const out:bigint[]=[];while(y){out.push(x/y);[x,y]=[y,x%y];}return out;};
  const squareRoot=(n:bigint)=>{let low=0n,high=1n;while(high*high<=n)high*=2n;while(high-low>1n){const mid=(low+high)/2n;if(mid*mid<=n)low=mid;else high=mid;}return low;};

  it('matches the independently long-divided toy ladder and factors N',()=>{
    const expected=longDivision(challenge.e,challenge.N);expect(expected).toEqual([0n,5n,29n,4n,1n,3n,2n,4n,3n]);
    expect(partialQuotients(challenge.e,challenge.N)).toEqual(expected);
    const ladder=[...convergents(challenge.e,challenge.N)];
    expect(ladder.slice(0,4).map(({k,d})=>[k,d])).toEqual([[0n,1n],[1n,5n],[29n,146n],[117n,589n]]);
    const result=wienerAttack(challenge);
    expect(result.status).toBe('verified-recovery');expect(result.recovered).toMatchObject({d:5n,p:379n,q:239n});
    expect(result.testedCount).toBeLessThanOrEqual(result.lemmaBound);
    expect(result.rows[0].reason).toBe('k = 0, not a candidate');expect(result.rows.at(-1)?.reason).toBe('factors N');
  });

  it('computes the largest strict 81·D⁴ boundary and evaluates the theorem inequality',()=>{
    const D=wienerBoundary(challenge.N);expect(D).toBe(5n);
    expect(81n*D**4n<challenge.N).toBe(true);expect(81n*(D+1n)**4n>=challenge.N).toBe(true);
    expect(withinWienerGuarantee(challenge.N,5n)).toBe(true);expect(withinWienerGuarantee(challenge.N,6n)).toBe(false);
  });

  it('rejects nonsquare discriminants before a candidate can divide N',()=>{
    const result=wienerAttack({scenario:'wiener',N:19n,e:11n});
    expect(result.rows.some(row=>row.reason==='Δ is not a perfect square')).toBe(true);
    expect(result.rows.some(row=>row.reason==='candidate does not divide N')).toBe(false);
    for(const row of result.rows) {
      if(row.k===0n){expect(row.divides).toBe(false);continue;}
      const numerator=11n*row.d-1n,divides=numerator%row.k===0n;expect(row.divides).toBe(divides);if(!divides)continue;
      const phi=numerator/row.k,s=20n-phi,delta=s*s-76n;expect(row.phi).toBe(phi);expect(row.s).toBe(s);expect(row.delta).toBe(delta);
      if(delta<0n){expect(row.square).toBe(false);continue;}const root=squareRoot(delta),square=root*root===delta;expect(row.square).toBe(square);if(!square)continue;
      const parity=(s+root)%2n===0n&&(s-root)%2n===0n;expect(row.parity).toBe(parity);if(!parity)continue;
      expect(row.product).toBe(((s+root)/2n)*((s-root)/2n)===19n);
    }
  });

  it('public verification rejects factors whose product is not N',()=>{
    const checks=verifyWiener(challenge,5n,379n,241n);
    expect(checks.product).toBe(false);expect(checks.valid).toBe(false);
  });

  it('returns a resource-limit state without calling an incomplete ladder negative',()=>{
    const result=wienerAttack(challenge,new Budget(15000,1));
    expect(result.status).toBe('resource-limit');expect(result.searchComplete).toBe(false);expect(result.rows).toHaveLength(1);
  });
});
