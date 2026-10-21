# RSA Small Roots build notes

Build specification: local `BRIEF-rsa-small-roots-revised.md`, revision 2, 2026-10-06. The brief stays local and is excluded from the commit at the user's request. Repository: `crypto-lab-rsa-small-roots`. Build standard: the sibling catalog's current `CLAUDE.md`, `audits/_MASTER-TEMPLATE.md`, and `audits/kickoff.md`.

Extension specification: committed `brief-extension.md`, dated 2026-10-20, read against target commit `9be61a1acaeeb21ae7a71af828372d05d8f7b7a5` and clean catalog/template commit `69067cea6cc3c6cd887528ca3a91ddba808abaf7`. The pinned target had not moved, and every cited code assumption still held. The original build notes below remain provenance for the lattice scenarios; this extension section supersedes their old test totals and their statement that Wiener was prose-only.

## 2026-10-21 Wiener extension

The third scenario hand-rolls Wiener’s RSA small-private-exponent attack with exact BigInt continued fractions. `src/wiener/cf.ts:8` performs Euclidean long division, `:21` emits convergents, and `src/wiener/attack.ts:73` reconstructs φ(N), checks the discriminant exactly, and accepts only factors whose product is N. `src/wiener/attack.ts:62` independently checks p·q, the inverse relation, and an RSA round trip. The worker entry point is `src/workers/attack.worker.ts:8`; its allowlisted challenge is exactly `{ scenario, N, e }` at `src/attacks/public.ts:14`. Fresh small-d RSA generation stays in the simulator at `src/simulator/oracle.ts:27`.

Boneh–Shoup v0.6 §16.4.4 was checked for Theorem 16.5 (`81d⁴ < N`), Lemma 16.6 (at most `2·bitLength(N)` tested convergents), and the warning that failure above the sufficient range is not security. Wiener’s 1990 DOI metadata and Boneh–Durfee’s author-hosted `N^0.292` statement were checked before being cited. Boneh–Durfee and small-CRT-exponent attacks are comparison/comment-only names, not implementations.

Five generated 1024-bit fixtures share one prime family: inside the guarantee, the last inside boundary width, a few bits above, far above, and an e = 65537 control. They are observations, not published vectors. The existing one published vector remains SageMath’s root-4 small-roots example. SymPy 1.14.0 independently checked all 18 browser transcripts; the pinned SageMath 10.8 container independently ran `continued_fraction(QQ(e)/N).convergents()`, its LLL checks, and the published control, with no network and a read-only project mount.

The measured gates are 55 unit/fixture tests and 18 production-browser tests. The browser suite drives recovered and no-recovery Wiener states at 1280px and 320px with zero axe, text-contrast, non-text-contrast, unresolved-check, or reflow findings. All 28 compiling concrete mutations were killed and restored; seven target Wiener divisibility, discriminant, factor verification, theorem inequality, rendered recovery, the negative claim, and the public-only payload.

## Source overlap decision

The catalog was read for discovery, then implementation files were inspected at the following local commits. None of the inspected sources runs this known-prefix cubic / leaked larger-prime small-root pipeline. This is a scoped source review, not a fresh remote fleet audit.

