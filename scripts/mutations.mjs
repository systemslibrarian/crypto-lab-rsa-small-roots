// Concrete, replayable patches; source is always restored in finally.
// Baseline, nonempty diff, compiling build, changed bundle, named failing test,
// and restored green control are all required for a kill. Never reuses a server.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,readdirSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const mutations=[
  {name:'prediction verdict',file:'src/main.ts',anchor:"el('prediction').dataset.value=String(d.bound.satisfied)",replacement:"el('prediction').dataset.value=String(!d.bound.satisfied)",test:'finite sufficient prediction',mode:'browser'},
  {name:'computed-vector verdict',file:'src/main.ts',anchor:"el('certificate').dataset.value=String(cert.satisfied)",replacement:"el('certificate').dataset.value=String(!cert.satisfied)",test:'selected vector certificate',mode:'browser'},
  {name:'recovery verdict',file:'src/main.ts',anchor:"el('recovery').dataset.value=String(success)",replacement:"el('recovery').dataset.value=String(!success)",test:'message recovery is re-encrypted',mode:'browser'},
  {name:'round-trip limitation',file:'src/main.ts',anchor:"el('negative-claim').textContent='A correct encryption/decryption round trip does not establish confidentiality.'",replacement:"el('negative-claim').textContent='A correct round trip establishes confidentiality.'",test:'message recovery is re-encrypted',mode:'browser'},
  {name:'finite exponent',file:'src/coppersmith/bounds.ts',anchor:"(scenario==='message'?2:1)*m*n-r*m*(m+1)",replacement:"(scenario==='message'?2:1)*m*n-r*m*(m+1)+1",test:'finite sufficient prediction',mode:'browser'},
  {name:'factor certificate modulus',file:'src/coppersmith/bounds.ts',anchor:"N**BigInt(scenario==='message'?2*m:m)",replacement:'N**BigInt(2*m)',test:'selected vector certificate',mode:'browser'},
  {name:'strict norm inequality',file:'src/coppersmith/bounds.ts',anchor:'satisfied:left<right',replacement:'satisfied:left<=right',test:'strict, different certificate thresholds',mode:'unit'},
  {name:'same-lattice proof',file:'src/lattice/verify.ts',anchor:'if(U[i].reduce(',replacement:'if(false && U[i].reduce(',test:'determinant-matching basis',mode:'unit'},
  {name:'independent Lovász check',file:'src/lattice/verify.ts',anchor:'if(norms[i].cmp(rhs)<0n)',replacement:'if(false && norms[i].cmp(rhs)<0n)',test:'equivalent but unreduced bases',mode:'unit'},
  {name:'column scaling',file:'src/lattice/build.ts',anchor:'a*factor*X**BigInt(l+j)',replacement:'a*factor*X**BigInt(l+j+1)',test:'independently expanded scaled basis',mode:'unit'},
  {name:'completed rows modulo N',file:'src/lattice/build.ts',anchor:'B.push(row);',replacement:'B.push(row.map(v=>v%N));',test:'independently expanded scaled basis',mode:'unit'},
  {name:'root-search completeness',file:'src/coppersmith/roots.ts',anchor:'return {roots,complete:false,nodes,reason:e.message}',replacement:'return {roots,complete:true,nodes,reason:e.message}',test:'incomplete on a resource limit',mode:'unit'},
  {name:'wrong recovered root',file:'src/attacks/public.ts',anchor:'recovered=x;',replacement:'recovered=x+1n;',test:'message recovery is re-encrypted',mode:'browser'},
  {name:'nondivisor acceptance',file:'src/attacks/public.ts',anchor:'c.N%p===0n',replacement:'true',test:'validates only the divisor',mode:'unit'},
  {name:'smaller-prime promise',file:'src/attacks/public.ts',anchor:'p*p>=c.N',replacement:'true',test:'validates only the divisor',mode:'unit'},
  {name:'stale result guard',file:'src/main.ts',anchor:'if(event.data.runId!==runId)return;const data=event.data;',replacement:'const data=event.data;',test:'delayed stale results',mode:'browser'},
  {name:'no-op attack',file:'src/main.ts',anchor:'attackWorker.postMessage(payload);',replacement:"setStatus('No verified root was found by this run.','no-verified-root-found');stopAttack();",test:'message recovery is re-encrypted',mode:'browser'},
  {name:'text contrast',file:'src/style.css',anchor:'--text-muted:#b0bbce;',replacement:'--text-muted:#343a46;',test:'WCAG A/AA production states at 1280px',mode:'browser'},
  {name:'coefficient replay',file:'src/main.ts',anchor:"after=e.type==='reduce'?before-e.multiplier!*source",replacement:"after=e.type==='reduce'?before+e.multiplier!*source",test:'reduction stepper replays actual',mode:'browser'},
  {name:'integer-root display',file:'src/main.ts',anchor:"exact(evaluate(row.h,result.recovered),'row-evaluation')",replacement:"exact(evaluate(row.h,result.recovered)+1n,'row-evaluation')",test:'selected vector certificate',mode:'browser'},
  {name:'oracle disagreement',file:'src/main.ts',anchor:'if(!data.matches && result && result.recovered!==null)',replacement:'if(data.matches && result && result.recovered!==null)',test:'simulator integrity failure',mode:'browser'}
];
function execute(args){const r=spawnSync('npx',args,{encoding:'utf8',env:{...process.env,CI:'1'},timeout:300000,maxBuffer:8*1024*1024});return {code:r.status,output:(r.stdout??'')+(r.stderr??'')};}
function build(){const r=spawnSync('npm',['run','build'],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(`Build failed: ${r.stdout}\n${r.stderr}`);}
function hash(){const h=createHash('sha256');for(const file of readdirSync('dist/assets').filter(v=>/\.(js|css)$/.test(v)).sort())h.update(file).update(readFileSync(`dist/assets/${file}`));return h.digest('hex');}
function check(m){return execute(m.mode==='browser'?['playwright','test','--grep',m.test,'--retries=0']:['vitest','run','src/math/engine.test.ts','-t',m.test]);}
const selected=process.argv[2]?mutations.filter(m=>m.name===process.argv[2]):mutations;
if(!selected.length)throw Error('Unknown mutation');const records=[];mkdirSync('.qa-artifacts/mutations',{recursive:true});
const observationsPath=process.argv[2]?`.qa-artifacts/mutations/observed-${process.argv[2].replaceAll(' ','-')}.json`:'.qa-artifacts/mutations/observed.json';
for(const m of selected){
  const source=readFileSync(m.file,'utf8');if(source.split(m.anchor).length!==2)throw Error(`${m.name}: anchor must occur exactly once`);
  build();const baselineHash=hash(),baseline=check(m);if(baseline.code!==0)throw Error(`${m.name}: baseline did not pass\n${baseline.output}`);
  let record;
  try{
    const changed=source.replace(m.anchor,m.replacement);if(changed===source)throw Error('Empty mutation');writeFileSync(m.file,changed);build();const mutatedHash=hash();
    if(mutatedHash===baselineHash)throw Error('Built bundle hash did not move');const observed=check(m);
    if(observed.code===0)throw Error(`Mutation survived: ${m.name}`);
    if(/Process from config.webServer|ERR_CONNECTION_REFUSED|error TS\d|Cannot find module|No tests found/.test(observed.output))throw Error(`Not a mathematical / claim kill: ${observed.output}`);
    if(!/AssertionError|expect\(|Expected:|toBeVisible|toHaveAttribute|toHaveText/.test(observed.output))throw Error(`Failure did not name a tested finding: ${observed.output}`);
    writeFileSync(`.qa-artifacts/mutations/${m.name.replaceAll(' ','-')}.log`,observed.output);
    record={name:m.name,file:m.file,anchor:m.anchor,replacement:m.replacement,test:m.test,mode:m.mode,baselinePassed:true,sourceChanged:true,buildPassed:true,baselineHash,mutatedHash,namedTestFailed:true};
  }finally{writeFileSync(m.file,source);build();if(hash()!==baselineHash)throw Error(`${m.name}: restored bundle differs`);}
  const restored=check(m);if(restored.code!==0)throw Error(`${m.name}: restored control is not green\n${restored.output}`);
  records.push({...record,restoredPassed:true});writeFileSync(observationsPath,JSON.stringify(records,null,2));console.log(`KILLED and restored: ${m.name}`);
}
console.log(`${records.length} of ${selected.length} concrete mutations killed, with passing controls.`);
