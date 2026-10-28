# RSA Small Roots

Coppersmith · Howgrave-Graham · Exact LLL

## What It Is

An inspectable browser lab that recovers an unknown suffix of a known-prefix textbook RSA message with exponent 3, recovers the larger prime of an RSA modulus from its high bits, or applies Wiener’s continued-fraction attack to a dangerously short private exponent. A separate simulator generates each challenge; the attacker works from public information only. This is a teaching demo, not production crypto.

The mathematical engine uses BigInt integer arithmetic, fraction-free exact LLL, an independently recomputed rational Gram–Schmidt verifier, and complete bounded Sturm searches. It tracks an integer transformation U and checks `B_reduced = U B_original`, `det(U) = ±1`, reducedness, full rank, and determinant. Rounded displays never decide a verdict.

The Wiener scenario is deliberately separate from the lattice engine. Exact BigInt Euclid expands `e/N`; each convergent `k/d` must reconstruct an integral φ(N), a square discriminant, factors whose product is N, the inverse relation, and an RSA round trip. The sufficient guarantee is the exact inequality `81d⁴ < N`, not an observed cutoff.

For `r = degree(f)`, `n = rm+t`, and `X = 2^k`, basis rows are the coefficients of `g(Xz)`:

```text
N^(m-i) x^j f(x)^i  : i = 0,…,m-1; j = 0,…,r-1
x^j f(x)^m          : j = 0,…,t-1
D = N^[rm(m+1)/2] X^[n(n-1)/2]
```

Completed rows are never reduced modulo N. The sufficient prediction checks `C X^Q < N^E`, with `Q = n(n−1)`, `C = n^n 2^[n(n−1)/2]`, and `E = 2βmn−rm(m+1)`. It finds and checks the maximal integer X and the adjacent bit widths exactly. β is 1 for the message and 1/2 for the declared larger prime. Prediction, the actual norm certificate, and verified recovery are three separate claims.

For the original selected vector, `S = Σvℓ²`. The strict certificate is `nS < N^(2m)` for messages or `nS < N^m` for the factor hint. Divisibility and Cauchy–Schwarz then force `h(x₀) = 0` over the integers. The factor certificate is conditional on the public larger-prime promise until recovery. The first reduced vector is not necessarily shortest.

Integer-root extraction keeps the original h intact, makes a primitive square-free copy over the rationals, forms exact Sturm sequences, prunes bounded integer intervals using one-sided variations at half-integer endpoints, and evaluates every candidate exactly. It includes repeated roots, boundary roots, and noninteger real roots. It never scans all suffixes or reads the simulator’s secret to find a root.

## Exhibits

1. **The cube-root shortcut.** Exact cubing and exact integer cube roots show why a no-wrap ciphertext is vulnerable and why the default larger message needs another method. Håstad’s CRT broadcast attack is a separate lesson in RSA Forge.
2. **Recover a message suffix.** Choose a UTF-8 prefix and hidden bit width. The default uses a fresh 512-bit modulus, 64 hidden bits, and an 8-dimensional lattice with `(m,t) = (2,2)`. Even the known prefix wraps when cubed.
3. **Factor from high bits.** Reveal high bits of the larger of two distinct equal-bit-length probable primes. The default hides 80 bits and uses a 6-dimensional lattice with `(m,t) = (3,3)`.
4. **Follow the evidence.** Open public inputs, finite bounds, original and reduced matrices, U, actual row-operation traces, selected polynomials, integer-root records, or every continued-fraction convergent and its exact rejection reason. Export a JSON transcript containing exact decimal integers and public information.
5. **Widen the unknown.** Message widths create related messages and ciphertexts; factor widths keep the same target prime; Wiener widths generate fresh keys. Every input change retires old results immediately.
6. **Recover a small private exponent.** Generate 512-, 768-, or 1024-bit RSA keys with a chosen d width, watch exact convergents of e/N reconstruct the factors, and compare observed recovery with Wiener’s sufficient bound and the cited Boneh–Durfee range.

## When to Use It

Use it to understand the modular-to-integer step, inspect an exact LLL computation, experiment with RSA structure leakage, and distinguish a sufficient guarantee from an observed outcome. Use Lattice Gentle first if basis reduction is unfamiliar.

