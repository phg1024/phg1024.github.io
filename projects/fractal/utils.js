var PI = 3.14159265;

Array.prototype.max = function() {
    return Math.max.apply(null, this);
};

Array.prototype.min = function() {
    return Math.min.apply(null, this);
};

Array.prototype.mean = function() {
    return this.sum() / this.length;
}

Array.prototype.sum = function() {
    return this.reduce(function(a, b) { return a + b });
}

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