import { expect,it } from 'vitest';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { attack,verifyCandidate,type Challenge } from '../attacks/public';
import publicData from './public.json';
import oracle from './oracle.json';
import expected from './expected.json';
const decode=(input:Record<string,unknown>):Challenge=>Object.fromEntries(Object.entries(input).map(([k,v])=>[k,['N','ciphertext','prefixValue','pHigh'].includes(k)?BigInt(v as string):v])) as Challenge;
const observations:Record<string,unknown>={};
for(const fixture of publicData.fixtures)it(`independent fixture ${fixture.name}`,()=>{
  const c=decode(fixture.challenge),result=attack(c,fixture.params),truth=oracle.find(v=>v.name===fixture.name)!;
  const observation={prediction:result.derived.bound.satisfied,certificate:result.rows[0].certificate.satisfied,status:result.status,recovered:result.recovered?.toString()??null,runtimeMs:result.runtimeMs};observations[fixture.name]=observation;
  expect({prediction:observation.prediction,certificate:observation.certificate,status:observation.status,recovered:observation.recovered}).toEqual(expected[fixture.name as keyof typeof expected]);
  if(truth.secret===null)expect(result.recovered).toBe(null);
  else if(result.recovered!==null) {expect(result.recovered).toBe(BigInt(truth.secret));expect(verifyCandidate(c,result.recovered)).toBe(true);}
  if(result.derived.bound.satisfied || result.rows[0].certificate.satisfied)expect(result.recovered).toBe(BigInt(truth.secret!));
  mkdirSync('.qa-artifacts/math',{recursive:true});writeFileSync(`.qa-artifacts/math/${fixture.name}.json`,JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v));
  writeFileSync('.qa-artifacts/math/observations.json',JSON.stringify(observations,null,2));
},60000);
it('production attack runs in a fresh process without simulator or oracle imports',async()=>{
  const html=readFileSync('dist/index.html','utf8');expect(html).toContain('RSA Small Roots');
  const manifest=await import('node:fs');const workerFile=manifest.readdirSync('dist/assets').find(v=>v.startsWith('attack.worker-')&&v.endsWith('.js'))!;
  const script=readFileSync(`dist/assets/${workerFile}`,'utf8');expect(script).not.toMatch(/dPriv|Miller|randomBelow|probablePrime|generateKey/);
  const fixture=publicData.fixtures.find(v=>v.name==='message-64')!;
  const worker=new Worker(fileURLToPath(new URL('../../scripts/public-worker.mjs',import.meta.url)),{workerData:{module:fileURLToPath(new URL(`../../dist/assets/${workerFile}`,import.meta.url))}});
  try {
    const result=await new Promise<{status:string;recovered:bigint}>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Public worker timed out')),20000);
      worker.on('error',reject);worker.on('message',event=>{if(event.type==='result'){clearTimeout(timeout);resolve(event.result);}if(event.type==='error'){clearTimeout(timeout);reject(Error(event.message));}});
      worker.postMessage({runId:1,challenge:decode(fixture.challenge),params:fixture.params,ms:15000});
    });
    expect(result.status).toBe('verified-recovery');expect(verifyCandidate(decode(fixture.challenge),result.recovered)).toBe(true);
  }finally{await worker.terminate();}
},30000);
