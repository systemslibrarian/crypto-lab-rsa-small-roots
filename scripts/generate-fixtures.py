"""Offline, independent fixture inputs. Requires SageMath 10.8 or SymPy 1.14.0.

Run: sage -python scripts/generate-fixtures.py --backend sage
Alternative: python scripts/generate-fixtures.py --backend sympy
Outputs public inputs and separate oracle records. No browser runtime dependency.
The fixed seed is for offline reproducibility only; live keys use browser CSPRNG.
"""
import json
import random
import argparse
import math
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--backend', choices=['sage', 'sympy'], default='sage')
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if args.backend == 'sage':
    from sage.all import ZZ, next_prime
    from sage.version import version as sage_version
    assert sage_version == '10.8'
    nextprime = lambda n: int(next_prime(ZZ(n), proof=True))
    provenance = 'SageMath 10.8; deterministic seed 20261006; proved primes'
else:
    import sympy
    assert sympy.__version__ == "1.14.0"
    nextprime = lambda n: int(sympy.nextprime(n))
    provenance = 'SymPy 1.14.0; deterministic seed 20261006'
target = args.output_dir or Path(__file__).resolve().parent.parent / "src" / "fixtures"
target.mkdir(exist_ok=True)
rng = random.Random(20261006)

def prime():
    while True:
        p = nextprime(rng.getrandbits(255) | (1 << 255))
        if p.bit_length() == 256 and p % 3 == 2:
            return p

while True:
    p, q = sorted((prime(), prime()), reverse=True)
    N = p * q
    if p != q and N.bit_length() == 512:
        break
prefix = int.from_bytes(b"crypto-lab://known-prefix/", "big")
fixtures, oracles = [], []
for scenario, widths, m, t in [("message", [64, 120, 126, 128, 136, 168], 2, 2), ("factor", [80, 96, 100, 104, 112, 152], 3, 3)]:
    for k in widths:
        X = 1 << k
        if scenario == "message":
            secret = rng.randrange(X)
            message = prefix * X + secret
            assert message < N and message**3 >= N
            c = {"scenario": scenario, "N": str(N), "e": 3, "prefixValue": str(prefix), "suffixBits": k, "ciphertext": str(pow(message, 3, N))}
            assert pow(int(c["ciphertext"]), pow(3, -1, (p-1)*(q-1)), N) == message
        else:
            hint = p // X * X
            secret = p - hint
            c = {"scenario": scenario, "N": str(N), "pHigh": str(hint), "suffixBits": k, "model": "larger-prime"}
        name = f"{scenario}-{k}"
        fixtures.append({"name": name, "challenge": c, "params": {"m": m, "t": t}})
        oracles.append({"name": name, "secret": str(secret), "p": str(p), "q": str(q)})
fixtures.append({"name": "negative-tiny", "challenge": {"scenario": "message", "N": "55", "e": 3, "prefixValue": "2", "suffixBits": 3, "ciphertext": "27"}, "params": {"m": 2, "t": 2}})
assert not any(pow(16+x, 3, 55) == 27 for x in range(8))
oracles.append({"name": "negative-tiny", "secret": None, "p": "11", "q": "5"})

def unconstrained_prime(bits):
    while True:
        candidate = nextprime(rng.getrandbits(bits - 1) | (1 << (bits - 1)) | 1)
        if candidate.bit_length() == bits:
            return candidate

def wiener_recovery(e, modulus):
    x, y = e, modulus
    p0, p1, q0, q1 = 0, 1, 1, 0
    while y:
        a, x, y = x // y, y, x % y
        k, d = a * p1 + p0, a * q1 + q0
        p0, p1, q0, q1 = p1, k, q1, d
        if k == 0 or (e * d - 1) % k:
            continue
        phi = (e * d - 1) // k
        total = modulus - phi + 1
        delta = total * total - 4 * modulus
        if delta < 0:
            continue
        root = math.isqrt(delta)
        if root * root != delta or (total + root) % 2:
            continue
        left, right = (total + root) // 2, (total - root) // 2
        if left * right == modulus:
            return d
    return None

while True:
    wp, wq = sorted((unconstrained_prime(512), unconstrained_prime(512)), reverse=True)
    wN, wphi = wp * wq, (wp - 1) * (wq - 1)
    if wp != wq and wN.bit_length() == 1024 and math.gcd(65537, wphi) == 1:
        break

boundary = math.isqrt(math.isqrt((wN - 1) // 81))
while 81 * boundary**4 >= wN:
    boundary -= 1
while 81 * (boundary + 1)**4 < wN:
    boundary += 1

def random_private(width, predicate=lambda value: True):
    low = 1 << (width - 1)
    while True:
        value = (low + rng.randrange(low)) | 1
        if math.gcd(value, wp - 1) == math.gcd(value, wq - 1) == 1 and predicate(value):
            return value

inside = random_private(boundary.bit_length() - 24, lambda value: 81 * value**4 < wN)
edge = boundary if boundary & 1 else boundary - 1
while math.gcd(edge, wp - 1) != 1 or math.gcd(edge, wq - 1) != 1:
    edge -= 2

def missed_above(width, require_boneh_range=False):
    while True:
        value = random_private(width, lambda candidate: 81 * candidate**4 >= wN)
        exponent = pow(value, -1, wphi)
        if exponent < wN and wiener_recovery(exponent, wN) is None and (not require_boneh_range or value**250 < wN**73):
            return value

above = missed_above(boundary.bit_length() + 3, True)
far = missed_above(min(wN.bit_length() // 2, boundary.bit_length() + 72))
wiener_cases = [
    ("wiener-inside", inside, pow(inside, -1, wphi)),
    ("wiener-boundary", edge, pow(edge, -1, wphi)),
    ("wiener-above", above, pow(above, -1, wphi)),
    ("wiener-far", far, pow(far, -1, wphi)),
    ("wiener-65537", pow(65537, -1, wphi), 65537),
]
for name, private, public in wiener_cases:
    assert public < wN
    observed = wiener_recovery(public, wN)
    fixtures.append({"name": name, "challenge": {"scenario": "wiener", "N": str(wN), "e": str(public)}, "params": {"m": 0, "t": 0}})
    oracles.append({"name": name, "secret": str(private), "p": str(wp), "q": str(wq), "dBits": private.bit_length(), "insideGuarantee": 81 * private**4 < wN, "belowBonehDurfee": private**250 < wN**73, "observedRecovery": None if observed is None else str(observed)})

(target / "public.json").write_text(json.dumps({"generator": provenance, "fixtures": fixtures}, indent=2)+"\n")
(target / "oracle.json").write_text(json.dumps(oracles, indent=2)+"\n")
print(f"Generated {len(fixtures)} independently constructed inputs; oracle stored separately.")
