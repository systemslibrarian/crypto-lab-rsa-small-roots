"""Independent exact matrix/root cross-check of generated test transcripts.

Run with SymPy 1.14.0 over .qa-artifacts/math/*.json except observations.json.
No oracle imports and no modular success values taken on trust.
"""
import json
import sys
import math
import sympy as s
assert s.__version__ == '1.14.0'
x = s.Symbol('x')
for filename in sys.argv[1:]:
    record = json.load(open(filename))
    if record['challenge']['scenario'] == 'wiener':
        N, e = int(record['challenge']['N']), int(record['challenge']['e'])
        x_num, x_den = e, N
        p0, p1, q0, q1 = 0, 1, 1, 0
        ladder, winner = [], None
        while x_den:
            a, x_num, x_den = x_num // x_den, x_den, x_num % x_den
            k, d = a * p1 + p0, a * q1 + q0
            p0, p1, q0, q1 = p1, k, q1, d
            ladder.append((a, k, d))
            if k == 0 or (e * d - 1) % k:
                continue
            phi = (e * d - 1) // k
            total = N - phi + 1
            delta = total * total - 4 * N
            if delta < 0:
                continue
            root = math.isqrt(delta)
            if root * root != delta or (total + root) % 2:
                continue
            p, q = (total + root) // 2, (total - root) // 2
            if p * q == N:
                winner = (d, p, q)
                break
        rows = record['rows']
        assert [(int(row['a']), int(row['k']), int(row['d'])) for row in rows] == ladder[:len(rows)]
        assert len(rows) == len(ladder) == record['testedCount']
        assert record['searchComplete'] is True
        assert len(rows) <= 2 * N.bit_length() == record['lemmaBound']
        reported = record['recovered']
        if winner is None:
            assert reported is None and record['status'] == 'no-verified-root-found'
        else:
            assert reported is not None and tuple(map(int, (reported['d'], reported['p'], reported['q']))) == winner
            assert record['status'] == 'verified-recovery'
        print(filename, 'independent continued fractions and winning row verified')
        continue
    N = int(record['challenge']['N']); X = int(record['derived']['X'])
    m = record['params']['m']; t = record['params']['t']; f = sum(int(v)*x**i for i,v in enumerate(record['derived']['f']))
    r = s.degree(f,x); n = r*m+t
    polys = [N**(m-i)*x**j*f**i for i in range(m) for j in range(r)]+[x**j*f**m for j in range(t)]
    expected = s.Matrix([[s.Poly(g,x).nth(i)*X**i for i in range(n)] for g in polys])
    B = s.Matrix([[int(v) for v in row] for row in record['lattice']['B']])
    R = s.Matrix([[int(v) for v in row] for row in record['reduction']['B']])
    U = s.Matrix([[int(v) for v in row] for row in record['reduction']['U']])
    assert B == expected and U*B == R and abs(U.det()) == 1
    assert abs(B.det()) == int(record['lattice']['D']) == abs(R.det())
    orthogonal, mu, norms = [], {}, []
    for i in range(n):
        v = R.row(i)
        for j in range(i):
            coefficient = R.row(i).dot(orthogonal[j])/norms[j]
            mu[i,j] = coefficient
            assert abs(coefficient) <= s.Rational(1,2)
            v = v-coefficient*orthogonal[j]
        orthogonal.append(v); norms.append(v.dot(v))
        assert norms[i] > 0
        if i: assert norms[i] >= (s.Rational(3,4)-mu[i,i-1]**2)*norms[i-1]
    for search in record['searches']:
        original = record['rows'][search['row']]['h']
        h = s.Poly(sum(int(v)*x**i for i,v in enumerate(original)),x)
        independent = sorted(int(v) for v in h.ground_roots() if v.is_Integer and 0<=v<X)
        if search['complete']: assert independent == [int(v) for v in search['roots']]
        else: assert set(map(int,search['roots'])).issubset(independent)
    print(filename, 'independent basis, equivalence, reducedness, and integer roots verified')
