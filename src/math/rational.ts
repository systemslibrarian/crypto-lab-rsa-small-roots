import { abs, gcd } from './integer';
export class Q {
  readonly a: bigint; readonly b: bigint;
  constructor(a: bigint, b=1n) {
    if(!b) throw Error('Zero rational denominator');
    if(b<0n) {a=-a;b=-b;} const g=gcd(a,b); this.a=a/g;this.b=b/g;
  }
  // These operations maintain coprimality algebraically. Avoid a second GCD
  // over the already normalized, much larger result of every multiplication.
  static normalized(a:bigint,b:bigint):Q {const q=Object.create(Q.prototype) as Q;Object.assign(q,{a,b});return q;}
  add(q: Q): Q {
    if(!this.a)return q;if(!q.a)return this;
    const g=gcd(this.b,q.b),a=this.a*(q.b/g)+q.a*(this.b/g),h=gcd(a,g);
    return Q.normalized(a/h,(this.b/g)*(q.b/h));
  }
  sub(q: Q): Q { return this.add(q.neg()); }
  mul(q: Q): Q {
    if(!this.a || !q.a)return zero;
    const g=gcd(this.a,q.b),h=gcd(q.a,this.b);return Q.normalized((this.a/g)*(q.a/h),(this.b/h)*(q.b/g));
  }
  div(q: Q): Q {if(!q.a)throw Error('Zero rational divisor');return this.mul(Q.normalized(q.a<0n?-q.b:q.b,abs(q.a)));}
  neg(): Q {return Q.normalized(-this.a,this.b);}
  cmp(q: Q): bigint {return this.a*q.b-q.a*this.b;}
  // Nearest integer, with half-integer ties away from zero, including negatives.
  round(): bigint {const x=(2n*abs(this.a)+this.b)/(2n*this.b);return this.a<0n?-x:x;}
  toString(): string {return this.b===1n?`${this.a}`:`${this.a}/${this.b}`;}
}
export const zero = new Q(0n), one = new Q(1n);
