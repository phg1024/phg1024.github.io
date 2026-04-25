var PI = 3.14159265;

Array.prototype.max = function() {
    return Math.max.apply(null, this);
};

Array.prototype.min = function() {
    return Math.min.apply(null, this);
};

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