Do not use it to encrypt real data, assess an operational RSA key, prove security from a failed attack, or claim that arbitrary RSA ciphertexts can be decrypted.

## Live Demo

Deployment target: <https://systemslibrarian.github.io/crypto-lab-rsa-small-roots/>. The repository includes an Actions deployment gate; publication must be confirmed from served bytes. `npm run dev` provides the local demo. Everything runs locally in browser Web Workers.

## What Can Go Wrong

- The message attacker needs N, e = 3, ciphertext, known prefix, and suffix width. It does not receive an arbitrary unknown message and recover it from ciphertext alone.
- The allowed message interval must fit entirely below N. The UTF-8 prefix is distinct from the arbitrary secret bitstring; fixed-width hex and binary are authoritative.
- The factor attacker needs an aligned hint of the larger prime. Balanced primes alone do not guarantee that both factors exceed √N. A candidate must directly divide N, satisfy the high-bit hint, and be the larger factor.
- A correct encryption/decryption round trip does not establish confidentiality. The default visible result is **DECRYPTS CORRECTLY — SUFFIX RECOVERED WITHOUT THE PRIVATE KEY**.
- No verified root found, cancellation, resource limit, invalid input, and integrity error are different states. None establishes security. A completed certified search missing a valid simulator target is an integrity defect.
- A failed certificate does not imply recovery is impossible. Asymptotic `N^(1/3)` and `N^(1/4)` are background scales, not finite guarantees for every preset.
- Wiener’s attack needs `d < N^(1/4)/3` for its guarantee. Failing above it is not safety: Boneh–Durfee (not run here) reaches `N^0.292`.
- Increasing e is not a general repair for textbook RSA’s missing secure encoding. This known-prefix/small-suffix model does not directly describe correctly implemented RSA-OAEP; see [PKCS #1 §7.1](https://www.rfc-editor.org/rfc/rfc8017.html#section-7.1).

The browser CSPRNG supplies fresh candidates and uniformly rejection-sampled witnesses. A small-prime sieve and 64 independent Miller–Rabin rounds establish probable primality, not a primality proof. Distinct primes have equal bit lengths; the requested modulus length is checked. Message keys have `gcd(3,φ(N)) = 1` and a checked simulator round trip. Keys and secrets remain in memory in the simulator worker. The Wiener attacker receives exactly `{ scenario, N, e }`; every allowlisted attack payload excludes factors, private exponents, secrets, simulator seeds, and oracle closures. This separation is a teaching boundary; it does not hide browser memory from the browser’s owner.

Limits: ≤1024-bit modulus, ≤12-dimensional lattice, 1–256 unknown bits at the lattice engine boundary (8–200 in its UI), Wiener d widths from 16 bits through half the selected modulus width, ≤11-degree reduced polynomial, 65,536-bit arithmetic guard, 100,000 counted work steps, and a trace of at most 600 events / 2 MiB of recorded ASCII operands. The default deadline is 15 seconds; the explicit extended preset is 60 seconds. A 1 ms diagnostic preset distinguishes an incomplete computation from a negative result. Key generation has a 30-second main-thread watchdog. Main-thread termination interrupts synchronous worker computations and stale run IDs cannot reinstate results.

Out of scope: Håstad implementation, Boneh–Durfee implementation, Blömer–May, arbitrary-exponent Coppersmith attacks, multivariate polynomials, known-LSB factoring, ROCA, BKZ, and an OAEP attack.

## Real-World Usage

The exhibit explains why application structure and leaked factor bits can undermine raw RSA equations. It does not provide hardened cryptography or an OAEP implementation. Use reviewed encryption APIs and the protocol’s specified encoding in applications.

## How to Run Locally

```sh
npm ci
npm run dev
```

Open the printed URL under `/crypto-lab-rsa-small-roots/`. For the production build:

```sh
npm run build
npm run preview
```

## Related Demos

- [RSA Forge](https://systemslibrarian.github.io/crypto-lab-rsa-forge/): CRT broadcast and other RSA lessons.
- [Educational RSA](https://systemslibrarian.github.io/crypto-lab-rsa-educational/): key generation and textbook arithmetic.
- [Factor Forge](https://systemslibrarian.github.io/crypto-lab-factor-forge/): general factoring algorithms.
- [Lattice Gentle](https://systemslibrarian.github.io/crypto-lab-lattice-gentle/): an introduction to bases and LLL.
- [LLL Break](https://systemslibrarian.github.io/crypto-lab-lll-break/): other lattice attack experiments.

The source overlap check, inspected commit SHAs, integration handoff, and verification limits are recorded in [build notes](docs/build-notes.md).

## Build & Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:mutations
```

The local suites pass **63 unit/fixture tests** and **23 browser tests**, including zero accessibility violations in the driven desktop and 320px states. `npm test` builds first, then runs Vitest. `npm run test:browser` runs the complete accessibility and claims gate; `test:a11y` and `test:claims` run those portions independently. Browser tests exercise the production build on the dedicated strict port 4218. In addition to the lattice claims, they independently recompute Wiener’s strict integer boundary, p·q, the inverse relation, a random-message round trip, the public-only payload, result retirement, and the pinned negative claim. They exercise invalidation, cancellation, reset, export, keyboard access, 320px reflow, and injected integrity failures that must withdraw success and disable export. The WCAG gate uses axe plus painted text and per-side control contrast oracles adapted from Schnorr Forge under MIT, with no exemptions.

Published known-answer control: [SageMath’s root-4 example](https://doc.sagemath.org/html/en/reference/polynomial_rings/sage/rings/polynomial/polynomial_modn_dense_ntl.html), `N = 10001`, `f = x³ + 10x² + 5000x − 222`; this solver commits `X = 8, m = 2, t = 2`. It tests actual recovery through LLL and Sturm search.

Public offline inputs live in `src/fixtures/public.json`; ground truth is separate in `oracle.json`. The independent generator pins SageMath 10.8 with proved primes; its optional SymPy 1.14.0 backend reproduces identical inputs. The set has 18 transcripts: the existing 13 lattice records plus five generated 1024-bit Wiener cases on one key family (inside, boundary-width, just above, far above, and e = 65537 control). These five are generated observations, not published test vectors. `scripts/check-transcripts.py` checks reconstructed lattice evidence and independently recomputes every Wiener convergent; `scripts/cross-check.sage` uses Sage’s `continued_fraction(QQ(e)/N).convergents()` as a second implementation and also runs Sage’s native published small-roots control. SymPy and Sage are offline tools only.

```sh
sage -python scripts/generate-fixtures.py --backend sage
sage scripts/cross-check.sage
```

The Python transcript checker takes `.qa-artifacts/math/*.json` except `observations.json`. The verified Sage 10.8 container digest is `sha256:fb96c7fb10d672f3be0d088399db3aeac52650416d1bb71f74f26429ea35778f` from `sagemath/sagemath:10.8`; the reference runs use no network and a read-only project mount.

The concrete mutation script caught **30 of 30 compiling faults**, including nine Wiener-specific mutations, with passing baseline controls, nonempty source changes, changed bundle hashes, named failing tests, surgical restoration, matching restored hashes, and restored green tests. It records observations under `.qa-artifacts/mutations/`; unperformed runs and compile failures are not counted as kills.

## Performance

The desktop and 320px viewport runs used headless Chromium 156.0.8078.4 on macOS, 512-bit moduli, message `(k,m,t,n) = (64,2,2,8)` and factor `(80,3,3,6)`, with tracing enabled. In four fresh-key runs of each scenario, all recovered successfully: message reduction/search took 3.60–5.52 seconds, and factor reduction/search 0.28–0.44 seconds. These are local observations, not universal runtime guarantees or physical-phone measurements. Larger key sizes, dimensions, and CPU contention can reach the declared resource limit.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*

### Wiener verification correction

The page independently reconstructs every convergent and candidate from the public key,
checks both directions of each exact-message RSA round trip, and checks revealed theorem
and bit-length labels before publishing a completed result or enabling export. The Wiener
sufficient bound assumes distinct, same-bit-length RSA primes. The attacker uses a fresh
WebCrypto random message for its public recovery check. Changing the budget during key
preparation starts a current challenge rather than stranding the generation request.

The independent Python checker requires a complete recorded ladder and matching row counts.
Source mutations are replayed in the deployment gate; only the named assertion can kill a
mutation, with passing baseline and restored controls. Browser coverage includes corrupted
Wiener ladders, theorem metadata, encryption samples, and missing reveal evidence.
