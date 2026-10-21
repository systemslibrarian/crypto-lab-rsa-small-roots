import { attack,allowlistChallenge } from '../attacks/public';
import { Budget,LimitError } from '../math/integer';
import { wienerAttack } from '../wiener/attack';
self.onmessage=(event:MessageEvent)=>{
  const {runId,challenge,params,ms}=event.data;
  try {const publicChallenge=allowlistChallenge(challenge);
    const result=publicChallenge.scenario==='wiener'
      ?wienerAttack(publicChallenge,new Budget(ms),row=>self.postMessage({runId,type:'wiener-row',row}))
      :attack(publicChallenge,params,new Budget(ms),stage=>self.postMessage({runId,type:'progress',stage}));
    self.postMessage({runId,type:'result',result});
  }catch(e){self.postMessage({runId,type:'error',status:e instanceof LimitError?'resource-limit':e instanceof Error && /Supported|Expected|must|aligned/.test(e.message)?'invalid-input':'integrity-error',stage:e instanceof LimitError?e.stage:'computation',message:e instanceof Error?e.message:String(e)});}
};
