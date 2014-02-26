function Vector2(x, y) {
    if (arguments.length != 2) {
        this.x = this.y = 0;
    } else {
        this.x = x;
        this.y = y;
    }
}

Vector2.prototype.add = function( that ) {
    return new Vector2(this.x + that.x, this.y + that.y);
};

Vector2.prototype.mul = function( factor ) {
    return new Vector2(this.x * factor, this.y * factor);
};

Vector2.prototype.dot = function (that) {
    return this.x * that.x + this.y * that.y;
};

Vector2.prototype.cross = function( that ) {
    return this.x * that.y - this.y * that.x;
};

Vector2.prototype.normSquared = function() {
    return this.x * this.x + this.y * this.y;
};

Vector2.prototype.norm = function() {
    return Math.sqrt( this.x * this.x + this.y * this.y );
};

Vector2.prototype.normalize = function() {
    var L = this.norm();
    var THRES = 1e-16;
    if( L > THRES ) {
        this.x /= L;
        this.y /= L;
    }
    return this;
};

function Vector3(x, y, z) {
    if (arguments.length != 3) {
        this.x = this.y = this.z = 0;
    } else {
        this.x = x; this.y = y; this.z = z;
    }
}

Vector3.fromPoint3 = function( p1, p2 ) {
    return new Vector3(p2.x-p1.x, p2.y-p1.y, p2.z-p1.z);
};

Vector3.prototype.add = function( that ) {
    return new Vector3(this.x + that.x, this.y + that.y, this.z + that.z);
};

Vector3.prototype.sub = function( that ) {
    return new Vector3(this.x - that.x, this.y - that.y, this.z - that.z);
};

Vector3.prototype.mul = function( factor ) {
    return new Vector3(this.x * factor, this.y * factor, this.z * factor);
};

Vector3.prototype.dot = function (that) {
    return this.x * that.x + this.y * that.y + this.z * that.z;
};

Vector3.prototype.cross = function( that ) {
    return new Vector3(
        this.y * that.z - this.z * that.y,
        this.z + that.x - this.x * that.z,
        this.x * that.y - this.y * that.x
    );
};

Vector3.prototype.normSquared = function() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
};

Vector3.prototype.norm = function() {
    return Math.sqrt( this.x * this.x + this.y * this.y + this.z * this.z);
};

Vector3.prototype.normalize = function() {
    var L = this.norm();
    var THRES = 1e-16;
    if( L > THRES ) {
        this.x /= L;
        this.y /= L;
        this.z /= L;
    }
    return this;
};

Vector3.prototype.normalized = function() {
    var v = new Vector3(this.x, this.y, this.z);
    v.normalize();
    return v;
}