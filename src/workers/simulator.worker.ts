import { example,generateKey,type Key } from '../simulator/oracle';
let key:Key|null=null,secret:bigint|null=null;
self.onmessage=(event:MessageEvent)=>{
  const {runId,type,scenario,suffixBits,prefix,bits}=event.data;
  try {
    if(type==='check') {self.postMessage({runId,type:'oracle-check',matches:secret===event.data.recovered});return;}
    if(type==='new'||!key)key=generateKey(bits);
    const generated=example(key,scenario,suffixBits,prefix);secret=generated.secret;
    self.postMessage({runId,type:'challenge',challenge:generated.challenge,roundTrip:generated.roundTrip});
  }catch(e){self.postMessage({runId,type:'error',message:e instanceof Error?e.message:String(e)});}
};
