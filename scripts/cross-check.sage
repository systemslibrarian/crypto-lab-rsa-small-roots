# Independent SageMath 10.8 cross-check. Run: sage scripts/cross-check.sage
# Public inputs only. Compare valid roots, never particular LLL output rows.
import json
from pathlib import Path
from sage.version import version as sage_version
assert sage_version == '10.8'
data = json.loads(Path('src/fixtures/public.json').read_text())
R = PolynomialRing(ZZ, 'x'); x = R.gen()
known_ring = PolynomialRing(Zmod(10001), 'x', implementation='NTL')
known_x = known_ring.gen()
assert 4 in (known_x**3+10*known_x**2+5000*known_x-222).small_roots(X=8,beta=1)
print('Published Sage small_roots root-4 control verified')
observations = {}

def verify_matrix(original, reduced, transform, expected_det):
    assert transform*original == reduced and abs(transform.det()) == 1
    assert abs(original.det()) == expected_det == abs(reduced.det())
    orthogonal, norms, mu = [], [], {}
    for i in range(reduced.nrows()):
        v = vector(QQ, reduced.row(i))
        for j in range(i):
            coefficient = vector(QQ,reduced.row(i)).dot_product(orthogonal[j])/norms[j]
            mu[i,j] = coefficient
            assert abs(coefficient) <= 1/2
            v -= coefficient*orthogonal[j]
        orthogonal.append(v); norms.append(v.dot_product(v))
        assert norms[i] > 0
        if i: assert norms[i] >= (3/4-mu[i,i-1]**2)*norms[i-1]

for fixture in data['fixtures']:
    c = fixture['challenge']; N = ZZ(c['N'])
    if c['scenario'] == 'wiener':
        e = ZZ(c['e']); winner = None
        convergent_rows = continued_fraction(QQ(e)/N).convergents()
        for approximation in convergent_rows:
            k, d = approximation.numerator(), approximation.denominator()
            if k == 0 or (e*d-1) % k: continue
            phi = (e*d-1)//k; total = N-phi+1; delta = total*total-4*N
            if delta < 0 or not ZZ(delta).is_square(): continue
            root = ZZ(delta).sqrt()
            if (total+root) % 2: continue
            p, q = (total+root)//2, (total-root)//2
            if p*q == N: winner = int(d); break
        observations[fixture['name']] = {'wiener': True, 'recovered': winner, 'convergents': len(convergent_rows)}
        print(fixture['name'], 'recovered' if winner is not None else 'no convergent factors N')
        continue
    X = ZZ(2)**c['suffixBits']
    m = fixture['params']['m']; t = fixture['params']['t']
    if c['scenario'] == 'message':
        A = ZZ(c['prefixValue'])*X
        raw = (A+x)**3-ZZ(c['ciphertext'])
        f = R([((ZZ(raw[i])+N//2)%N)-N//2 for i in range(3)]+[1])
    else:
        f = x+ZZ(c['pHigh'])
    r = f.degree(); n = r*m+t
    polys = [N**(m-i)*x**j*f**i for i in range(m) for j in range(r)] + [x**j*f**m for j in range(t)]
    B = matrix(ZZ,[[g[i]*X**i for i in range(n)] for g in polys])
    D = N**(r*m*(m+1)//2)*X**(n*(n-1)//2)
    assert abs(B.det()) == D
    reduced, transform = B.LLL(delta=3/4,eta=0.5,transformation=True)
    verify_matrix(B,reduced,transform,D)
    candidates = set()
    for row in reduced:
        h = R([ZZ(row[i]//X**i) for i in range(n)])
        assert all(row[i]%X**i == 0 for i in range(n))
        for root, multiplicity in h.roots(ZZ):
            if not (0 <= root < X): continue
            if c['scenario'] == 'message':
                if power_mod(A+root,3,N) == ZZ(c['ciphertext']): candidates.add(int(root))
            else:
                p = ZZ(c['pHigh'])+root
                if 1 < p < N and N%p == 0 and p*p >= N: candidates.add(int(root))
    Q_bound = n*(n-1); C_bound = ZZ(n)**n*ZZ(2)**(n*(n-1)//2)
    E_bound = (2 if c['scenario']=='message' else 1)*m*n-r*m*(m+1)
    prediction = E_bound > 0 and C_bound*X**Q_bound < N**E_bound
    observations[fixture['name']] = {'roots':sorted(candidates),'prediction':bool(prediction)}
    print(fixture['name'], sorted(candidates))

# Oracle checks occur only after the independent public attacks return.
oracle = {record['name']:record for record in json.loads(Path('src/fixtures/oracle.json').read_text())}
for name, observation in observations.items():
    truth = oracle[name]; expected = set() if truth['secret'] is None else {int(truth['secret'])}
    if observation.get('wiener'):
        expected_recovery = None if truth['observedRecovery'] is None else int(truth['observedRecovery'])
        assert observation['recovered'] == expected_recovery
        continue
    assert set(observation['roots']).issubset(expected)
    if observation['prediction']: assert set(observation['roots']) == expected

for filename in sorted(Path('.qa-artifacts/math').glob('*.json')):
    if filename.name == 'observations.json': continue
    record = json.loads(filename.read_text())
    if record['challenge']['scenario'] == 'wiener':
        N, e = ZZ(record['challenge']['N']), ZZ(record['challenge']['e'])
        ladder = continued_fraction(QQ(e)/N).convergents()
        assert [(ZZ(row['k']),ZZ(row['d'])) for row in record['rows']] == [(v.numerator(),v.denominator()) for v in ladder[:len(record['rows'])]]
        assert len(record['rows']) <= 2*N.nbits()
        print(filename.name, 'browser continued fractions independently verified')
        continue
    original = matrix(ZZ,record['lattice']['B']); reduced = matrix(ZZ,record['reduction']['B']); transform = matrix(ZZ,record['reduction']['U'])
    verify_matrix(original,reduced,transform,ZZ(record['lattice']['D']))
    X = ZZ(record['derived']['X'])
    for search in record['searches']:
        h = R([ZZ(v) for v in record['rows'][search['row']]['h']])
        independent = sorted(root for root,multiplicity in h.roots(ZZ) if 0 <= root < X)
        reported = sorted(ZZ(v) for v in search['roots'])
        if search['complete']: assert independent == reported
        else: assert set(reported).issubset(independent)
    print(filename.name, 'browser U, reducedness, determinant, and exact integer roots verified')
print('All SageMath 10.8 cross-checks passed')
