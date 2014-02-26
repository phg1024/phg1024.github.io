function Point2(x, y) {
    if( arguments.length != 2 ) {
        this.x = this.y = 0;
    }
    else {
        this.x = x; this.y = y;
    }
}

Point2.prototype.distanceTo = function( that ) {
    var dx = this.x - that.x;
    var dy = this.y - that.y;
    return Math.sqrt(dx * dx + dy * dy);
};

Point2.prototype.add = function( that ) {
    return new Point2(this.x + that.x, this.y + that.y);
};

Point2.prototype.sub = function( that ) {
    return new Point2(this.x - that.x, this.y - that.y);
}
Point2.prototype.mul = function( factor ) {
    return new Point2(this.x * factor, this.y * factor);
};

function Point3(x, y, z) {
    if( arguments.length != 3 ){
        this.x = this.y = 0;
    }
    else
    {
        this.x = x; this.y = y; this.z = z;
    }
}

Point3.prototype.distanceTo = function( that ) {
    var dx = this.x - that.x;
    var dy = this.y - that.y;
    var dz = this.z - that.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
};

Point3.prototype.add = function( that ) {
    return new Point3(this.x + that.x, this.y + that.y, this.z + that.z);
};

Point3.prototype.sub = function( that ) {
    return new Point3(this.x - that.x, this.y - that.y, this.z - that.z);
};

Point3.prototype.mul = function( factor ) {
    return new Point3(this.x * factor, this.y * factor, this.z * factor);
};