// Concrete, replayable patches; source is always restored in finally.
// Baseline, nonempty diff, compiling build, changed bundle, named failing test,
// and restored green control are all required for a kill. Never reuses a server.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,readdirSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateNamedRun,validateUnitRun,assertNormalExit } from './mutation-report.mjs';
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
  {name:'oracle disagreement',file:'src/main.ts',anchor:'if(!data.matches && result && result.recovered!==null)',replacement:'if(data.matches && result && result.recovered!==null)',test:'simulator integrity failure',mode:'browser'},
  {name:'Wiener reveal metadata',file:'src/wiener/verify.ts',anchor:'reveal.insideGuarantee === inside',replacement:'true',test:'reveal verification rejects false theorem',mode:'unit',unitFile:'src/wiener/verify.test.ts'},
  {name:'Wiener transcript completeness',file:'src/wiener/verify.ts',anchor:'denominator === 0n',replacement:'true',test:'independent verifier rejects a partial negative',mode:'unit',unitFile:'src/wiener/verify.test.ts'},
  {name:'Wiener convergent divisibility',file:'src/wiener/attack.ts',anchor:'if (numerator % row.k !== 0n)',replacement:'if (numerator % row.d !== 0n)',test:'matches the independently long-divided toy ladder',mode:'unit',unitFile:'src/wiener/wiener.test.ts'},
  {name:'Wiener discriminant square',file:'src/wiener/attack.ts',anchor:'const square = root * root === delta;',replacement:'const square = true;',test:'rejects nonsquare discriminants',mode:'unit',unitFile:'src/wiener/wiener.test.ts'},
  {name:'Wiener factor product',file:'src/wiener/attack.ts',anchor:'const product = p * q === c.N;',replacement:'const product = true;',test:'public verification rejects factors',mode:'unit',unitFile:'src/wiener/wiener.test.ts'},
  {name:'Wiener theorem inequality',file:'src/wiener/attack.ts',anchor:'return 81n * d ** 4n < N;',replacement:'return 81n * d ** 4n >= N;',test:'computes the largest strict',mode:'unit',unitFile:'src/wiener/wiener.test.ts'},
  {name:'Wiener recovery verdict',file:'src/main.ts',anchor:"el('recovery').dataset.value=String(wienerSuccess)",replacement:"el('recovery').dataset.value=String(!wienerSuccess)",test:'Wiener recovery, sufficient boundary',mode:'browser'},
  {name:'Wiener negative claim',file:'src/main.ts',anchor:'el(\'negative-claim\').textContent="Surviving Wiener\'s attack does not make a small private exponent safe."',replacement:"el('negative-claim').textContent=''",test:'Wiener no-recovery evidence',mode:'browser'},
  {name:'Wiener public payload',file:'src/attacks/public.ts',anchor:"const wienerPublic={scenario:'wiener' as const,N:c.N,e:c.e};",replacement:"const wienerPublic={scenario:'wiener' as const,N:c.N,e:c.e,dPriv:1n};",test:'Wiener attack worker receives only',mode:'browser'}
];
function execute(command,args){return spawnSync(command,args,{encoding:'utf8',env:{...process.env,CI:'1'},timeout:300000,maxBuffer:16*1024*1024});}
function build(){const r=execute('npm',['run','build']);assertNormalExit(r,'build');if(r.status!==0)throw Error(`Build failed: ${r.stdout}\n${r.stderr}`);}
function hash(){const h=createHash('sha256');for(const file of readdirSync('dist/assets').filter(v=>/\.(js|css)$/.test(v)).sort())h.update(file).update(readFileSync(`dist/assets/${file}`));return h.digest('hex');}
function check(m,shouldPass){
  const report='.qa-artifacts/mutations/report.json';
  const result=m.mode==='browser'?execute('npx',['playwright','test',m.test.startsWith('WCAG')?'e2e/a11y.spec.ts':'e2e/claims.spec.ts','--grep',m.test,'--retries=0','--reporter=json']):execute('npx',['vitest','run',m.unitFile??'src/math/engine.test.ts','-t',m.test,'--reporter=json',`--outputFile=${report}`]);
  if(m.mode==='browser')validateNamedRun(result,m.test,shouldPass,m.test.startsWith('WCAG')?'a11y.spec.ts':'claims.spec.ts');
  else {assertNormalExit(result,m.test);validateUnitRun({...result,stdout:readFileSync(report,'utf8')},m.test,m.unitFile??'src/math/engine.test.ts',shouldPass);}
  return result;
}
const selected=process.argv[2]?mutations.filter(m=>m.name===process.argv[2]):mutations;
if(!selected.length)throw Error('Unknown mutation');const dirty=execute('git',['status','--porcelain']);assertNormalExit(dirty,'git status');if(dirty.status!==0||dirty.stdout.trim())throw Error('Commit source changes before replaying mutations');const records=[];mkdirSync('.qa-artifacts/mutations',{recursive:true});
const observationsPath=process.argv[2]?`.qa-artifacts/mutations/observed-${process.argv[2].replaceAll(' ','-')}.json`:'.qa-artifacts/mutations/observed.json';
for(const m of selected){
  const source=readFileSync(m.file,'utf8');if(source.split(m.anchor).length!==2)throw Error(`${m.name}: anchor must occur exactly once`);
  build();const baselineHash=hash(),baseline=check(m,true);
  let record;
  try{
    const changed=source.replace(m.anchor,m.replacement);if(changed===source)throw Error('Empty mutation');writeFileSync(m.file,changed);build();const mutatedHash=hash();
    if(mutatedHash===baselineHash)throw Error('Built bundle hash did not move');const observed=check(m,false);
    writeFileSync(`.qa-artifacts/mutations/${m.name.replaceAll(' ','-')}.log`,observed.stdout+observed.stderr);
    record={name:m.name,file:m.file,anchor:m.anchor,replacement:m.replacement,test:m.test,mode:m.mode,baselinePassed:true,sourceChanged:true,buildPassed:true,baselineHash,mutatedHash,namedTestFailed:true};
  }finally{writeFileSync(m.file,source);build();if(hash()!==baselineHash)throw Error(`${m.name}: restored bundle differs`);}
  check(m,true);
  records.push({...record,restoredPassed:true});writeFileSync(observationsPath,JSON.stringify(records,null,2));console.log(`KILLED and restored: ${m.name}`);
}
console.log(`${records.length} of ${selected.length} concrete mutations killed, with passing controls.`);
