import { expect,it } from 'vitest';
import { example,generateKey,probablePrime } from './oracle';
import { attack } from '../attacks/public';
import { bitLength,powMod } from '../math/integer';
it('both public-only attacks recover fresh 512-bit secrets, including a wrapped message',()=>{
  for(let repeat=0;repeat<2;repeat++) {
    const key=generateKey();expect(bitLength(key.N)).toBe(512);expect(key.p>key.q).toBe(true);expect(key.p*key.q).toBe(key.N);
    const message=example(key,'message',64,'crypto-lab://known-prefix/'),factor=example(key,'factor',80,'');
    expect(message.roundTrip).toBe(true);const c=message.challenge;if(c.scenario!=='message')throw Error('Wrong challenge');
    expect((c.prefixValue*2n**64n+message.secret)**3n>=key.N).toBe(true);
    expect(powMod(c.ciphertext,key.dPriv,key.N)).toBe(c.prefixValue*2n**64n+message.secret);
    const a=attack(message.challenge,{m:2,t:2}),b=attack(factor.challenge,{m:3,t:3});
    expect(a.recovered).toBe(message.secret);expect(b.recovered).toBe(factor.secret);
    expect(a.derived.bound.satisfied && a.rows[0].certificate.satisfied).toBe(true);
    expect(b.derived.bound.satisfied && b.rows[0].certificate.satisfied).toBe(true);
    console.log(`Fresh 512-bit run ${repeat+1}: message ${a.runtimeMs.toFixed(0)} ms; factor ${b.runtimeMs.toFixed(0)} ms`);
  }
},60000);
it('labels probabilistic prime testing and handles tiny prime controls',()=>{
  for(const p of [2n,3n,5n,101n,1009n])expect(probablePrime(p)).toBe(true);
  for(const p of [0n,1n,4n,9n,341n,561n,1105n])expect(probablePrime(p)).toBe(false);
});
