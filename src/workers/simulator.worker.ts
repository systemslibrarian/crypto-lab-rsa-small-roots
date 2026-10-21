import { bitLength,powMod } from '../math/integer';
import { example,exampleWiener,generateKey,generateSmallDKey,randomBelow,type Key,type SmallDKey } from '../simulator/oracle';
import { wienerBoundary,withinWienerGuarantee } from '../wiener/attack';
import publicFixtures from '../fixtures/public.json';
import oracleFixtures from '../fixtures/oracle.json';
let key:Key|null=null,smallKey:SmallDKey|null=null,secret:bigint|null=null,secretKind:'lattice'|'wiener'='lattice';
self.onmessage=(event:MessageEvent)=>{
  const {runId,type,scenario,suffixBits,prefix,bits}=event.data;
  try {
    if(type==='check') {
      const matches=event.data.recovered===null?true:secret===event.data.recovered;
      const reveal=secretKind==='wiener'&&smallKey?{d:smallKey.dPriv,p:smallKey.p,q:smallKey.q,dBits:bitLength(smallKey.dPriv),boundary:wienerBoundary(smallKey.N),insideGuarantee:withinWienerGuarantee(smallKey.N,smallKey.dPriv),belowBonehDurfee:smallKey.dPriv**250n<smallKey.N**73n,verification:smallKey.verification}:undefined;
      self.postMessage({runId,type:'oracle-check',matches,reveal});return;
    }
    if(type==='wiener') {
      smallKey=generateSmallDKey(bits,event.data.dBits);secret=smallKey.dPriv;secretKind='wiener';
      const generated=exampleWiener(smallKey);self.postMessage({runId,type:'challenge',challenge:generated.challenge,roundTrip:generated.roundTrip});return;
    }
    if(type==='wiener-fixture') {
      const publicRecord=publicFixtures.fixtures.find(record=>record.name==='wiener-above')!,truth=oracleFixtures.find(record=>record.name==='wiener-above')!;
      const N=BigInt(publicRecord.challenge.N),e=BigInt(publicRecord.challenge.e!),p=BigInt(truth.p),q=BigInt(truth.q),d=BigInt(truth.secret!),message=randomBelow(N-3n)+2n,ciphertext=powMod(message,e,N),decrypted=powMod(ciphertext,d,N);
      smallKey={N,e,p,q,dPriv:d,dBits:bitLength(d),verification:{message,ciphertext,decrypted,roundTrip:decrypted===message}};secret=d;secretKind='wiener';
      const generated=exampleWiener(smallKey);self.postMessage({runId,type:'challenge',challenge:generated.challenge,roundTrip:generated.roundTrip,evidence:'wiener-above'});return;
    }
    if(type==='new'||!key)key=generateKey(bits);
    const generated=example(key,scenario,suffixBits,prefix);secret=generated.secret;secretKind='lattice';smallKey=null;
    self.postMessage({runId,type:'challenge',challenge:generated.challenge,roundTrip:generated.roundTrip});
  }catch(e){self.postMessage({runId,type:'error',message:e instanceof Error?e.message:String(e)});}
};
