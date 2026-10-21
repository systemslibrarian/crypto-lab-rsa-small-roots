import './style.css';
import { allowlistChallenge,derive,verifyCandidate,type Challenge,type Parameters,type AttackResult } from './attacks/public';
import { bitLength,integerRoot,powMod } from './math/integer';
import { evaluate } from './math/polynomial';
import { wienerBoundary,type WienerResult,type WienerRow } from './wiener/attack';
import { validateWienerResult,validateWienerReveal,type WienerReveal } from './wiener/verify';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const exact=(v:bigint,id='')=>`<code ${id?`id="${id}"`:''} class="exact">${v}</code>`;
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
type Scenario='message'|'factor'|'wiener';

let scenario:Scenario='message',runId=0,challenge:Challenge|null=null,result:AttackResult|WienerResult|null=null,roundTrip:boolean|null=null,wienerReveal:WienerReveal|null=null;
let simulator=new Worker(new URL('./workers/simulator.worker.ts',import.meta.url),{type:'module'});
let attackWorker:Worker|null=null,timer:ReturnType<typeof setTimeout>|null=null,generationTimer:ReturnType<typeof setTimeout>|null=null,selectedRow=0,traceIndex=0;
const field=<T extends HTMLInputElement|HTMLSelectElement>(id:string)=>el<T>(id);
const params=():Parameters=>{
  const p=field<HTMLSelectElement>('preset').value;
  return scenario==='message'?(p==='compact'?{m:1,t:1}:p==='deep'?{m:3,t:3}:{m:2,t:2}):(p==='compact'?{m:2,t:2}:p==='deep'?{m:5,t:5}:{m:3,t:3});
};
function setStatus(message:string,status:string) {el('status').textContent=message;el('app').dataset.status=status;}
function stopAttack() {attackWorker?.terminate();attackWorker=null;if(timer)clearTimeout(timer);timer=null;el('cancel').hidden=true;document.querySelectorAll('.pipeline li').forEach(x=>x.classList.remove('active'));}
function retire(reason:string) {
  runId++;stopAttack();result=null;wienerReveal=null;el('reveal').hidden=true;el('reveal').removeAttribute('data-outcome');document.querySelectorAll('.reveal-checks').forEach(x=>x.remove());el<HTMLButtonElement>('export').disabled=true;
  el('certificate').textContent='Run the attack to compute';el('certificate').dataset.value='pending';
  el('recovery').textContent='No result yet';el('recovery').dataset.value='pending';
  el('certificate-note').textContent=scenario==='wiener'?'Every accepted denominator must reconstruct factors and pass public RSA checks.':'A short enough vector proves the modular root is also an integer root.';
  el('recovery-note').textContent=scenario==='wiener'?'No convergent is accepted until its factors multiply exactly to N.':'Every candidate must pass the original RSA equation or the hinted-factor check.';
  el('basis-content').innerHTML='<p>Run the attack to inspect the integer lattice.</p>';
  el('reduction-content').innerHTML='<p>Run the attack to inspect its reduction trace.</p>';
  el('roots-content').innerHTML='<p>Run the attack to inspect root isolation and exact candidate checks.</p>';
  el('wiener-content').innerHTML='<p>Run Wiener’s attack to inspect the convergent ladder.</p>';el('wiener-live-rows').innerHTML='<tr data-placeholder="true"><td colspan="4">Waiting for the first exact convergent.</td></tr>';el('wiener-live').textContent='Waiting to test e/N.';
  document.querySelectorAll('.pipeline li').forEach(x=>x.classList.remove('complete','active'));
  if(reason)setStatus(reason,'idle');
}
function illustration() {
  const width=Number(field<HTMLInputElement>('width').value),p=params(),n=(scenario==='message'?3:1)*p.m+p.t;
  el('width-label').textContent=`${width} bits`;el('unknown-label').textContent=scenario==='wiener'?`${width}-bit private exponent`:`${width} hidden bits`;
  el('unknown-cells').innerHTML=Array.from({length:8},()=>'<span>?</span>').join('');
  el('range').textContent=scenario==='wiener'?`2^${width-1} ≤ d < 2^${width}`:`0 ≤ x < 2^${width}`;el('dimension').textContent=scenario==='wiener'?'No lattice':`${n} × ${n}`;
}
function buildChallenge(newKey=false) {
  challenge=null;el<HTMLButtonElement>('run').disabled=true;illustration();
  el('prediction').textContent='Preparing the public challenge';el('prediction').dataset.value='pending';
  el('prediction-note').textContent='The exact bound will be recomputed for the new public inputs.';
  el('challenge-content').innerHTML='<p>Preparing a public challenge. Previous public inputs have been retired.</p>';
  if(newKey||scenario==='wiener'){simulator.terminate();simulator=new Worker(new URL('./workers/simulator.worker.ts',import.meta.url),{type:'module'});bindSimulator();}
  if(newKey||scenario==='wiener')setStatus(`Generating a fresh ${field<HTMLSelectElement>('key-size').value}-bit demonstration key…`,'generating');
  if(scenario==='wiener')simulator.postMessage({runId,type:'wiener',scenario,dBits:Number(field<HTMLInputElement>('width').value),bits:Number(field<HTMLSelectElement>('key-size').value)});
  else simulator.postMessage({runId,type:newKey?'new':'example',scenario,suffixBits:Number(field<HTMLInputElement>('width').value),prefix:field<HTMLInputElement>('prefix').value,bits:Number(field<HTMLSelectElement>('key-size').value)});
  if(generationTimer)clearTimeout(generationTimer);
  const generationId=runId;generationTimer=setTimeout(()=>{if(generationId!==runId)return;simulator.terminate();challenge=null;setStatus('Key generation reached its 30-second budget. Reset the lab to try again.','resource-limit');},30000);
}
function bindSimulator() {
  simulator.onerror=()=>{if(generationTimer)clearTimeout(generationTimer);generationTimer=null;integrityFailure('The simulator worker failed. Generate a new key to retry.');};
  simulator.onmessage=event=>{
    const data=event.data;if(data.runId!==runId)return;
    if(data.type==='oracle-check') {
      if(scenario==='wiener') {
        if(!data.matches){integrityFailure('The simulator cross-check disagreed with the recovered private exponent.');return;}
        if(timer)clearTimeout(timer);timer=null;
        if(!data.reveal){integrityFailure('The simulator omitted its post-run evidence.');return;}
        drawWienerReveal(data.reveal);
      } else if(!data.matches && result && result.recovered!==null) integrityFailure('The simulator cross-check disagreed with public recovery.');
      return;
    }
    if(generationTimer)clearTimeout(generationTimer);generationTimer=null;
    if(data.type==='error') {setStatus(data.message,'invalid-input');el('prediction').textContent='Invalid challenge';if(scenario!=='wiener')field<HTMLInputElement>('prefix').setAttribute('aria-invalid','true');return;}
    if(data.type==='challenge') {
      challenge=data.challenge;roundTrip=data.roundTrip;field<HTMLInputElement>('prefix').removeAttribute('aria-invalid');
      drawPublic();el<HTMLButtonElement>('run').disabled=false;
      if(!el('status').textContent?.includes('retired'))setStatus('Ready. Run the attack using only the displayed public information.','idle');
    }
  };
}
function drawPublic() {
  if(!challenge)return;const c=challenge;if(c.scenario==='wiener'){drawWienerPublic(c);return;}const p=params();let d:ReturnType<typeof derive>;
  try{d=derive(c,p);}catch(e){setStatus((e as Error).message,'invalid-input');el<HTMLButtonElement>('run').disabled=true;return;}
  illustration();el('key-label').textContent=`${bitLength(c.N)}-bit modulus`;
  document.querySelector('.pipeline li')?.classList.add('complete');
  el('known-display').textContent=c.scenario==='message'?field<HTMLInputElement>('prefix').value:`0x${c.pHigh.toString(16)}`;
  el('prediction').textContent=d.bound.satisfied?'✓ Within the sufficient range':'— Outside the sufficient range';el('prediction').dataset.value=String(d.bound.satisfied);
  el('prediction-note').textContent=d.bound.bits===null?'No positive certified range for this parameter choice.':`This lattice guarantees up to ${d.bound.bits} whole unknown bits. Current: ${c.suffixBits} bits. Recovery beyond this bound can still happen.`;
  const publicFields=c.scenario==='message'?`<dt>Public exponent e</dt><dd id="public-e">3</dd><dt>Known prefix P (UTF-8 bytes, hex)</dt><dd>${exact(c.prefixValue,'public-prefix')}<code class="exact">0x${c.prefixValue.toString(16).padStart(new TextEncoder().encode(field<HTMLInputElement>('prefix').value).length*2,'0')}</code></dd><dt>Shifted prefix A = P · X</dt><dd>${exact(d.A,'public-A')}</dd><dt>Ciphertext c</dt><dd>${exact(c.ciphertext,'public-c')}</dd>`:`<dt>High-bit hint pHigh</dt><dd>${exact(c.pHigh,'public-hint')}</dd><dt>Divisor model</dt><dd>Larger prime p ≥ √N. The certificate is conditional on this public promise until recovery.</dd>`;
  el('challenge-content').innerHTML=`<p>${c.scenario==='message'?'Attacker inputs: N, e = 3, ciphertext c, known prefix P, and suffix width k.':'Attacker inputs: N, pHigh, suffix width k, and the declared larger-prime model.'}</p><dl><dt>Public modulus N</dt><dd>${exact(c.N,'public-N')}</dd>${publicFields}<dt>Unknown width k</dt><dd id="public-k">${c.suffixBits}</dd><dt>Strict upper bound X = 2^k</dt><dd>${exact(d.X,'public-X')}</dd><dt>Polynomial coefficients [x⁰, x¹, …]</dt><dd><code class="exact" id="public-f">${escape(d.f.join(', '))}</code></dd><dt>Parameters r, m, t, n</dt><dd id="public-params">${d.r}, ${p.m}, ${p.t}, ${d.bound.n}</dd><dt>Lift convention</dt><dd>Centered representatives for non-leading coefficients; leading coefficient exactly 1.</dd></dl><h3>Conservative sufficient bound for this lattice</h3><p>C · X^Q &lt; N^E, Q = ${d.bound.Q}, E = ${d.bound.E}. This is a guarantee, not an attack threshold.</p><dl><dt>Exact C</dt><dd>${exact(d.bound.C,'bound-C')}</dd><dt>X_sufficient</dt><dd>${exact(d.bound.sufficient,'bound-X')}</dd><dt>C · X^Q</dt><dd>${exact(d.bound.left,'bound-left')}</dd><dt>N^E (0 if E ≤ 0)</dt><dd>${exact(d.bound.right,'bound-right')}</dd></dl>`;
  if(c.scenario==='message') {
    const small=42n,smallC=powMod(small,3n,c.N),root=integerRoot(c.ciphertext,3),check=root**3n===c.ciphertext;
    el('shortcut').innerHTML=`<span>Small-message example M = 42</span><br>42³ = ${smallC} &lt; N<br>∛${smallC} = ${integerRoot(smallC,3)} · exact check ✓<hr><span>Current public challenge</span><br>A³ ${d.A**3n>=c.N?'≥':'<'} N<br><span>The exact floor cube root of c is</span><code class="exact" id="cube-root">${root}</code><span id="cube-check">root³ ${check?'=':'≠'} c · ${check?'perfect cube':'not a perfect cube'}</span><br><span>${d.A**3n>=c.N?'Even the known prefix wraps when cubed. The no-wrap shortcut cannot recover this message.':'No-wrap is not guaranteed for this challenge. An exact cube check alone does not verify the full message interval.'}</span>`;
  } else el('shortcut').innerHTML='<span>Prime-hint scenario</span><br>f(x₀) = pHigh + x₀ = p<br>f(x₀) ≡ 0 mod p<br><span>The unknown divisor is p, not N. The public exponent plays no part in this attack.</span>';
}
function log2Fixed(value:bigint):string {
  const shift=Math.max(0,bitLength(value)-53),top=Number(value>>BigInt(shift));return (Math.log2(top)+shift).toFixed(1);
}
function drawWienerPublic(c:Extract<Challenge,{scenario:'wiener'}>) {
  const boundary=wienerBoundary(c.N),lemmaBound=2*bitLength(c.N);illustration();el('key-label').textContent=`${bitLength(c.N)}-bit modulus`;document.querySelector('.pipeline li')?.classList.add('complete');
  el('known-display').textContent='e / N';el('prediction').textContent='Unknown until d is recovered or revealed';el('prediction').dataset.value='pending';
  el('prediction-note').textContent=`For same-bit-length RSA primes, Wiener's guarantee covers d ≤ D where D is the largest integer satisfying 81·D⁴ < N: about 2^${log2Fixed(boundary)}.`;
  el('challenge-content').innerHTML=`<p>Attacker payload: N and e only. The simulator keeps d, p, and q until the post-run reveal.</p><dl><dt>Public modulus N</dt><dd>${exact(c.N,'public-N')}</dd><dt>Public exponent e</dt><dd>${exact(c.e,'public-e')}</dd><dt>Exact guarantee boundary D</dt><dd>${exact(boundary,'wiener-boundary')}</dd><dt>Displayed log₂(D)</dt><dd id="wiener-boundary-bits">${log2Fixed(boundary)}</dd><dt>Theorem assumptions and inequality</dt><dd>Distinct same-bit-length primes; 81·d⁴ &lt; N</dd><dt>Lemma 16.6 row bound</dt><dd id="wiener-lemma-bound">${lemmaBound}</dd></dl><p>The continued fraction of e/N is generated by exact BigInt Euclid. No private value decides which row passes.</p>`;
  el('shortcut').innerHTML='<span>Wiener scenario</span><br>e/N ≈ k/d<br><span>Each convergent kᵢ/dᵢ proposes a denominator. Exact divisibility, square-discriminant, parity, and p·q = N checks decide the row.</span>';
}
function chooseScenario(next:Scenario) {
  if(next===scenario)return;retire('Previous result retired: attack scenario changed.');scenario=next;
  for(const name of ['message','factor','wiener'] as const)el(`${name}-tab`).setAttribute('aria-pressed',String(next===name));
  const factor=next==='factor',wiener=next==='wiener',width=field<HTMLInputElement>('width'),preset=field<HTMLSelectElement>('preset');
  el('prefix-control').hidden=next!=='message';preset.value='default';preset.disabled=wiener;el('preset-note').textContent=wiener?'No lattice in this scenario':'';
  width.min=wiener?'16':'8';width.max=wiener?String(Number(field<HTMLSelectElement>('key-size').value)/2):'200';width.step=wiener?'1':'8';width.value=wiener?'96':factor?'80':'64';
  el('width-title').childNodes[0].textContent=wiener?'Private exponent width ':factor?'Unknown factor low bits ':'Unknown message low bits ';el('width-min').textContent=wiener?'16 bits':'8 bits';el('width-max').textContent=wiener?`${width.max} bits`:'200 bits';
  el('challenge-title').textContent=wiener?'One dangerously short secret.':factor?'One leaked prefix.':'One small unknown.';
  el('scenario-description').textContent=wiener?'Signing and decryption get faster with a short d—but e/N then exposes d through a short ladder of rational approximations. Widen d and watch the guarantee end without mistaking a miss for safety.':factor?'The high bits of the larger prime are disclosed. Recover its missing low bits and verify both factors against the public modulus.':'You know the prefix. A fresh suffix is encrypted with textbook RSA. Can public information recover the missing bits?';
  el('known-label').textContent=wiener?'PUBLIC FRACTION':factor?'KNOWN PRIME HIGH BITS':'KNOWN PREFIX';el('known-note').textContent=wiener?'Attacker knows e and N':factor?'Hint aligned to X':'Public information';el('unknown-title').textContent=wiener?'PRIVATE EXPONENT d':factor?'UNKNOWN PRIME LOW BITS':'UNKNOWN SUFFIX';
  el('equation').innerHTML=wiener?'e/N ≈ k/d <span>continued fractions</span>':factor?'f(x) = pHigh + x ≡ 0 <span>mod p</span>':'f(x) = (A + x)³ − c ≡ 0 <span>mod N</span>';
  el('equation-note').textContent=wiener?'Euclid lists convergents kᵢ/dᵢ. A row wins only when its reconstructed φ(N) produces exact factors.':factor?'The divisor p is unknown. Its high bits are public, and its low bits are the small root.':'The full message is large. Only x, the unknown suffix, needs to be small.';
  el('exponent').textContent=wiener?'Large e':factor?'Not used':'e = 3';el('model-note').textContent=wiener?'The attack worker receives exactly { scenario, N, e }. It never receives d, p, q, a simulator seed, or an oracle closure.':factor?'The worker receives N, pHigh, the unknown width, and the larger-prime promise. It receives neither factor.':'The worker receives N, e, ciphertext, prefix, and suffix width. It receives no private key or secret suffix.';
  const options=preset.options;options[0].textContent=`Default · n = ${factor?6:8}`;options[1].textContent='Compact · n = 4';options[2].textContent=`Deeper · n = ${factor?10:12}`;previousPreset='default';
  el('wiener-ladder-live').hidden=!wiener;el('wiener-details').hidden=!wiener;el('wiener-evidence').hidden=!wiener;el('lattice-lessons').hidden=wiener;el('wiener-lesson').hidden=!wiener;el('learn-title').textContent=wiener?'The public fraction points at the private key.':'Too large for a cube root. Small enough for a lattice.';
  el('prediction-title').textContent=wiener?'Wiener sufficient bound':'Conservative sufficient bound';el('certificate-title').textContent=wiener?'Public factor and RSA checks':'Computed vector';
  const labels=wiener?['Public key','Euclid ladder','Candidate φ(N)','Exact factors','Public checks']:['Public challenge','Integer lattice','Exact LLL','Integer roots','Public check'];document.querySelectorAll('.pipeline li').forEach((node,i)=>node.innerHTML=`<span>${i+1}</span>${labels[i]}`);
  el('basis-content').innerHTML=wiener?'<p>No lattice is constructed in this scenario; the attack is exact continued fractions.</p>':'<p>Run the attack to inspect the integer lattice.</p>';el('reduction-content').innerHTML=wiener?'<p>No LLL reduction is used. Euclid generates each convergent directly.</p>':'<p>Run the attack to inspect its reduction trace.</p>';el('roots-content').innerHTML=wiener?'<p>Factor reconstruction replaces polynomial root isolation in this scenario.</p>':'<p>Run the attack to inspect root isolation and exact candidate checks.</p>';
  illustration();buildChallenge(true);
}
function startAttack() {
  if(!challenge)return;const wiener=challenge.scenario==='wiener';retire(wiener?'Expanding e/N into exact convergents…':'Constructing the scaled integer lattice…');drawPublic();
  const id=runId,payload={runId:id,challenge:allowlistChallenge(challenge),params:params(),ms:Number(field<HTMLSelectElement>('budget').value)};
  setStatus(wiener?'Expanding e/N into exact convergents…':'Constructing the scaled integer lattice…','running');el<HTMLButtonElement>('run').disabled=true;el('cancel').hidden=false;
  attackWorker=new Worker(new URL('./workers/attack.worker.ts',import.meta.url),{type:'module'});
  const stages=[{prefix:'Constructing',step:1},{prefix:'Reducing',step:2},{prefix:'Independently',step:2},{prefix:'Isolating',step:3}],started=performance.now();
  attackWorker.onmessage=event=>{
    if(event.data.runId!==runId)return;const data=event.data;
    if(data.type==='wiener-row') {
      appendWienerRow(data.row);setStatus(`Testing convergent ${data.row.i}: ${data.row.reason}`,'running');document.querySelectorAll<HTMLElement>('.pipeline li').forEach((x,i)=>{x.classList.toggle('complete',i<Math.min(4,data.row.product?4:data.row.divides?3:2));x.classList.toggle('active',i===Math.min(4,data.row.product?4:data.row.divides?3:2));});
    } else if(data.type==='progress') {
      setStatus(data.stage,'running');const step=stages.find(s=>data.stage.startsWith(s.prefix))?.step??1;
      document.querySelectorAll<HTMLElement>('.pipeline li').forEach((x,i)=>{x.classList.toggle('complete',i<step);x.classList.toggle('active',i===step);});
    } else if(data.type==='result') {stopAttack();result=data.result;drawResult();el<HTMLButtonElement>('run').disabled=false;}
    else if(data.type==='error') {stopAttack();const shape=challenge!.scenario==='wiener'?'continued-fraction ladder':`dimension ${(challenge!.scenario==='message'?3:1)*params().m+params().t}`;setStatus(`${data.status}: ${data.message} (stage: ${data.stage}; ${shape}; elapsed ${(performance.now()-started).toFixed(0)} ms; budget ${payload.ms} ms).${data.status==='resource-limit'?' This is not a completed search.':''}`,data.status);el<HTMLButtonElement>('run').disabled=false;el('recovery').textContent=data.status==='resource-limit'?'— Resource limit; incomplete':'! '+data.status;}
  };
  attackWorker.onerror=()=>{if(id!==runId)return;stopAttack();setStatus('Integrity error: attack worker could not complete.','integrity-error');el<HTMLButtonElement>('run').disabled=false;};
  timer=setTimeout(()=>{if(id!==runId)return;const stage=el('status').textContent,shape=challenge!.scenario==='wiener'?'continued-fraction ladder':`dimension ${(challenge!.scenario==='message'?3:1)*params().m+params().t}`;stopAttack();setStatus(`Resource limit: worker terminated after ${payload.ms/1000} seconds during ${stage} (${shape}). This is not a completed root search.`,'resource-limit');el('recovery').textContent='— Resource limit; incomplete';el<HTMLButtonElement>('run').disabled=false;},payload.ms);
  attackWorker.postMessage(payload);
}
function appendWienerRow(row:WienerRow) {
  el('wiener-live-rows').querySelector('[data-placeholder]')?.remove();const tr=document.createElement('tr');tr.className=row.product?'wiener-row-win':'wiener-row-fail';tr.dataset.row=String(row.i);tr.title=row.reason;
  for(const value of [String(row.i),String(row.a),`${row.k}/${row.d}`,row.reason]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  el('wiener-live-rows').append(tr);el('wiener-live').textContent=row.product?`Private exponent recovered at convergent ${row.i}.`:`Tested convergent ${row.i}: ${row.reason}.`;
}
function matrixTable(B:bigint[][],labels:string[],name:string,scaled=true) {
  return `<div class="matrix-scroll" tabindex="0" role="region" aria-label="${name}"><table><caption>${name} · exact integer coefficients</caption><thead><tr><th scope="col">Row</th>${B[0].map((_,i)=>`<th scope="col">${scaled?`x^${i} · X^${i}`:`Original row ${i+1}`}</th>`).join('')}</tr></thead><tbody>${B.map((row,i)=>`<tr><th scope="row">${escape(labels[i]??`b${i+1}`)}</th>${row.map(v=>`<td><code>${v}</code></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function integrityFailure(message:string) {
  retire('');
  setStatus(`Integrity error: ${message}`,'integrity-error');
  el('recovery').textContent='! Recovery rejected: integrity error';
  el('recovery').dataset.value='false';
  el('recovery-note').textContent='No valid recovery result is available. Reset or run a new computation.';
  el<HTMLButtonElement>('run').disabled=!challenge;
}
function drawResult() {
  if(!result || !challenge)return;if(result.scenario==='wiener'&&challenge.scenario==='wiener'){drawWienerResult(result,challenge);return;}if(result.scenario==='wiener'||challenge.scenario==='wiener'){integrityFailure('Worker result scenario did not match the public challenge.');return;}const r=result,c=challenge;selectedRow=0;traceIndex=0;
  if(r.status==='verified-recovery' && (r.recovered===null || !verifyCandidate(c,r.recovered))) {
    integrityFailure('The returned candidate failed independent public verification.');return;
  }
  if(r.status==='no-verified-root-found' && r.searchComplete && r.rows.some(row=>row.certificate.satisfied)) {
    // The simulator constructed a valid promised target. A completed search
    // of a certified row must find it; this is an integrity defect, not a miss.
    integrityFailure('A completed certified search missed this simulator’s valid promised root.');return;
  }
  const success=r.status==='verified-recovery';setStatus(success?`Verified recovery · ${r.runtimeMs.toFixed(0)} ms · ${r.reduction.swaps} swaps · ${r.reduction.reductions} row reductions`:r.status==='resource-limit'?'Resource limit: integer-root search is incomplete.':'No verified root was found by this run. This does not prove that the message or key is secure.',r.status);
  document.querySelectorAll('.pipeline li').forEach(x=>x.classList.toggle('complete',success));
  el('recovery').dataset.value=String(success);el('recovery').textContent=success?'! Verified recovery · confidentiality lost':r.status==='resource-limit'?'— Resource limit; incomplete':'— No verified root found';
  el('recovery-note').textContent=success?(c.scenario==='message'?'The recovered suffix passes exact public re-encryption.':'The recovered larger factor matches the hint and divides N exactly.'):'This run does not establish security or that no root exists.';
  el<HTMLButtonElement>('export').disabled=false;
  if(success && r.recovered!==null) {
    el('reveal').hidden=false;const x=r.recovered;
    el('reveal-title').textContent=c.scenario==='message'?'Suffix recovered without the private key.':'Both factors recovered from the high-bit hint.';
    el('recovered-label').textContent=c.scenario==='message'?'RECOVERED SUFFIX · FIXED-WIDTH HEX':'RECOVERED LOW BITS · FIXED-WIDTH HEX';
    el('recovered-hex').textContent=`0x${x.toString(16).padStart(Math.ceil(c.suffixBits/4),'0')}`;
    if(c.scenario==='message') {
      const M=c.prefixValue*r.derived.X+x;
      el('reveal-description').textContent=`${roundTrip?'DECRYPTS CORRECTLY — ':''}SUFFIX RECOVERED WITHOUT THE PRIVATE KEY`;
      el('negative-claim').textContent='A correct encryption/decryption round trip does not establish confidentiality.';
      el('qualification').textContent='This attack knows the prefix and recovers the missing suffix. It does not recover an arbitrary message from its ciphertext.';
      el('reveal-description').insertAdjacentHTML('afterend',`<dl class="reveal-checks"><dt>Recovered integer suffix</dt><dd>${exact(x,'recovered-x')}</dd><dt>Recovered message M = A + x</dt><dd>${exact(M,'recovered-M')}</dd><dt>Public re-encryption M³ mod N</dt><dd>${exact(powMod(M,3n,c.N),'reencrypted')}</dd><dt>Recovered bits (authoritative)</dt><dd><code class="exact">${x.toString(2).padStart(c.suffixBits,'0')}</code></dd></dl>`);
    } else {
      const p=c.pHigh+x,q=c.N/p;el('reveal-description').textContent='HINT MATCHES — FACTORS MULTIPLY TO N';
      el('negative-claim').textContent='A passing factor-product check confirms recovery; it does not make the key confidential.';
      el('qualification').textContent='The attack needed high bits of the larger prime. It does not factor arbitrary RSA moduli without that leakage.';
      el('reveal-description').insertAdjacentHTML('afterend',`<dl class="reveal-checks"><dt>Recovered larger factor p</dt><dd>${exact(p,'recovered-p')}</dd><dt>Recovered other factor q</dt><dd>${exact(q,'recovered-q')}</dd><dt>Exact product p · q</dt><dd>${exact(p*q,'factor-product')}</dd><dt>Recovered integer low bits</dt><dd>${exact(x,'recovered-x')}</dd></dl>`);
    }
    simulator.postMessage({runId,type:'check',recovered:x});
  }
  el('basis-content').innerHTML=`<p>Rows are the integer coefficients of g(Xz). Row labels describe their generating polynomials. No completed row is reduced modulo N.</p>${matrixTable(r.lattice.B,r.lattice.labels,'Original scaled basis')}${matrixTable(r.reduction.B,[],'Reduced basis')}${matrixTable(r.reduction.U,[],'Integer transformation U',false)}<p class="check-line">✓ Independently verified: B_reduced = U · B_original; det(U) = ${r.verified.detU}; full size reduction; all Lovász inequalities; full rank and exact determinant.</p><dl><dt>Expected |det(B)|</dt><dd>${exact(r.lattice.D)}</dd></dl><p>The first reduced vector is not necessarily a shortest lattice vector.</p>`;
  el('reduction-content').innerHTML=`<p>${r.reduction.events} actual events; ${r.reduction.reductions} reductions; ${r.reduction.swaps} swaps. ${r.reduction.traceTruncated?`Trace truncated to the first ${r.reduction.trace.length} events.`:'Complete operation trace recorded.'} Half-integer ties round away from zero. δ_LLL = 3/4.</p><p>Follow one coefficient through the actual row operations. Every displayed value is replayed from the original integer basis; the same operation is applied to U.</p><div class="trace-controls"><button id="trace-prev">← Previous</button><label for="trace-position">Recorded event <input id="trace-position" type="range" min="0" max="${r.reduction.trace.length-1}" value="0"></label><button id="trace-next">Next →</button></div><label for="trace-column">Inspect coefficient column</label><select id="trace-column">${r.lattice.B[0].map((_,i)=>`<option value="${i}">Degree ${i} · scaled by X^${i}</option>`).join('')}</select><div id="trace-event" class="trace-event"></div>`;
  el('trace-prev').onclick=()=>{traceIndex=Math.max(0,traceIndex-1);drawTrace();};el('trace-next').onclick=()=>{traceIndex=Math.min(r.reduction.trace.length-1,traceIndex+1);drawTrace();};
  field<HTMLInputElement>('trace-position').oninput=()=>{traceIndex=Number(field<HTMLInputElement>('trace-position').value);drawTrace();};field<HTMLSelectElement>('trace-column').onchange=drawTrace;drawTrace();
  el('roots-content').innerHTML=`<label for="row-select">Select a reduced row</label><select id="row-select">${r.rows.map((_,i)=>`<option value="${i}">${i===0?'First reduced vector':`Reduced row ${i+1}`}</option>`).join('')}</select><div id="selected-row"></div><h3>Exact root-search record</h3><p>Policy: first reduced row, then ascending row index; stop after a publicly verified target or a resource limit. Only searched rows have root results. Roots were isolated by square-free Sturm sequences over (lo−1/2, hi+1/2), with one-sided endpoint variations, then tested against the original polynomial.</p><ul>${r.searches.map(s=>`<li>Row ${s.row+1}: ${s.nodes} interval nodes; ${s.complete?'bounded row search complete':'INCOMPLETE'}; integer roots: ${s.roots.length?s.roots.map(v=>`${v}`).join(', '):'none'}.</li>`).join('')}</ul><p>Candidate checks: ${r.candidates.length?r.candidates.map(v=>`x = ${v.x}, row ${v.row+1}: ${v.valid?'publicly verified':'rejected'}`).join('; '):'no integer candidates returned'}. ${success?'Stopped after verified recovery; remaining rows were not searched.':r.searchComplete?'All declared rows were searched.':'Search incomplete; no exhaustive claim.'}</p>`;
  field<HTMLSelectElement>('row-select').onchange=()=>{selectedRow=Number(field<HTMLSelectElement>('row-select').value);drawRow();};drawRow();
}
function drawWienerResult(r:WienerResult,c:Extract<Challenge,{scenario:'wiener'}>) {
  if(!validateWienerResult(c,r)){integrityFailure('The Wiener ladder failed independent public verification.');return;}
  if(r.searchComplete&&!wienerReveal){
    setStatus('Checking the completed public ladder against the simulator reveal…','running');
    el<HTMLButtonElement>('export').disabled=true;
    simulator.postMessage({runId,type:'check',recovered:r.recovered?.d??null});
    const checkingId=runId;timer=setTimeout(()=>{if(checkingId===runId)integrityFailure('The simulator did not return its post-run evidence.');},15000);
    return;
  }
  const wienerSuccess=r.status==='verified-recovery';
  setStatus(wienerSuccess?`Private exponent recovered from the public key · ${r.testedCount} convergents · ${r.runtimeMs.toFixed(0)} ms`:r.status==='resource-limit'?'Resource limit: continued-fraction search is incomplete.':`No convergent factored N after ${r.testedCount} rows. This is not a safety result.`,r.status);
  document.querySelectorAll('.pipeline li').forEach((node,i)=>node.classList.toggle('complete',r.searchComplete||i<r.testedCount));
  el('recovery').dataset.value=String(wienerSuccess);el('recovery').textContent=wienerSuccess?'! PRIVATE KEY RECOVERED FROM THE PUBLIC KEY':r.status==='resource-limit'?'— Resource limit; incomplete':'! NOT RECOVERED BY THIS METHOD — NOT A SAFETY RESULT';
  el('recovery-note').textContent=wienerSuccess?'The recovered d reconstructed exact factors and passed all public checks.':r.status==='resource-limit'?'The worker stopped before completing the ladder.':'Every convergent was rejected; this says nothing about stronger small-d attacks.';
  el('certificate').textContent=wienerSuccess?'✓ p·q, inverse, and round trip verified':r.status==='resource-limit'?'Incomplete':'Awaiting simulator reveal checks';el('certificate').dataset.value=wienerSuccess?'true':'pending';
  el('certificate-note').textContent=wienerSuccess?'All three checks were recomputed from the public key and recovered candidate.':'A completed negative ladder still needs the simulator’s post-run key checks.';
  el<HTMLButtonElement>('export').disabled=!r.searchComplete;
  el('wiener-content').innerHTML=`<p>Exact Euclidean continued fraction of e/N. Tested ${r.testedCount} rows; Lemma 16.6 bound: ${r.lemmaBound}. A grey ✕ names the failed exact condition; the alarm row is the only row that factors N.</p><div class="matrix-scroll" tabindex="0" role="region" aria-label="Complete continued-fraction ladder"><table><caption>Convergents and exact factor reconstruction</caption><thead><tr><th scope="col">i</th><th scope="col">aᵢ</th><th scope="col">kᵢ</th><th scope="col">dᵢ</th><th scope="col">Divides?</th><th scope="col">Δ square?</th><th scope="col">p·q=N?</th><th scope="col">Result</th></tr></thead><tbody>${r.rows.map(row=>`<tr class="${row.product?'wiener-row-win':'wiener-row-fail'}" title="${escape(row.reason)}"><td>${row.i}</td><td>${row.a}</td><td>${row.k}</td><td>${row.d}</td><td>${row.divides?'yes':'no'}</td><td>${row.square?'yes':'no'}</td><td>${row.product?'yes':'no'}</td><td>${escape(row.reason)}</td></tr>`).join('')}</tbody></table></div>`;

}
function drawWienerReveal(reveal:WienerReveal) {
  if(!result||result.scenario!=='wiener'||!challenge||challenge.scenario!=='wiener')return;
  if(!validateWienerReveal(challenge,result,reveal)){integrityFailure('The simulator reveal failed independent boundary or RSA checks.');return;}
  wienerReveal=reveal;drawWienerResult(result,challenge);
  const recovered=result.recovered!==null,phi=(reveal.p-1n)*(reveal.q-1n);
  el('prediction').dataset.value=String(reveal.insideGuarantee);el('prediction').textContent=reveal.insideGuarantee?'✓ Inside Wiener’s guarantee: 81·d⁴ < N':'— Outside Wiener’s sufficient guarantee';el('prediction-note').textContent=`Revealed d has ${reveal.dBits} bits; exact D = ${reveal.boundary}. The bound is sufficient, not necessary.`;
  el('certificate').dataset.value='true';el('certificate').textContent='✓ Public key and random-message round trip verified';el('certificate-note').textContent=`p·q = N, e·d ≡ 1 mod φ(N), and (m^e)^d ≡ m for the simulator’s fresh random m.`;
  const revealElement=el('reveal');revealElement.hidden=false;revealElement.dataset.outcome=recovered?'recovered':'not-recovered';el('reveal-eyebrow').textContent=recovered?'ALARM / PRIVATE KEY EXPOSED':'AMBER / METHOD COMPLETED';
  el('reveal-title').textContent=recovered?'Private exponent recovered from public information.':'No convergent recovered d — this is not a safety result.';
  el('reveal-description').textContent=recovered?'PRIVATE KEY RECOVERED FROM THE PUBLIC KEY':'NOT RECOVERED BY THIS METHOD — NOT A SAFETY RESULT';el('recovered-label').textContent='SIMULATOR d · REVEALED ONLY AFTER THE RUN';el('recovered-hex').textContent=reveal.d.toString();
  el('negative-claim').textContent="Surviving Wiener's attack does not make a small private exponent safe.";
  el('qualification').textContent=`The revealed d is ${reveal.belowBonehDurfee?'below':'not below'} N^0.292. Boneh–Durfee is cited for that published range but is not run here.`;
  el('reveal-description').insertAdjacentHTML('afterend',`<dl class="reveal-checks"><dt>Private exponent d</dt><dd>${exact(reveal.d,'wiener-secret-d')}</dd><dt>Recovered d (attacker)</dt><dd>${result.recovered?exact(result.recovered.d,'recovered-d'):'No convergent accepted'}</dd><dt>Factor p</dt><dd>${exact(reveal.p,'wiener-p')}</dd><dt>Factor q</dt><dd>${exact(reveal.q,'wiener-q')}</dd><dt>p · q</dt><dd>${exact(reveal.p*reveal.q,'wiener-product')}</dd><dt>(e·d) mod φ(N)</dt><dd>${exact(challenge.e*reveal.d%phi,'wiener-inverse-check')}</dd><dt>Random message m</dt><dd>${exact(reveal.verification.message,'wiener-message')}</dd><dt>m^e mod N</dt><dd>${exact(reveal.verification.ciphertext,'wiener-ciphertext')}</dd><dt>(m^e)^d mod N</dt><dd>${exact(reveal.verification.decrypted,'wiener-decrypted')}</dd><dt>Wiener inequality</dt><dd id="wiener-guarantee-check">${reveal.insideGuarantee?'81·d⁴ < N':'81·d⁴ ≥ N'}</dd><dt>Boneh–Durfee comparison</dt><dd id="boneh-durfee-check">${reveal.belowBonehDurfee?'d^250 < N^73':'d^250 ≥ N^73'}</dd></dl>`);
}
function drawRow() {
  if(!result||result.scenario==='wiener')return;const row=result.rows[selectedRow],cert=row.certificate;
  el('certificate').textContent=cert.satisfied?'✓ Norm certificate satisfied':'— Norm certificate not satisfied';el('certificate').dataset.value=String(cert.satisfied);
  el('certificate-note').textContent=`Selected row ${selectedRow+1}: n · S ${cert.satisfied?'<':'≥'} ${scenario==='message'?'N^(2m)':'N^m'}. ${scenario==='factor'?'Conditional on the larger-prime promise.':''}`;
  el('selected-row').innerHTML=`<h3>${selectedRow===0?'First reduced vector':`Reduced row ${selectedRow+1}`}</h3><p>The coefficient at degree ℓ is vℓ / X^ℓ, checked for exact divisibility. This original polynomial is preserved for the certificate; a separate primitive, square-free copy is used for root search.</p><dl><dt>Original vector v [degree ascending]</dt><dd><code class="exact" id="selected-vector">${row.v.join(', ')}</code></dd><dt>h(x) coefficients [degree ascending]</dt><dd><code class="exact" id="selected-polynomial">${row.h.join(', ')}</code></dd><dt>Squared norm S = Σvℓ²</dt><dd>${exact(cert.S,'cert-S')}</dd><dt>Left: n · S</dt><dd>${exact(cert.left,'cert-left')}</dd><dt>Right: ${scenario==='message'?'N^(2m)':'N^m'}</dt><dd>${exact(cert.right,'cert-right')}</dd></dl><p id="certificate-comparison">${cert.satisfied?'✓':'—'} n · S ${cert.satisfied?'<':'≥'} ${scenario==='message'?'N^(2m)':'N^m'} · ${cert.satisfied?'sufficient norm certificate':'this certificate does not establish an integer root'}</p>`;
  if(result.recovered!==null)el('selected-row').insertAdjacentHTML('beforeend',`<div class="root-bridge"><h3>Evaluate this polynomial at the publicly recovered low bits</h3><dl><dt>Recovered x</dt><dd>${exact(result.recovered,'row-recovered-x')}</dd><dt>Exact h(x)</dt><dd>${exact(evaluate(row.h,result.recovered),'row-evaluation')}</dd></dl><p>A zero value is an integer root of this original polynomial. The final RSA or factor check establishes whether that root solves the public challenge.</p></div>`);
}
function drawTrace() {
  if(!result||result.scenario==='wiener')return;const e=result.reduction.trace[traceIndex];if(!e)return;field<HTMLInputElement>('trace-position').value=String(traceIndex);
  el('trace-event').innerHTML=`<p class="eyebrow">EVENT ${traceIndex+1} / ${result.reduction.trace.length}</p><h3>${e.type==='reduce'?`b${e.k+1} ← b${e.k+1} − (${e.multiplier}) · b${e.j+1}`:e.type==='swap'?`Swap rows ${e.j+1} and ${e.k+1}`:`Keep row ${e.k+1}; advance`}</h3>${e.type==='reduce'?'<p>An exact integer row operation is mirrored in U and preserves the lattice.</p>':`<p>Exact Lovász comparison: left ${e.type==='swap'?'&lt;':'≥'} right.</p><dl><dt>Left rational operand</dt><dd><code class="exact">${escape(e.lhs)}</code></dd><dt>Right rational operand</dt><dd><code class="exact">${escape(e.rhs)}</code></dd></dl>`}`;
  const column=Number(field<HTMLSelectElement>('trace-column').value),values=result.lattice.B.map(row=>row[column]);
  for(const previous of result.reduction.trace.slice(0,traceIndex)) {
    if(previous.type==='reduce')values[previous.k]-=previous.multiplier!*values[previous.j];
    else if(previous.type==='swap')[values[previous.k],values[previous.j]]=[values[previous.j],values[previous.k]];
  }
  const before=values[e.k],source=values[e.j],after=e.type==='reduce'?before-e.multiplier!*source:e.type==='swap'?source:before;
  el('trace-event').insertAdjacentHTML('beforeend',`<div class="coefficient-step" data-operation="${e.type}"><p class="eyebrow">ACTUAL COEFFICIENT · DEGREE ${column}</p><dl><dt>Row b${e.k+1} before</dt><dd>${exact(before,'trace-before')}</dd><dt>Row b${e.j+1} ${e.type==='swap'?'exchanged with it':'source'}</dt><dd>${exact(source,'trace-source')}</dd>${e.type==='reduce'?`<dt>Integer multiplier q</dt><dd>${exact(e.multiplier!,'trace-multiplier')}</dd>`:''}<dt>Row b${e.k+1} after</dt><dd>${exact(after,'trace-after')}</dd></dl><p>${e.type==='reduce'?'After = before − q × source. Every column undergoes this same exact integer operation.':e.type==='swap'?'The two complete rows exchange places; their entries are never rounded.':'The Lovász inequality holds. This step keeps both rows unchanged.'}</p></div>`);
  el<HTMLButtonElement>('trace-prev').disabled=traceIndex===0;el<HTMLButtonElement>('trace-next').disabled=traceIndex===result.reduction.trace.length-1;
}
el('message-tab').onclick=()=>chooseScenario('message');el('factor-tab').onclick=()=>chooseScenario('factor');el('wiener-tab').onclick=()=>chooseScenario('wiener');
el('run').onclick=()=>{document.querySelectorAll('.reveal-checks').forEach(x=>x.remove());startAttack();};
el('cancel').onclick=()=>{retire('Cancelled: the worker was terminated. No completed root-search claim.');setStatus('Cancelled: the worker was terminated. No completed root-search claim.','cancelled');el<HTMLButtonElement>('run').disabled=!challenge;};
el('new').onclick=()=>{retire('Previous result retired: generating a new key and challenge.');buildChallenge(true);};
field<HTMLInputElement>('prefix').addEventListener('input',()=>{retire('Previous result retired: public challenge changed.');buildChallenge();});
field<HTMLInputElement>('width').addEventListener('input',()=>{retire(scenario==='wiener'?'Previous result retired: private-exponent width changed, so a fresh key is required.':'Previous result retired: public challenge changed. Width changes create related challenges.');buildChallenge(scenario==='wiener');});
let previousPreset=field<HTMLSelectElement>('preset').value;
field<HTMLSelectElement>('preset').onchange=()=>{if(field<HTMLSelectElement>('preset').value===previousPreset)return;previousPreset=field<HTMLSelectElement>('preset').value;retire('Previous result retired: lattice parameters changed.');drawPublic();el<HTMLButtonElement>('run').disabled=!challenge;};
field<HTMLSelectElement>('budget').onchange=()=>{retire('Previous result retired: resource budget changed.');if(!challenge)buildChallenge();else el<HTMLButtonElement>('run').disabled=false;};
field<HTMLSelectElement>('key-size').onchange=()=>{retire('Previous result retired: modulus size changed.');if(scenario==='wiener'){const width=field<HTMLInputElement>('width');width.max=String(Number(field<HTMLSelectElement>('key-size').value)/2);el('width-max').textContent=`${width.max} bits`;if(Number(width.value)>Number(width.max))width.value=width.max;}buildChallenge(true);};
el('wiener-evidence').onclick=()=>{if(scenario!=='wiener')return;retire('Loading the pinned no-recovery evidence key…');challenge=null;field<HTMLSelectElement>('key-size').value='1024';const width=field<HTMLInputElement>('width');width.max='512';width.value='258';el('width-max').textContent='512 bits';illustration();el<HTMLButtonElement>('run').disabled=true;setStatus('Loading the pinned no-recovery evidence key…','generating');simulator.postMessage({runId,type:'wiener-fixture'});};
el('reset').onclick=()=>{
  retire('Reset: fresh session key and challenge.');simulator.terminate();simulator=new Worker(new URL('./workers/simulator.worker.ts',import.meta.url),{type:'module'});bindSimulator();
  field<HTMLInputElement>('prefix').value='crypto-lab://known-prefix/';field<HTMLSelectElement>('key-size').value='512';field<HTMLSelectElement>('preset').value='default';field<HTMLSelectElement>('budget').value='15000';previousPreset='default';
  if(scenario!=='message')chooseScenario('message');else{field<HTMLInputElement>('width').min='8';field<HTMLInputElement>('width').max='200';field<HTMLInputElement>('width').step='8';field<HTMLInputElement>('width').value='64';buildChallenge(true);}
};
el('export').onclick=()=>{
  if(!result)return;const blob=new Blob([json({...result,runId,prefixText:scenario==='message'?field<HTMLInputElement>('prefix').value:undefined,integerEncoding:'Decimal strings; no simulator-only secret fields.',budgetMs:Number(field<HTMLSelectElement>('budget').value)})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`rsa-small-roots-${scenario}-${runId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
bindSimulator();illustration();buildChallenge(true);
