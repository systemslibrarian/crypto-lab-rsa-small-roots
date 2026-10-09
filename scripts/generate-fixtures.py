"""Offline, independent fixture inputs. Requires SageMath 10.8 or SymPy 1.14.0.

Run: sage -python scripts/generate-fixtures.py --backend sage
Alternative: python scripts/generate-fixtures.py --backend sympy
Outputs public inputs and separate oracle records. No browser runtime dependency.
The fixed seed is for offline reproducibility only; live keys use browser CSPRNG.
"""
import json
import random
import argparse
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
(target / "public.json").write_text(json.dumps({"generator": provenance, "fixtures": fixtures}, indent=2)+"\n")
(target / "oracle.json").write_text(json.dumps(oracles, indent=2)+"\n")
print(f"Generated {len(fixtures)} independently constructed inputs; oracle stored separately.")
