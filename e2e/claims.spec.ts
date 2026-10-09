import { expect,test,type Page } from '@playwright/test';
import { boot,run } from './gate';
const read=async(page:Page,id:string)=>BigInt((await page.locator(`#${id}`).textContent())!.trim());
const pow=(a:bigint,e:bigint,n:bigint)=>{let y=1n;while(e){if(e&1n)y=y*a%n;a=a*a%n;e>>=1n;}return y;};
async function inspect(page:Page,id:string) {if(!(await page.locator(`#${id}-details`).getAttribute('open')!==null))await page.locator(`#${id}-details>summary`).click();}
test('message recovery is re-encrypted from displayed public inputs and defeats confidentiality despite the round trip',async({page})=>{
  await boot(page);await inspect(page,'challenge');const N=await read(page,'public-N'),A=await read(page,'public-A'),c=await read(page,'public-c');
  expect(N.toString(2).length).toBe(512);expect(A**3n>=N).toBe(true);
  await run(page);await expect(page.locator('#recovery')).toHaveAttribute('data-value','true');
  const x=await read(page,'recovered-x'),k=await read(page,'public-k'),M=await read(page,'recovered-M');
  expect(x>=0n && x<2n**k).toBe(true);expect(M).toBe(A+x);expect(pow(M,3n,N)).toBe(c);expect(await read(page,'reencrypted')).toBe(c);
  await expect(page.locator('#reveal-description')).toContainText('DECRYPTS CORRECTLY — SUFFIX RECOVERED WITHOUT THE PRIVATE KEY');
  await expect(page.locator('#negative-claim')).toBeVisible();await expect(page.locator('#negative-claim')).toHaveText('A correct encryption/decryption round trip does not establish confidentiality.');
  await expect(page.locator('#qualification')).toContainText('knows the prefix');
  expect((await page.locator('#recovered-hex').textContent())!.length).toBe(2+Number(k)/4);
});
test('factor recovery multiplies to displayed N and matches the promised high bits',async({page})=>{
  await boot(page);await page.locator('#factor-tab').click();await expect(page.locator('#run')).toBeEnabled();await inspect(page,'challenge');await run(page);
  const N=await read(page,'public-N'),hint=await read(page,'public-hint'),X=await read(page,'public-X'),p=await read(page,'recovered-p'),q=await read(page,'recovered-q');
  expect(p*q).toBe(N);expect(p>q && p*p>=N).toBe(true);expect(p/X*X).toBe(hint);expect(await read(page,'factor-product')).toBe(N);
  expect(p-hint).toBe(await read(page,'recovered-x'));await expect(page.locator('#recovery')).toHaveAttribute('data-value','true');
});
test('finite sufficient prediction has the exact maximal integer and bit width',async({page})=>{
  await boot(page);await inspect(page,'challenge');
  for(const factor of [false,true]){
    if(factor){await page.locator('#factor-tab').click();await expect(page.locator('#run')).toBeEnabled();}
    const N=await read(page,'public-N'),X=await read(page,'public-X'),S=await read(page,'bound-X');
    const [r,m,t,n]=(await page.locator('#public-params').textContent())!.split(',').map(s=>BigInt(s.trim()));
    expect(n).toBe(r*m+t);const Q=n*(n-1n),C=n**n*2n**(n*(n-1n)/2n),E=(factor?1n:2n)*m*n-r*m*(m+1n),R=N**E;
    expect(await read(page,'bound-C')).toBe(C);expect(C*S**Q<R).toBe(true);expect(C*(S+1n)**Q>=R).toBe(true);
    expect(await read(page,'bound-left')).toBe(C*X**Q);expect(await read(page,'bound-right')).toBe(R);
    await expect(page.locator('#prediction')).toHaveAttribute('data-value',String(C*X**Q<R));
    const bits=BigInt(S.toString(2).length-1);expect(C*(2n**bits)**Q<R).toBe(true);expect(C*(2n**(bits+1n))**Q>=R).toBe(true);
  }
});
test('selected vector certificate is recomputed from actual displayed coefficients for both models',async({page})=>{
  await boot(page);await inspect(page,'challenge');
  for(const factor of [false,true]){
    if(factor){await page.locator('#factor-tab').click();await expect(page.locator('#run')).toBeEnabled();}
    await run(page);await inspect(page,'roots');
    const N=await read(page,'public-N'),X=await read(page,'public-X'),[r,m,t,n]=(await page.locator('#public-params').textContent())!.split(',').map(s=>BigInt(s.trim()));
    for(const index of ['0','1']) {
      await page.locator('#row-select').selectOption(index);
      const v=(await page.locator('#selected-vector').textContent())!.split(',').map(x=>BigInt(x.trim())),h=(await page.locator('#selected-polynomial').textContent())!.split(',').map(x=>BigInt(x.trim()));
      const S=v.reduce((s,x)=>s+x*x,0n);expect(BigInt(v.length)).toBe(n);v.forEach((x,i)=>expect(x).toBe(h[i]*X**BigInt(i)));
      expect(await read(page,'cert-S')).toBe(S);expect(await read(page,'cert-left')).toBe(n*S);expect(await read(page,'cert-right')).toBe(N**(factor?m:2n*m));
      await expect(page.locator('#certificate')).toHaveAttribute('data-value',String(n*S<N**(factor?m:2n*m)));
      const x=await read(page,'row-recovered-x'),evaluation=h.reduceRight((value,coefficient)=>value*x+coefficient,0n);
      expect(await read(page,'row-evaluation')).toBe(evaluation);if(index==='0')expect(evaluation).toBe(0n);
    }
  }
});
test('changing mathematical inputs retires a recovery immediately; selecting the same scenario is a no-op',async({page})=>{
  await boot(page);await run(page);await expect(page.locator('#reveal')).toBeVisible();await page.locator('#message-tab').click();await expect(page.locator('#reveal')).toBeVisible();
  await page.locator('#width').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('#recovery')).toHaveText('No result yet');await expect(page.locator('#status')).toContainText('retired');
  await expect(page.locator('#run')).toBeEnabled();await page.locator('#run').click();await page.locator('#preset').selectOption('compact');await expect(page.locator('#recovery')).toHaveText('No result yet');await expect(page.locator('#app')).toHaveAttribute('data-status','idle');
});
test('cancellation, reset, invalid input, and transcript export describe the actual state',async({page})=>{
  await boot(page);await page.locator('#run').click();await page.locator('#cancel').click();await expect(page.locator('#app')).toHaveAttribute('data-status','cancelled');await expect(page.locator('#reveal')).toBeHidden();
  await page.locator('#prefix').fill('x'.repeat(80));await expect(page.locator('#app')).toHaveAttribute('data-status','invalid-input');await expect(page.locator('#run')).toBeDisabled();
  await page.locator('#reset').click();await expect(page.locator('#run')).toBeEnabled();await run(page);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;const stream=await download.createReadStream();let text='';for await(const chunk of stream!)text+=chunk;
  const transcript=JSON.parse(text);expect(transcript.status).toBe('verified-recovery');expect(Object.keys(transcript.challenge).sort()).toEqual(['N','ciphertext','e','prefixValue','scenario','suffixBits']);expect(transcript.reduction.U).toHaveLength(8);
});
test('the actual attack worker payload is public-only, and delayed stale results cannot restore a verdict',async({page})=>{
  await page.addInitScript(()=>{
    const Real=window.Worker;const records:unknown[]=[];(window as unknown as {workerPayloads:unknown[]}).workerPayloads=records;
    window.Worker=class extends Real {
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('attack.worker')){
        const original=this.postMessage.bind(this);this.postMessage=(payload:unknown)=>{records.push(payload);original(payload);};
        this.addEventListener('message',event=>{if(event.data.type==='result'){
          // Capture the registered callback before termination can clear a
          // native Worker's event handler. Replay its exact old public result
          // after the next challenge has arrived, so delivery is observable.
          const callback=this.onmessage,snapshot=event.data;
          (window as unknown as {replayWorkerResult:()=>void}).replayWorkerResult=()=>setTimeout(()=>{
            callback?.call(this,{data:snapshot} as MessageEvent);
            (window as unknown as {staleResultDelivered:boolean}).staleResultDelivered=true;
          },10);
        }});
      }}
    };
  });
  await boot(page);await run(page);const payload=await page.evaluate(()=>(window as unknown as {workerPayloads:{challenge:unknown}[]}).workerPayloads[0]);
  expect(Object.keys(payload.challenge as object).sort()).toEqual(['N','ciphertext','e','prefixValue','scenario','suffixBits']);
  await page.locator('#width').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('#run')).toBeEnabled();
  await page.evaluate(()=>(window as unknown as {replayWorkerResult:()=>void}).replayWorkerResult());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {staleResultDelivered:boolean}).staleResultDelivered)).toBe(true);
  await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('#recovery')).toHaveText('No result yet');await expect(page.locator('#app')).toHaveAttribute('data-status','idle');await expect(page.locator('#status')).toContainText('retired');
});
test('keyboard operation and 320px reflow keep all controls and inspectors reachable',async({page})=>{
  await page.setViewportSize({width:320,height:780});await boot(page);await page.keyboard.press('Tab');await expect(page.locator('.cl-skip-link')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#app')).toBeFocused();
  await page.locator('#run').focus();await page.keyboard.press('Enter');await expect(page.locator('#reveal')).toBeVisible({timeout:30000});await inspect(page,'basis');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.matrix-scroll').first()).toHaveAttribute('tabindex','0');
});
test('resource limit remains an incomplete run and cannot be mistaken for a negative root verdict',async({page})=>{
  await boot(page);await page.locator('#budget').selectOption('1');await run(page);
  await expect(page.locator('#app')).toHaveAttribute('data-status','resource-limit');await expect(page.locator('#recovery')).toContainText('incomplete');
  await expect(page.locator('#status')).toContainText('not a completed root search');await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('#export')).toBeDisabled();
});
test('reduction stepper replays actual coefficient changes from the exported original basis',async({page})=>{
  await boot(page);await run(page);
  const downloading=page.waitForEvent('download');await page.locator('#export').click();const stream=await(await downloading).createReadStream();let text='';for await(const chunk of stream!)text+=chunk;
  const transcript=JSON.parse(text),B:bigint[][]=transcript.lattice.B.map((row:string[])=>row.map(BigInt));
  const events:{type:string;k:number;j:number;multiplier?:string}[]=transcript.reduction.trace;
  expect(events.some(e=>e.type==='reduce')).toBe(true);expect(events.some(e=>e.type==='swap')).toBe(true);expect(events.some(e=>e.type==='keep')).toBe(true);
  await inspect(page,'reduction');const sample=new Set([0,events.findIndex(e=>e.type==='reduce'),events.findIndex(e=>e.type==='swap'),events.findIndex(e=>e.type==='keep'),events.length-1]);
  for(let index=0;index<events.length;index++) {
    const e=events[index],before=B[e.k].slice(),source=B[e.j].slice();
    if(e.type==='reduce')B[e.k]=B[e.k].map((value,column)=>value-BigInt(e.multiplier!)*B[e.j][column]);
    else if(e.type==='swap')[B[e.k],B[e.j]]=[B[e.j],B[e.k]];
    if(!sample.has(index))continue;
    await page.locator('#trace-position').evaluate((element,index)=>{(element as HTMLInputElement).value=String(index);element.dispatchEvent(new Event('input',{bubbles:true}));},index);
    for(const column of [0,B.length-1]) {
      await page.locator('#trace-column').selectOption(String(column));
      expect(await read(page,'trace-before')).toBe(before[column]);expect(await read(page,'trace-source')).toBe(source[column]);expect(await read(page,'trace-after')).toBe(B[e.k][column]);
    }
  }
});
for(const worker of ['attack','simulator'])test(`${worker} integrity failure withdraws the recovery verdict and disables export`,async({page})=>{
  await page.addInitScript((worker)=>{
    const Real=window.Worker;
    window.Worker=class extends Real {
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes(`${worker}.worker`))this.addEventListener('message',event=>{
        if(worker==='attack' && event.data.type==='result')event.data.result.recovered+=1n;
        if(worker==='simulator' && event.data.type==='oracle-check')event.data.matches=false;
      });}
    };
  },worker);
  await boot(page);await run(page);await expect(page.locator('#app')).toHaveAttribute('data-status','integrity-error');
  await expect(page.locator('#recovery')).toHaveAttribute('data-value','false');await expect(page.locator('#recovery')).toContainText('rejected');
  await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('#export')).toBeDisabled();await expect(page.locator('#certificate')).toHaveAttribute('data-value','pending');
  await expect(page.locator('#status')).toContainText(worker==='attack'?'failed independent public verification':'simulator cross-check disagreed');
});
