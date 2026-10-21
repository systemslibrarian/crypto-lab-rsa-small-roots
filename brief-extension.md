# Extension brief — `crypto-lab-rsa-small-roots`

**2026-10-20. Extension to a live lab; no new repository.** Written against
`crypto-lab-rsa-small-roots` at `9be61a1acaee` and `audits/_MASTER-TEMPLATE.md` (catalog
`20cb434d89e4`). Template §5: "Extend, never restructure." Source of the gap: Boneh–Shoup v0.6
§16.4.4, "An attack on low secret exponent RSA" (Theorem 16.5, Lemma 16.6).

**Verdict: extension — a third scenario, "Small private exponent (Wiener)", inside the
existing lab.**

## Which lab hosts it, and why

The candidates were RSA Forge and RSA Small Roots. I chose **RSA Small Roots**, for three
reasons:

1. **The README asks for it.** `README.md:57` lists "Wiener, Boneh–Durfee" side by side under
   "Out of scope". The lab already treats them as its natural neighbours.
2. **The architecture fits exactly.** The lab separates a simulator worker that holds secrets
   from an attacker worker that receives an allowlisted public challenge, and it distinguishes
   "sufficient guarantee", "certificate" and "observed recovery". Wiener's attack has exactly
   that shape: Theorem 16.5 is a sufficient bound (d < N^(1/4)/3), and observed recovery above
   it is possible but unpromised.
3. **The thesis fits.** The thesis is "a small unknown in an RSA equation is recoverable", and
   here the small unknown is d itself. Wiener is the non-lattice ancestor: continued fractions
   alone recover it below N^(1/4)/3. Boneh–Durfee's lattice pushes to N^0.292 and stays out of
   scope; it is named, not run.

RSA Forge is the other candidate. It already carries Håstad, Bleichenbacher 1998 and the
in-flight Katz–Lindell and Bleichenbacher-2006 work, and it has no simulator/attacker
separation. Wiener there would be a weaker exhibit.

## What the lab has now (at 9be61a1acaee)

- **`src/attacks/public.ts`**
  - `:7` `Challenge` is a union of `message` (N, e = 3, prefix, suffix width, ciphertext) and
    `factor` (N, pHigh, width).
  - `:9` `allowlistChallenge` copies only public fields.
  - `:12` `derive` enforces `bitLength(N) ≤ 1024` (`:14`).
  - `:29` `verifyCandidate` is the public check.
  - `:34` `attack` returns statuses `verified-recovery` / `no-verified-root-found` /
    `resource-limit`.
- **`src/simulator/oracle.ts`**
  - `:20` `prime(bits)` forces p ≡ 2 (mod 3), for e = 3.
  - `:23` `generateKey(bits ∈ {512, 768, 1024})` returns `{ N, p, q, dPriv }` with e = 3.
  - `:29` `example(...)` builds challenges.
  - Secrets stay in `src/workers/simulator.worker.ts`. The `oracle-check` message compares a
    recovered value with the secret.
- **`src/math/integer.ts`** — `gcd`, `mod`, `powMod`, `inverse`, `bitLength`,
  `integerRoot(a, degree)` (exact floor root), and a `Budget` with step, time and bit
  counters.
- **`src/main.ts`**
  - The scenario state is `'message' | 'factor'` (`:9`); the tabs are `#message-tab` and
    `#factor-tab` (`index.html:29–30`, wired at `main.ts:179`).
  - Verdict markers are `el('prediction' | 'certificate' | 'recovery').dataset.value`
    (`:21–22`, `:69`, `:131`, `:162`), with a `#negative-claim` element and the `#reveal`
    section (`index.html:57`).
- **Tests.**
  - `e2e/claims.spec.ts` includes `:65` "the actual attack worker payload is public-only…" and
    `:120`, the worker integrity-failure tests.
  - `src/fixtures/fixtures.test.ts` asserts the built `attack.worker-*.js` does **not** match
    `/dPriv|Miller|randomBelow|probablePrime|generateKey/`. Wiener's attacker code must avoid
    those identifiers.
  - `scripts/mutations.mjs` is a concrete-patch mutation runner (anchor exactly once, build,
    bundle hash moves, a named test fails, restore, control green). It records observations
    under `.qa-artifacts/mutations/`.
  - `scripts/generate-fixtures.py` produces Sage 10.8 (proved primes) / SymPy 1.14.0 fixtures:
    public inputs in `src/fixtures/public.json`, truth in `oracle.json`, observations pinned
    in `expected.json`.