| Repository | Inspected commit | Source evidence |
| --- | --- | --- |
| RSA Forge | `434ecd8230fa03bf9a035db7f36a2ecec1863ef7` | `src/attacks.ts`: three-ciphertext CRT and exact cube-root broadcast attack; `src/textbook.ts`: textbook RSA. Coppersmith is cited in a comment, with no small-root implementation in the inspected source. |
| Educational RSA | `e360321cf996ddfb7f8cc8193b6504d79a6cc43f` | `src/rsa/keygen.ts`, `bigint-math.ts`, `factor.ts`: textbook key generation, BigInt utilities, small-key factoring. |
| Factor Forge | `50e00cd4185d85f2047b54bf28a1f18874cc1871` | `src/factor/registry.ts`: trial, Fermat, rho, p−1, p+1, ECM, and QS; no high-bit small-root attack in this registry. |
| LLL Break | `7c88fab77395c6a774d496098423b58a212c2e5e` | `src/lll.ts`, `src/lattice.ts`: Number-based basis and GSO, transformation tracing. |
| Lattice Gentle | `c24b95dad9cf6a75f69f81d2f7c589cc69c25c9a` | `src/lattice/lll.ts`: Number-based worked LLL, exact teaching trace at its own scale. |
| GGH Trapdoor | `f0f2d1a95ac449a2abb3f4ea6811c84a44b4efa9` | `src/attack/lll.ts`: floating GSO, safe-integer row updates and guards; U and reducedness verification for its embedding lessons. |
| Nonce Lattice | `436c9b58180dd3e5bb929228eb41baa5dfe6b52f` | `src/lattice/lll.ts`: BigInt row operations with explicitly approximate Number GSO decisions. |
| Lattice Builder | `315dceb5bf62483feb843bd96d6b1fa7a9924b6d` | `src/basis.ts`, `src/mlkem.ts`: two-dimensional basis visualization and ML-KEM material. |

The existing event and transformation patterns informed the design; none of their reducers was copied. Their numerical choices serve their own lessons and are not a statement that all fleet LLL code is unsuitable. This lab needs exact decisions for much larger coefficients, so it implements fraction-free BigInt GSO and independently verifies through rational GSO.

## Correctness and provenance

Basis generation and final candidate acceptance follow the revision-2 brief. Centered non-leading coefficients and ties-away-from-zero rounding are fixed reproducibility conventions. The reducer represents `μ[i,j] = λ[i,j]/d[j]` and `||b*j||² = d[j]/d[j−1]`, where d is the leading Gram determinant and `d[−1]=1`. Its integer swap formulas are the exact rational swap equations with common denominators cleared. Every fraction-free division is asserted exact. The verifier separately rebuilds normalized rational GSO from the final basis.

The published Sage root-4 example is recovered with explicit `X=8, m=2, t=2`. Additional 512-bit fixtures are independently generated by pinned SageMath 10.8 with proved primes and identically reproduced by SymPy 1.14.0; public inputs and oracles are separate. They include inside-bound, near-bound, above-bound, repeated leakage for one factor, and a tiny exhaustive negative challenge. Ground truth is only consulted after the public attack returns, in tests or the separately held simulator state.

An offline SymPy checker independently reconstructs basis entries, checks U and unimodularity, checks rational reducedness, and compares the exact integer roots of searched polynomials. The SageMath 10.8 checker runs native LLL and the published small_roots control, then verifies the browser transcripts' U, exact rational reducedness, determinants, and integer roots. Both pass on all 13 fixtures. Sage was run through the immutable `sagemath/sagemath:10.8` image digest `sha256:fb96c7fb10d672f3be0d088399db3aeac52650416d1bb71f74f26429ea35778f`, with networking disabled and a read-only project mount.

The fixed 512-bit message fixture at 128 unknown bits recovered its suffix with both the conservative prediction and first-row norm certificate unsatisfied. At 136 and 168 bits this implementation found no verified candidate. The 126-bit message and 100-bit factor fixtures are inside the finite bound and recovered. `src/fixtures/expected.json` pins these observed outcomes separately from the public inputs and oracle. Above-bound outcomes are observations of this deterministic implementation, not general failure thresholds.

Primary-source checks included the Sage small_roots documentation, PKCS #1 §7.1, Boneh's author-hosted RSA survey, May's accessible manuscript and publisher record, and IBM's Coppersmith publication record. The DOI pages for the original LLL and Howgrave-Graham references could not be fetched by the browsing tool; their attribution is cross-referenced in May's manuscript rather than claimed to have been read directly.

Accessibility contrast helpers are adapted from `crypto-lab-schnorr-forge/e2e/contrast.ts` and `nontext.ts` under MIT. The top bar is adapted from RSA Forge. No runtime dependencies are shipped. The fixture oracles, Python/Sage scripts, and tests are absent from the static browser build.

## Integration handoff

