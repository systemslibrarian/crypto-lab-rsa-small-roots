import { expect,it } from 'vitest';
// @ts-expect-error The runner is deliberately plain Node ESM.
import { validateUnitRun,validateNamedRun } from '../../scripts/mutation-report.mjs';
const unit=(status='failed')=>({status:1,stdout:JSON.stringify({numPassedTests:0,numFailedTests:1,testResults:[{name:'/src/owner.test.ts',assertionResults:[{title:'owns the claim',status,failureMessages:['AssertionError: expected true to be false']}]}]})});
it('mutation gate accepts only the owning assertion and rejects missing, skipped, crashed, or extra tests',()=>{
  expect(()=>validateUnitRun(unit(),'owns the claim','src/owner.test.ts',false)).not.toThrow();
  for(const report of [{...unit(),signal:'SIGTERM'},{...unit(),status:null},unit('skipped'),{status:1,stdout:'{}'}]) expect(()=>validateUnitRun(report,'owns the claim','src/owner.test.ts',false)).toThrow();
  expect(()=>validateNamedRun({status:1,stdout:JSON.stringify({errors:[{message:'server failed'}],suites:[]})},'owns the claim',false)).toThrow();
});