- **README.** The Exhibits list runs 1–5 (`README.md:25–31`). "Out of scope" sits at `:57`.

**Fleet check.** I grepped my clones of the labs listed in `CATALOG.md` at `20cb434d89e4` (pulled 2026-10-20; excluding node_modules, .git and dist) for
`wiener|continued fraction` and inspected each hit:

| Lab | What the hit is |
|---|---|
| `crypto-lab-shor` | continued fractions for period extraction |
| `crypto-lab-key-exchange` (`src/ui.ts:1668`) | the same Shor use |
| `crypto-lab-hash-hunt` | van Oorschot–Wiener distinguished points (a different Wiener) |
| `crypto-lab-log-forge` | a citation |
| `crypto-lab-rsa-small-roots` | the out-of-scope line |
| `crypto-lab-corrupted-oracle`, `crypto-lab-covert-channel-studio` | prose mentions, not the attack |

None runs Wiener's attack on RSA. Agent: re-run this at HEAD before building.

## What to add — Scenario 03: "Recover a small private exponent"

**Plain-language lead-in.** Signing and decryption get faster if the private exponent d is
small, so someone generates d first and computes e from it. That shortcut publishes d. The
fraction e/N sits so close to the secret fraction k/d that the continued-fraction expansion
of e/N lists k/d among its first few dozen approximations.

**Headline mechanism: the convergent ladder.** The page expands e/N live into partial
quotients `[a0; a1, a2, …]` and lists each convergent kᵢ/dᵢ. For each one it shows the test
from the proof of Theorem 16.5:

1. Is (e·dᵢ − 1) divisible by kᵢ?
2. If so, φ′ = (e·dᵢ − 1)/kᵢ.
3. Then s = N − φ′ + 1 and Δ = s² − 4N.
4. Is Δ a perfect square, with s ± √Δ even?
5. If so, p, q = (s ± √Δ)/2.

The row that factors N lights up. The page counts rows tested and compares that count with
Lemma 16.6's ≤ 2·log₂N.

**Break-it-yourself: widen d** (mirrors Exhibit 5).

- A d-width slider sweeps from well below to well above the Theorem 16.5 boundary.
- The boundary is computed from N alone: the largest integer D with 81·D⁴ < N, i.e.
  D < N^(1/4)/3. It is shown as bits, "guarantee covers d up to 2^x.y".
- The simulator generates d per the book's RSAGen(ℓ, s):
  - pick ℓ-bit primes p and q (with `bitLength(N)` checked as today);
  - pick a random s-bit d with gcd(d, p−1) = gcd(d, q−1) = 1;
  - set e = d⁻¹ mod (p−1)(q−1).
- Every width change keeps the key size and generates a fresh key, so the result retires.
- **Three honest outcomes,** each its own state, never conflated:
  1. Inside the guarantee: **verified recovery** (always, by Theorem 16.5).
  2. Just above it: **may still recover**. The bound is sufficient, not necessary. Pin observed
     outcomes as observations, as `expected.json` already does for `message-128`.
  3. Further above it: **no convergent factors N**. The page says "Wiener's guarantee no longer
     applies. This is not evidence that d is safe." It also shows where d sits relative to
     N^0.292, the Boneh–Durfee range. That position is computed by the simulator and revealed
     only through the existing reveal path after the run, never sent to the attacker.

**After recovery (public verification, existing ethos).**

- Check p·q = N.
- Check e·d ≡ 1 (mod (p−1)(q−1)).
- Run a re-encryption round trip for a random m: (m^e)^d ≡ m (mod N).
- The simulator `oracle-check` must agree that the recovered d equals its secret. On
  disagreement, take the existing integrity-error path (`e2e/claims.spec.ts:120`).

## SECURITY / CORRECTNESS INVARIANTS

1. **Public-only attacker.**
   - The attacker worker receives `{ scenario: 'wiener', N, e }` and nothing else.
   - `allowlistChallenge` gains this branch.
   - The `:65` payload test and the built-worker regex test cover it.
2. **Exact arithmetic only.** Continued fractions use BigInt Euclid. The perfect-square test
   uses `integerRoot(Δ, 2)` squared back, never floating point.
3. **Prediction is computed from N; recovery is verified publicly.** The display never reads
   the simulator's d to decide a verdict. d appears only in the post-run reveal.
4. **"Not recovered" is never "safe".** It is a distinct state that carries the
   negative-claim text.
5. **Budgeted.** Convergent tests count against `Budget`. A limit hit is `resource-limit`, not
   "no root".
