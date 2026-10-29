import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/deploy.yml', root), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const readme = readFileSync(new URL('README.md', root), 'utf8');
const mutationSource = readFileSync(new URL('scripts/mutations.mjs', root), 'utf8');
const gitignore = readFileSync(new URL('.gitignore', root), 'utf8');

function job(name) {
  const pattern = '\\n  ' + name + ':\\n[\\s\\S]*?(?=\\n  [a-z][a-z0-9-]*:\\n|$)';
  const match = workflow.match(new RegExp(pattern));
  assert.ok(match, `missing ${name} job`);
  return match[0];
}

test('only the deploy job can mint Pages credentials', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));
  assert.match(header, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(header, /pages: write|id-token: write/);
  assert.doesNotMatch(job('build'), /pages: write|id-token: write/);
  assert.match(job('deploy'), /permissions:\n      contents: read\n      pages: write\n      id-token: write\n/);
});

test('every third-party action is pinned to an immutable commit', () => {
  const actions = [...workflow.matchAll(/^\s+uses:\s+([^@\s]+)@([^\s]+)/gm)];
  assert.ok(actions.length > 0, 'workflow has no actions');
  for (const [, action, reference] of actions) {
    assert.match(reference, /^[0-9a-f]{40}$/, `${action} is not commit-pinned`);
  }
});

test('pull requests run every gate without packaging a Pages artifact', () => {
  const build = job('build');
  assert.match(build, /run: npm ci/);
  assert.match(build, /npm test -- --reporter=default/);
  assert.match(build, /run: npm run test:browser/);
  assert.match(build, /run: npm run test:mutations/);
  assert.match(build, /run: npx playwright install chromium/);
  assert.doesNotMatch(build, /^\s+run: [^\n]*--with-deps/m);
  assert.match(build, /name: Upload Pages artifact\n\s+if: github\.event_name != 'pull_request'\n\s+uses: actions\/upload-pages-artifact@[0-9a-f]{40}/);
});

test('browser commands name their actual scope', () => {
  assert.equal(packageJson.scripts['test:browser'], 'playwright test');
  assert.equal(packageJson.scripts['test:a11y'], 'playwright test e2e/a11y.spec.ts');
  assert.equal(packageJson.scripts['test:claims'], 'playwright test e2e/claims.spec.ts');
});

test('post-merge behavior is direct and fail-closed', () => {
  const autoMerge = job('dependabot-auto-merge');
  assert.doesNotMatch(autoMerge, /dependabot\/fetch-metadata/);
  assert.match(autoMerge, /set -eu/);
  assert.match(autoMerge, /exit 1/);
  assert.match(autoMerge, /gh workflow run deploy\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
  assert.doesNotMatch(autoMerge, /gh workflow run[^\n]*(?:\|\||continue-on-error)/);
});

test('a deployment carries and verifies exact source provenance', () => {
  assert.match(job('build'), /public\/deployment\.json/);
  assert.match(gitignore, /^public\/deployment\.json$/m);
  assert.match(job('deploy'), /deployment\.json\?sha=\$\{GITHUB_SHA\}/);
  assert.match(job('deploy'), /p\.source_sha===process\.argv\[2\]/);
  assert.match(job('deploy'), /p\.repository===process\.argv\[3\]/);
  // The landmark the page actually ships. Both this line and the workflow said
  // `id="main-content"`, an id index.html has never contained -- it renders
  // `<main id="app" tabindex="-1">` -- so the deploy published correctly and
  // then failed its own verification every time. The assertion is pinned to
  // the same string the workflow greps for, so the two cannot drift apart.
  assert.match(job('deploy'), /grep -Fq '<main id="app"'/);
});

test('every job has an explicit timeout', () => {
  for (const name of ['build', 'deploy', 'dependabot-auto-merge']) {
    assert.match(job(name), /timeout-minutes: \d+/);
  }
});

test('documented measured evidence matches the current gated inventory', () => {
  assert.match(readme, /\*\*63 unit\/fixture tests\*\* and \*\*23 browser tests\*\*/);
  assert.match(readme, /\*\*30 of 30 compiling faults\*\*/);
  const mutationCount = [...mutationSource.matchAll(/^  \{name:/gm)].length;
  assert.equal(mutationCount, 30);
});

test('the production build enforces maintenance controls', () => {
  assert.equal(packageJson.scripts['test:maintenance'], 'node --test tests/maintenance-controls.node.mjs');
  assert.match(packageJson.scripts.build, /npm run test:maintenance/);
});
