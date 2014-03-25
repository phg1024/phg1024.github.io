var PI = 3.14159265;

function clamp(val, lower, upper)
{
    if( val < lower ) return lower;
    else if( val > upper ) return upper;
    return val;
}

function quadraticSolve(a, b, c) {
    var delta = b*b - 4*a*c;
    if( delta < 0 )
    {
        return [];
    }
    else
    {
        return [(-b+Math.sqrt(delta))/(2.0*a), (-b-Math.sqrt(delta))/(2.0*a)];
    }
}

function reflect(n, v) {
    return v.sub(n.mul(v.dot(n)).mul(2)).normalized();
}

function refract(n, v, ior) {
    if( v.dot(n) < 0 )
    // entering ray
        return refract_impl(v, n, 1.0/ior);
    else
    // leaving ray
        return refract_impl(v, n.mul(-1), ior);
}

function refract_impl(I, N, ior) {
    var NdotI = N.dot(I);
    var k = 1.0 - ior * ior * (1.0 - NdotI*NdotI);
    if (k < 0.0)
        return new Vector3(0, 0, 0);
    else
        return I.mul(ior).sub(N.mul(ior * NdotI + Math.sqrt(k))).normalized();
}

/*
    Constructor for complex number
 */
function Complex(real, imaginary){
    if( isNaN(real) || isNaN(imaginary) )
        throw new TypeError();

    this.r = real;
    this.i = imaginary;
}

/*
    Addition
 */
Complex.prototype.add = function(that) {
    return new Complex(this.r + that.r, this.i + that.i);
};

/*
    Multiplication
 */
Complex.prototype.mul = function(that) {
    return new Complex(this.r * that.r - this.i * that.i,
                       this.r * that.i + this.i * that.r);
};

/*
    Magnitude
 */
Complex.prototype.mag = function() {
    return Math.sqrt(this.r * this.r + this.i * this.i);
};

/*
    Negation
 */
Complex.prototype.neg = function() {
    return new Complex(-this.r, -this.i);
};

/*
    stringify
 */
Complex.prototype.toString = function() {
    return "(" + this.r + ", " + this.i + ")";
};

/*
    Equality test
 */
Complex.prototype.equals = function(that) {
    return that != null &&
        that.constructor === Complex &&
        this.r === that.r && this.i === that.i;
};

Complex.ZERO = new Complex(0, 0);
Complex.ONE = new Complex(1, 0);
Complex.I = new Complex(0, 1);