6. **Key-generation guards.**
   - Moduli of 512 / 768 / 1024 bits, as today.
   - d must be odd, with the gcd conditions above.
   - Reject and regenerate when e ≥ N, which cannot happen for valid output; assert it anyway.

## ARCHITECTURE

- **`src/wiener/cf.ts`**
  - `partialQuotients(e, N)` and `convergents(e, N)` as an iterator of
    `{ i, a, k, d }` (BigInt).
  - Pure functions, unit-tested.
- **`src/wiener/attack.ts`**
  - `wienerAttack(challenge, budget, progress)` returns
    `{ status, rows: [{ i, k, d, divides, phi?, delta?, square?, p?, q? }], recovered, testedCount, lemmaBound }`.
  - `verifyWiener(c, d, p, q)` holds the public checks.
  - Keep identifiers clear of the worker-bundle regex.
- **`src/simulator/oracle.ts`**
  - Add `generateSmallDKey(bits, dBits)` beside `generateKey`, and leave `generateKey`
    untouched.
  - Factor out an unconstrained prime generator, because the existing `prime()` forces
    p ≡ 2 (mod 3).
  - Add `exampleWiener(...)`.
- **`src/workers/attack.worker.ts`** — dispatch on scenario. `derive` stays lattice-only;
  Wiener has its own entry.
- **`src/main.ts` / `index.html`**
  - Add a third tab, `#wiener-tab` ("03 Recover a small private exponent").
  - Lattice controls (`#dimension`, `#preset`) are shown disabled, with "no lattice in this
    scenario" text, not removed.
  - The inspectors gain a "Continued fraction" record. The JSON export includes the full
    ladder.

## UI

- **Steps.**
  1. Pick the key size and d width.
  2. Generate (simulator).
  3. Run the attack (worker, with progress per convergent).
  4. The ladder table fills row by row. Rows have tooltips, and the winning row is announced
     via aria-live.
  5. Verdict cards: Prediction ("Inside Wiener's guarantee: 81·d⁴ < N" — evaluated after
     recovery with the recovered d, or "unknown until recovery"), Recovery, Public checks.
  6. Reveal: the simulator's d bit length vs ¼·log₂N and 0.292·log₂N.
- Stacks under 640px. Keyboard reachable. 320px reflow, per the existing a11y spec.

## VISUAL SEMANTICS

- **Recovered d:** ALARM. Reuse the lab's "! Verified recovery" treatment: "PRIVATE KEY
  RECOVERED FROM THE PUBLIC KEY".
- **No convergent works:** amber "NOT RECOVERED BY THIS METHOD — NOT A SAFETY RESULT", with an
  icon and the negative-claim text. Never green.
- **Ladder rows:** tested/failed in grey with a ✕ glyph and text, the factoring row in alarm
  colour with a ! glyph. Never colour alone.

## EDGE CASES

| Input | Fail-closed behaviour |
|---|---|
| kᵢ = 0 (first convergent 0/1, since e < N) | Skipped, shown as "k = 0, not a candidate" |
| Δ < 0, or not a square, or s ± √Δ odd | Row fails with that reason named |
| Candidate p·q ≠ N | Row fails ("candidate does not divide N"); never a recovery |
| Wrong d accepted by a buggy check | Simulator `oracle-check` mismatch → integrity error, verdict withdrawn |
| d width outside 16–(bits/2) | Refused, with the range named |
| Budget hit | `resource-limit` state |
| Changing width or size mid-run | Retire, stale-run guard (existing `runId` pattern at `main.ts:20`) |

## EXTENSION SEAMS

- `// [extension] point` in `wiener/attack.ts`: Boneh–Durfee (d < N^0.292, lattice) would reuse
  `src/lattice/*`. It is out of scope; the README keeps it listed.
- `// [extension] point` in `oracle.ts`: small CRT exponents. Boneh–Shoup §16.4.4 says these
  are also insecure and refers to the chapter notes; there is no verified citation yet, so
  this is prose only.

## Tests

- **Fixtures** (extend `scripts/generate-fixtures.py`; same Sage 10.8 / SymPy 1.14.0 backends
  and seed discipline).
  - Add `wiener-*` cases on one 1024-bit key family:
    - d well inside the bound;
    - d at the last integer width inside it;
    - d a few bits above it;
    - d far above it;
    - a standard e = 65537 key (no small d) as the control.
  - Public inputs go in `public.json` and truth in `oracle.json`. Observed outcomes are pinned
    in `expected.json`; above the bound, the outcome is an observation, not a guarantee.
  - The Sage side computes the ladder independently with
    `continued_fraction(QQ(e)/N).convergents()`. Extend `scripts/check-transcripts.py` to
    compare the browser transcript's convergents and winning row.
