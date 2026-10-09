import './style.css';
import { allowlistChallenge,derive,verifyCandidate,type Challenge,type Parameters,type AttackResult } from './attacks/public';
import { bitLength,integerRoot,powMod } from './math/integer';
import { evaluate } from './math/polynomial';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const exact=(v:bigint,id='')=>`<code ${id?`id="${id}"`:''} class="exact">${v}</code>`;
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
let scenario:'message'|'factor'='message',runId=0,challenge:Challenge|null=null,result:AttackResult|null=null,roundTrip:boolean|null=null;
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
  runId++;stopAttack();result=null;el('reveal').hidden=true;document.querySelectorAll('.reveal-checks').forEach(x=>x.remove());el<HTMLButtonElement>('export').disabled=true;
  el('certificate').textContent='Run the attack to compute';el('certificate').dataset.value='pending';
  el('recovery').textContent='No result yet';el('recovery').dataset.value='pending';
  el('certificate-note').textContent='A short enough vector proves the modular root is also an integer root.';
  el('recovery-note').textContent='Every candidate must pass the original RSA equation or the hinted-factor check.';
  el('basis-content').innerHTML='<p>Run the attack to inspect the integer lattice.</p>';
  el('reduction-content').innerHTML='<p>Run the attack to inspect its reduction trace.</p>';
  el('roots-content').innerHTML='<p>Run the attack to inspect root isolation and exact candidate checks.</p>';
  document.querySelectorAll('.pipeline li').forEach(x=>x.classList.remove('complete','active'));
  if(reason)setStatus(reason,'idle');
}
function illustration() {
  const width=Number(field<HTMLInputElement>('width').value),p=params(),n=(scenario==='message'?3:1)*p.m+p.t;
  el('width-label').textContent=`${width} bits`;el('unknown-label').textContent=`${width} hidden bits`;
  el('unknown-cells').innerHTML=Array.from({length:8},()=>'<span>?</span>').join('');
  el('range').textContent=`0 ≤ x < 2^${width}`;el('dimension').textContent=`${n} × ${n}`;
}
function buildChallenge(newKey=false) {
  challenge=null;el<HTMLButtonElement>('run').disabled=true;illustration();
  el('prediction').textContent='Preparing the public challenge';el('prediction').dataset.value='pending';
  el('prediction-note').textContent='The exact bound will be recomputed for the new public inputs.';
  el('challenge-content').innerHTML='<p>Preparing a public challenge. Previous public inputs have been retired.</p>';
  if(newKey)setStatus(`Generating a fresh ${field<HTMLSelectElement>('key-size').value}-bit demonstration key…`,'generating');
  simulator.postMessage({runId,type:newKey?'new':'example',scenario,suffixBits:Number(field<HTMLInputElement>('width').value),prefix:field<HTMLInputElement>('prefix').value,bits:Number(field<HTMLSelectElement>('key-size').value)});
  if(generationTimer)clearTimeout(generationTimer);
  generationTimer=setTimeout(()=>{simulator.terminate();challenge=null;setStatus('Key generation reached its 30-second budget. Reset the lab to try again.','resource-limit');},30000);
}
function bindSimulator() {
  simulator.onmessage=event=>{
    const data=event.data;if(data.runId!==runId)return;
    if(data.type==='oracle-check') {
      if(!data.matches && result && result.recovered!==null) integrityFailure('The simulator cross-check disagreed with public recovery.');
      return;
    }
    if(generationTimer)clearTimeout(generationTimer);generationTimer=null;
    if(data.type==='error') {setStatus(data.message,'invalid-input');el('prediction').textContent='Invalid challenge';field<HTMLInputElement>('prefix').setAttribute('aria-invalid','true');return;}
    if(data.type==='challenge') {
      challenge=data.challenge;roundTrip=data.roundTrip;field<HTMLInputElement>('prefix').removeAttribute('aria-invalid');
      drawPublic();el<HTMLButtonElement>('run').disabled=false;
      if(!el('status').textContent?.includes('retired'))setStatus('Ready. Run the attack using only the displayed public information.','idle');
    }
  };
}
function drawPublic() {
  if(!challenge)return;const c=challenge,p=params();let d:ReturnType<typeof derive>;
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
function chooseScenario(next:'message'|'factor') {
  if(next===scenario)return;retire('Previous result retired: attack scenario changed.');scenario=next;
  el('message-tab').setAttribute('aria-pressed',String(next==='message'));el('factor-tab').setAttribute('aria-pressed',String(next==='factor'));
  el('prefix-control').hidden=next==='factor';field<HTMLInputElement>('width').value=next==='message'?'64':'80';field<HTMLSelectElement>('preset').value='default';
  const factor=next==='factor';el('challenge-title').textContent=factor?'One leaked prefix.':'One small unknown.';
  el('scenario-description').textContent=factor?'The high bits of the larger prime are disclosed. Recover its missing low bits and verify both factors against the public modulus.':'You know the prefix. A fresh suffix is encrypted with textbook RSA. Can public information recover the missing bits?';
  el('known-label').textContent=factor?'KNOWN PRIME HIGH BITS':'KNOWN PREFIX';el('known-note').textContent=factor?'Hint aligned to X':'Public information';
  el('equation').innerHTML=factor?'f(x) = pHigh + x ≡ 0 <span>mod p</span>':'f(x) = (A + x)³ − c ≡ 0 <span>mod N</span>';
  el('equation-note').textContent=factor?'The divisor p is unknown. Its high bits are public, and its low bits are the small root.':'The full message is large. Only x, the unknown suffix, needs to be small.';
  el('exponent').textContent=factor?'Not used':'e = 3';el('model-note').textContent=factor?'The worker receives N, pHigh, the unknown width, and the larger-prime promise. It receives neither factor.':'The worker receives N, e, ciphertext, prefix, and suffix width. It receives no private key or secret suffix.';
  const options=field<HTMLSelectElement>('preset').options;options[0].textContent=`Default · n = ${factor?6:8}`;options[1].textContent='Compact · n = 4';options[2].textContent=`Deeper · n = ${factor?10:12}`;previousPreset='default';buildChallenge();
}
function startAttack() {
  if(!challenge)return;retire('Constructing the scaled integer lattice…');drawPublic();
  const id=runId,payload={runId:id,challenge:allowlistChallenge(challenge),params:params(),ms:Number(field<HTMLSelectElement>('budget').value)};
  setStatus('Constructing the scaled integer lattice…','running');el<HTMLButtonElement>('run').disabled=true;el('cancel').hidden=false;
  attackWorker=new Worker(new URL('./workers/attack.worker.ts',import.meta.url),{type:'module'});
  const stages=[{prefix:'Constructing',step:1},{prefix:'Reducing',step:2},{prefix:'Independently',step:2},{prefix:'Isolating',step:3}],started=performance.now();
  attackWorker.onmessage=event=>{
    if(event.data.runId!==runId)return;const data=event.data;
    if(data.type==='progress') {
      setStatus(data.stage,'running');const step=stages.find(s=>data.stage.startsWith(s.prefix))?.step??1;
      document.querySelectorAll<HTMLElement>('.pipeline li').forEach((x,i)=>{x.classList.toggle('complete',i<step);x.classList.toggle('active',i===step);});
    } else if(data.type==='result') {stopAttack();result=data.result;drawResult();el<HTMLButtonElement>('run').disabled=false;}
    else if(data.type==='error') {stopAttack();setStatus(`${data.status}: ${data.message} (stage: ${data.stage}; dimension ${(challenge!.scenario==='message'?3:1)*params().m+params().t}; elapsed ${(performance.now()-started).toFixed(0)} ms; budget ${payload.ms} ms).${data.status==='resource-limit'?' This is not a completed root search.':''}`,data.status);el<HTMLButtonElement>('run').disabled=false;el('recovery').textContent=data.status==='resource-limit'?'— Resource limit; incomplete':'! '+data.status;}
  };
  attackWorker.onerror=()=>{if(id!==runId)return;stopAttack();setStatus('Integrity error: attack worker could not complete.','integrity-error');el<HTMLButtonElement>('run').disabled=false;};
  timer=setTimeout(()=>{if(id!==runId)return;const stage=el('status').textContent;stopAttack();setStatus(`Resource limit: worker terminated after ${payload.ms/1000} seconds during ${stage} Dimension ${(challenge!.scenario==='message'?3:1)*params().m+params().t}. This is not a completed root search.`,'resource-limit');el('recovery').textContent='— Resource limit; incomplete';el<HTMLButtonElement>('run').disabled=false;},payload.ms);
  attackWorker.postMessage(payload);
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
  if(!result || !challenge)return;const r=result,c=challenge;selectedRow=0;traceIndex=0;
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
function drawRow() {
  if(!result)return;const row=result.rows[selectedRow],cert=row.certificate;
  el('certificate').textContent=cert.satisfied?'✓ Norm certificate satisfied':'— Norm certificate not satisfied';el('certificate').dataset.value=String(cert.satisfied);
  el('certificate-note').textContent=`Selected row ${selectedRow+1}: n · S ${cert.satisfied?'<':'≥'} ${scenario==='message'?'N^(2m)':'N^m'}. ${scenario==='factor'?'Conditional on the larger-prime promise.':''}`;
  el('selected-row').innerHTML=`<h3>${selectedRow===0?'First reduced vector':`Reduced row ${selectedRow+1}`}</h3><p>The coefficient at degree ℓ is vℓ / X^ℓ, checked for exact divisibility. This original polynomial is preserved for the certificate; a separate primitive, square-free copy is used for root search.</p><dl><dt>Original vector v [degree ascending]</dt><dd><code class="exact" id="selected-vector">${row.v.join(', ')}</code></dd><dt>h(x) coefficients [degree ascending]</dt><dd><code class="exact" id="selected-polynomial">${row.h.join(', ')}</code></dd><dt>Squared norm S = Σvℓ²</dt><dd>${exact(cert.S,'cert-S')}</dd><dt>Left: n · S</dt><dd>${exact(cert.left,'cert-left')}</dd><dt>Right: ${scenario==='message'?'N^(2m)':'N^m'}</dt><dd>${exact(cert.right,'cert-right')}</dd></dl><p id="certificate-comparison">${cert.satisfied?'✓':'—'} n · S ${cert.satisfied?'<':'≥'} ${scenario==='message'?'N^(2m)':'N^m'} · ${cert.satisfied?'sufficient norm certificate':'this certificate does not establish an integer root'}</p>`;
  if(result.recovered!==null)el('selected-row').insertAdjacentHTML('beforeend',`<div class="root-bridge"><h3>Evaluate this polynomial at the publicly recovered low bits</h3><dl><dt>Recovered x</dt><dd>${exact(result.recovered,'row-recovered-x')}</dd><dt>Exact h(x)</dt><dd>${exact(evaluate(row.h,result.recovered),'row-evaluation')}</dd></dl><p>A zero value is an integer root of this original polynomial. The final RSA or factor check establishes whether that root solves the public challenge.</p></div>`);
}
function drawTrace() {
  if(!result)return;const e=result.reduction.trace[traceIndex];if(!e)return;field<HTMLInputElement>('trace-position').value=String(traceIndex);
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
el('message-tab').onclick=()=>chooseScenario('message');el('factor-tab').onclick=()=>chooseScenario('factor');
el('run').onclick=()=>{document.querySelectorAll('.reveal-checks').forEach(x=>x.remove());startAttack();};
el('cancel').onclick=()=>{retire('Cancelled: the worker was terminated. No completed root-search claim.');setStatus('Cancelled: the worker was terminated. No completed root-search claim.','cancelled');el<HTMLButtonElement>('run').disabled=!challenge;};
el('new').onclick=()=>{retire('Previous result retired: generating a new key and challenge.');buildChallenge(true);};
for(const id of ['prefix','width']) field<HTMLInputElement>(id).addEventListener('input',()=>{retire('Previous result retired: public challenge changed. Width changes create related challenges.');buildChallenge();});
let previousPreset=field<HTMLSelectElement>('preset').value;
field<HTMLSelectElement>('preset').onchange=()=>{if(field<HTMLSelectElement>('preset').value===previousPreset)return;previousPreset=field<HTMLSelectElement>('preset').value;retire('Previous result retired: lattice parameters changed.');drawPublic();el<HTMLButtonElement>('run').disabled=!challenge;};
field<HTMLSelectElement>('budget').onchange=()=>{retire('Previous result retired: resource budget changed.');el<HTMLButtonElement>('run').disabled=!challenge;};
field<HTMLSelectElement>('key-size').onchange=()=>{retire('Previous result retired: modulus size changed.');buildChallenge(true);};
el('reset').onclick=()=>{
  retire('Reset: fresh session key and challenge.');simulator.terminate();simulator=new Worker(new URL('./workers/simulator.worker.ts',import.meta.url),{type:'module'});bindSimulator();
  field<HTMLInputElement>('prefix').value='crypto-lab://known-prefix/';field<HTMLSelectElement>('key-size').value='512';field<HTMLSelectElement>('preset').value='default';field<HTMLSelectElement>('budget').value='15000';previousPreset='default';
  if(scenario!=='message')chooseScenario('message');else{field<HTMLInputElement>('width').value='64';buildChallenge(true);}
};
el('export').onclick=()=>{
  if(!result)return;const blob=new Blob([json({...result,runId,prefixText:scenario==='message'?field<HTMLInputElement>('prefix').value:undefined,integerEncoding:'Decimal strings; no secret or private-key fields.',budgetMs:Number(field<HTMLSelectElement>('budget').value)})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`rsa-small-roots-${scenario}-${runId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
bindSimulator();illustration();buildChallenge(true);
