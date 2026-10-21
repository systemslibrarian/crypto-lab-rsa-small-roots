import { expect,it } from 'vitest';
import { example,generateKey,generateSmallDKey,probablePrime } from './oracle';
import { attack } from '../attacks/public';
import { bitLength,gcd,powMod } from '../math/integer';
import { wienerAttack } from '../wiener/attack';
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
it('generates a guarded small-d key and the public-only Wiener attack recovers it',()=>{
  const key=generateSmallDKey(512,96);expect(bitLength(key.N)).toBe(512);expect(bitLength(key.dPriv)).toBe(96);expect(key.dPriv&1n).toBe(1n);
  expect(gcd(key.dPriv,key.p-1n)).toBe(1n);expect(gcd(key.dPriv,key.q-1n)).toBe(1n);expect(key.e<key.N).toBe(true);expect(key.verification.roundTrip).toBe(true);
  const result=wienerAttack({scenario:'wiener',N:key.N,e:key.e});expect(result.recovered?.d).toBe(key.dPriv);
},30000);
it('refuses private-exponent widths outside the declared key-generation range',()=>{
  expect(()=>generateSmallDKey(512,15)).toThrow('16–256');expect(()=>generateSmallDKey(512,257)).toThrow('16–256');
});