- **Unit tests.**
  - `convergents` matches a small example. For e = 17993 and N = 90581, I computed (Python,
    while writing this brief) the partial quotients [0; 5, 29, 4, 1, 3, 2, 4, 3]. The ladder
    then yields k = 1, d = 5, p = 379, q = 239, and 81·5⁴ < 90581 holds. Toy size, unit test
    only, below the UI's 512-bit floor. Have the test recompute it by long division, not by
    the same function.
  - Every row's divisibility and Δ test is recomputed independently.
  - `testedCount ≤ 2·bitLength(N)`.
- **`e2e/claims.spec.ts` additions.**
  - Parse N, e and the recovered d, p and q from the page. Recompute p·q, e·d mod φ and a
    round trip in the test.
  - Recompute the boundary integer from N (largest D with 81·D⁴ < N) and match it to the
    displayed one.
  - Retirement on width change, and a no-op guard on re-selecting the same tab.
  - The attacker payload for `wiener` is `{ scenario, N, e }` only.
  - The "not recovered" state shows the negative claim and is not styled as success.
- **§4.1c mutations** (add concrete patches to `scripts/mutations.mjs` in its existing format):
  1. In the divisibility test, use dᵢ where kᵢ belongs. The recovery test goes red.
  2. Bypass the perfect-square check (`true`). The "candidate does not divide N" test goes
     red.
  3. Skip `p*q===N` in `verifyWiener`. The unit test goes red.
  4. Invert `81n*D**4n < N`. The boundary test goes red.
  5. Invert the Wiener recovery `dataset.value`. The browser verdict test goes red.
  6. Delete the Wiener negative-claim text. The §4.1d assertion goes red.
  7. Add `dPriv` to the attacker payload. The payload test goes red.
- **§4.1d negative claim.** "Surviving Wiener's attack does not make a small private exponent
  safe."
  - **Fixture:** d a few bits above the guarantee, where Wiener finds no convergent. Every
    check is green: the key round trip passes, the run completes, and no candidate is falsely
    accepted. The reveal shows d below N^0.292, the published Boneh–Durfee range, with the
    claim visible in that state.

## README and card follow-up

- **What It Is.** Add the third scenario in one sentence.
- **Exhibits.** Add **6. Recover a small private exponent.** Exhibits 4 (inspector/export) and
  5 (widen) gain one clause each where they apply.
- **What Can Go Wrong.** Add: "Wiener's attack needs d < N^(1/4)/3 for its guarantee. Failing
  above it is not safety: Boneh–Durfee (not run here) reaches N^0.292."
- **Out of scope** (`:57`). Remove Wiener and keep Boneh–Durfee.
- **Build & Verify.** Update the test, fixture and mutation counts *from the actual runs*.
- **Chip handoff.** Add **Wiener (continued fractions)** as an implemented chip. Card copy, if
  changed, stays under 36 words.

## Do not touch

- The message and factor scenarios' behaviour, lattice code and fixtures.
- Existing `expected.json` entries.
- The worker separation.
- The Budget defaults, theme, header, port 4218 and deploy workflow.

## Sources

- Boneh & Shoup, *A Graduate Course in Applied Cryptography*, v0.6, Jan 2023, §16.4.4,
  Theorem 16.5 (d < n^(1/4)/3), Lemma 16.6 (≤ 2·log₂n convergents; extended Euclid), and the
  remarks "about n^0.3" and "conjectured … d < n^0.5, open" (book.txt lines 34973–35060) —
  https://toc.cryptobook.us/
- M. J. Wiener, "Cryptanalysis of short RSA secret exponents", *IEEE Transactions on Information
  Theory* 36(3):553–558, May 1990, DOI 10.1109/18.54902 (verified via Crossref).
- D. Boneh and G. Durfee, "Cryptanalysis of RSA with private key d less than N^0.292", *IEEE
  Transactions on Information Theory* 46(4):1339–1349, July 2000 (verified on the author's page,
  https://crypto.stanford.edu/~dabo/pubs/abstracts/lowRSAexp.html); extended abstract in
  EUROCRYPT '99, LNCS, pp. 1–11, DOI 10.1007/3-540-48910-X_1 (verified via Crossref).
  *Self-correction:* the author page says the extended abstract appeared at "Eurocrypt 1998",
  but Crossref places it in EUROCRYPT '99. Cite 1999 and the DOI.
