import { bitLength,gcd,inverse,powMod } from '../math/integer';
import type { Challenge } from '../attacks/public';
export interface Key {N:bigint;p:bigint;q:bigint;dPriv:bigint;}
export function randomBelow(n:bigint):bigint {
  if(n<1n) throw Error('Empty sampling range');const bits=bitLength(n-1n),bytes=new Uint8Array(Math.ceil(bits/8));
  while(true) {crypto.getRandomValues(bytes);bytes[0]&=(1 << ((bits-1)%8+1))-1;
    let v=0n;for(const b of bytes) v=(v<<8n)+BigInt(b);if(v<n) return v;}
}
const sieve=[3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n,41n,43n,47n,53n,59n,61n,67n,71n,73n,79n,83n,89n,97n];
export function probablePrime(n:bigint,rounds=64):boolean {
  if(n===2n) return true;if(n<2n || !(n&1n)) return false;
  for(const p of sieve) {if(n===p)return true;if(n%p===0n)return false;}
  let d=n-1n,s=0;while(!(d&1n)){d>>=1n;s++;}
  for(let i=0;i<rounds;i++) {
    const a=randomBelow(n-3n)+2n;let x=powMod(a,d,n);if(x===1n || x===n-1n) continue;
    let pass=false;for(let j=1;j<s;j++){x=x*x%n;if(x===n-1n){pass=true;break;}}
    if(!pass)return false;
  } return true;
}
function prime(bits:number):bigint {
  const high=1n<<BigInt(bits-1);while(true) {const p=high+randomBelow(high)|1n;if(p%3n!==2n)continue;if(probablePrime(p))return p;}
}
export function generateKey(bits=512):Key {
  if(![512,768,1024].includes(bits))throw Error('Supported modulus sizes: 512, 768, 1024');
  while(true){const a=prime(bits/2),b=prime(bits/2);if(a===b || bitLength(a*b)!==bits)continue;
    const p=a>b?a:b,q=a>b?b:a,phi=(p-1n)*(q-1n);if(gcd(3n,phi)!==1n)continue;return {N:p*q,p,q,dPriv:inverse(3n,phi)};}
}
export function prefixValue(text:string):bigint {let v=0n;for(const b of new TextEncoder().encode(text))v=v*256n+BigInt(b);return v;}
export function example(key:Key,scenario:'message'|'factor',suffixBits:number,prefix:string) {
  if(!Number.isInteger(suffixBits)||suffixBits<1||suffixBits>256)throw Error('Unknown width must be 1–256 bits');
  const X=2n**BigInt(suffixBits);
  if(scenario==='factor') {
    const pHigh=key.p/X*X;if(pHigh===0n)throw Error('Reveal at least one high bit of the prime');
    const challenge:Challenge={scenario,N:key.N,pHigh,suffixBits,model:'larger-prime'};
    return {challenge,secret:key.p-pHigh,roundTrip:null};
  }
  const P=prefixValue(prefix),A=P*X;if(A+X>key.N)throw Error('The full prefix/suffix message interval must fit below N');
  const secret=randomBelow(X),M=A+secret,ciphertext=powMod(M,3n,key.N),roundTrip=powMod(ciphertext,key.dPriv,key.N)===M;
  if(!roundTrip)throw Error('Simulator round trip failed');
  const challenge:Challenge={scenario,N:key.N,e:3,prefixValue:P,suffixBits,ciphertext};return {challenge,secret,roundTrip};
}