The shared `crypto-lab` and `crypto-counsel` content is left unchanged, as the lab kickoff requires. Central category, accent, favicon, catalog port registration, dispatch census, and source-review entries must land in the catalog's integration pass. No current central assignment for this new repository was found.

- Card title: **RSA Small Roots**.
- Kicker: **SMALL UNKNOWN · EXACT RSA ATTACKS**.
- Copy: **Recover structured RSA secrets with exact lattices or expose a dangerously small private exponent through continued fractions, with every candidate verified from public data.**
- Four proposed chips: **Textbook RSA**, **Coppersmith**, **Exact LLL**, **Wiener (continued fractions)**. The implemented Wiener chip replaces **Sturm Search** to keep exactly four; Boneh–Durfee remains prose only and is not a chip.
- Proposed category: **ATTACKS**; section: **cryptanalysis**. Neither Foundations nor Real-World Systems.
- Level: **advanced**. Readers inspect modular polynomial equations, integer bases, and norm certificates; the first run is guided.
- Concept placement: §7 Factoring, with secondary §10 Lattices.
- Local Playwright port: **4218**, the free port reported by `port-sync.js` during discovery; catalog registry integration remains pending.
- Accent `#c4a3ff`, magnifying-glass favicon, and category are **PROVISIONAL** pending central rendered-grid assignment.
- About: **Browser lab demonstrating structured textbook-RSA recovery through exact Coppersmith lattices and Wiener continued fractions, with independent public checks. Teaching demo, not production crypto.**
- Topics: `cryptography`, `crypto-lab`, `rsa`, `coppersmith`, `wiener-attack`, `continued-fractions`, `lll`, `typescript`, `education`.

Executable source anchors: `src/attacks/public.ts:40` (Coppersmith attack), `:44` (exact LLL call), `:46` (independent verifier), `:53` (Sturm search call), and `:34` (public candidate verification); `src/lattice/build.ts:3` (indexed integer basis); `src/lattice/lll.ts:5` (exact LLL); `src/lattice/verify.ts:4` (same-lattice proof / reducedness); `src/coppersmith/roots.ts:19` (Sturm isolation); `src/simulator/oracle.ts:11` (Miller–Rabin), `:27` and `:42` (RSA key generation); `src/wiener/cf.ts:8` and `:21` (continued fractions); and `src/wiener/attack.ts:73` / `:93` (Wiener factor reconstruction and attack). Håstad, OAEP, Boneh–Durfee, Blömer–May, small CRT exponents, ROCA, and BKZ occur only as prose references, comments, or explicit exclusions.

## Release evidence

The deployment workflow has grouped Dependabot updates, an auto-merge job gated on the whole build and test job, PR and workflow_dispatch triggers, explicit post-merge dispatch from the merge command's own exit status, per-ref concurrency, and deploy exclusion for PRs. The gate runs the production-build browser suite and requires a nonzero unit-test count. Local mutation observations are generated by the script; a killed mutation must have passing baseline and restored controls, a real source change, and a changed compiling bundle.

The first Linux CI run passed all 43 unit tests but failed its terminal-output count parser because Vitest inserts ANSI styling between “Tests” and the number. The gate now reads Vitest's JSON report and requires success, a positive total, all tests passed, and zero failed tests. This removes the presentation dependency while preserving the complete unit and browser gate.

The final quality pass adds actual before/source/after coefficient replay to the reduction stepper and exact evaluation of each selected polynomial at the publicly recovered low bits. Main-thread candidate verification and the separate simulator cross-check both retire every success display and disable export on disagreement. The current 18 browser tests include independently reconstructed trace replay, both Wiener evidence outcomes, and injected faults in both worker responses; all pass alongside 55 unit/fixture tests and the independent SymPy and Sage checks. All 28 concrete compiling mutations were caught with passing baseline and restored controls and matching restored bundle hashes. Complete local observations are in `.qa-artifacts/mutations/observed.json`.

Publication is only claimed after the requested direct-main push and a successful deployment / served-byte check. The local GitHub CLI initially returned an authentication error; the existing Git credential successfully read the repository's Pages configuration, which is already set to `workflow`. No central catalog changes or reservations are claimed by this build.
