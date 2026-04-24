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
// ========================================
// Random number generator (Mulberry32)
// ========================================
function createRNG(seed) {
    return function() {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ========================================
// Cosine-weighted hemisphere sampling
// ========================================
function cosineHemisphere(normal, u, v) {
    var r1 = Math.random();
    var r2 = Math.random();
    var theta = 2 * Math.PI * r1;
    var phi = Math.acos(Math.sqrt(r2));
    
    var x = Math.cos(theta) * Math.sin(phi);
    var y = Math.sin(theta) * Math.sin(phi);
    var z = Math.cos(phi);
    
    // Reconstruct orthonormal basis
    var N = normal;
    var B = u;
    var A = N.cross(B).normalize();
    B = A.cross(N).normalize();
    
    return new Vector3(
        N.x + x * A.x + y * B.x + z * N.x,
        N.y + x * A.y + y * B.y + z * N.y,
        N.z + x * A.z + y * B.z + z * N.z
    ).normalize();
}

// ========================================
// Hemisphere sampling (uniform)
// ========================================
function hemisphereSample(normal, u, v) {
    var r1 = Math.random();
    var r2 = Math.random();
    var theta = 2 * Math.PI * r1;
    var phi = Math.acos(1 - 2 * r2);
    
    var x = Math.sin(phi) * Math.cos(theta);
    var y = Math.sin(phi) * Math.sin(theta);
    var z = Math.cos(phi);
    
    var N = normal;
    var B = u;
    var A = N.cross(B).normalize();
    B = A.cross(N).normalize();
    
    return new Vector3(
        N.x + x * A.x + y * B.x + z * N.x,
        N.y + x * A.y + y * B.y + z * N.y,
        N.z + x * A.z + y * B.z + z * N.z
    ).normalize();
}

// ========================================
// Sample point on unit sphere
// ========================================
function sphereSample() {
    var r1 = Math.random();
    var r2 = Math.random();
    var theta = 2 * Math.PI * r1;
    var phi = Math.acos(2 * r2 - 1);
    
    var x = Math.sin(phi) * Math.cos(theta);
    var y = Math.sin(phi) * Math.sin(theta);
    var z = Math.cos(phi);
    
    return new Vector3(x, y, z);
}

// ========================================
// Russian Roulette
// ========================================
function russianRoulette(color, rng) {
    var max = Math.max(color.r, color.g, color.b) / 255.0;
    if (max < 0.01) return { survive: false, color: new Color(0, 0, 0, 255) };
    if (rng() < max) {
        return { survive: true, color: color.mul(1.0 / max) };
    }
    return { survive: false, color: new Color(0, 0, 0, 255) };
}
