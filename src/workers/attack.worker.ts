import { attack,allowlistChallenge } from '../attacks/public';
import { Budget,LimitError } from '../math/integer';
self.onmessage=(event:MessageEvent)=>{
  const {runId,challenge,params,ms}=event.data;
  try {const result=attack(allowlistChallenge(challenge),params,new Budget(ms),stage=>self.postMessage({runId,type:'progress',stage}));
    self.postMessage({runId,type:'result',result});
  }catch(e){self.postMessage({runId,type:'error',status:e instanceof LimitError?'resource-limit':e instanceof Error && /Supported|Expected|must|aligned/.test(e.message)?'invalid-input':'integrity-error',stage:e instanceof LimitError?e.stage:'computation',message:e instanceof Error?e.message:String(e)});}
};
