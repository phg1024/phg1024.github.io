/*
 Shape base class
 */
function Shape()
{
    this.distanceTo = function(x, y)
    {
        return 0;
    };
    this.isInside = function(x, y)
    {
        return ( this.distanceTo(x, y) < 0 );
    };
    this.intersect = function( ray )
    {
        return {hit: false, t: 0, p: new Point3(), color: new Color()};
    };
}

// ================================================================
//  3D shapes
// ================================================================
function Sphere(center, radius, color, material)
{
    var that = new Shape();
    that.center = center;
    that.radius = radius;
    that.r2 = radius * radius;
    that.color = color;
    that.material = material;
	
	// given a point and a direction, return intersection parameter t
	that.intersectT = function( p, v ) {
        var pq = Vector3.fromPoint3(this.center, p);
        var a = 1.0;
        var b = 2.0 * pq.dot(v);
        var c = pq.normSquared() - this.r2;
		
        var roots = quadraticSolve(a, b, c);
		if( roots.length === 0 )
		{
			return undefined;
		}
		else
		{
            var THRES = 1e-6;
			
			var r1 = Math.min(roots[0], roots[1]), r2 = Math.max(roots[0], roots[1]);
			if( r2 < THRES ) {
				return undefined;
			}
			else
			{
				if( r1 < THRES ) return r2;
				else return r1;
			}			
		}
	}
	
    that.intersect = function( ray, scene, eyepos ) {
		var t = this.intersectT(ray.p, ray.v);
		
        if( t === undefined )
        {
			// no hit
            return {
                hit: false, t: Number.MAX_VALUE,
                p: new Point3(), color: new Color()
            };
        }
        else
        {
			// hit at t
            var hitPos = ray.p.add(ray.v.mul(t));
            var n = Vector3.fromPoint3(this.center, hitPos).normalized();

            // reflected
            var rv;
            if( this.material.refractive ) {
                rv = refract(n, ray.v.normalized(), this.material.ior);
            }
            else {
                rv = reflect(n, ray.v);
            }

            // add lighting
            var c = shading( this, eyepos, hitPos, n, scene );

            return {
                hit: true, t: t,
                p: hitPos, color: c,
                newRay : {v:rv, p: hitPos, depth: ray.depth - 1},
                ior: this.material.refractive ?0.7:this.material.ior
            };
        }
    };

    return that;
}

// ================================================================
//  2D shapes
// ================================================================
/*
 Edge
 */
function Edge(p, n, dir)
{
    var that = new Shape();
    that.p = p;
    that.n = n.normalize();
    that.dir = dir;
    that.distanceTo = function(x, y) {
        return n.dot( new Vector2(x - p.x, y - p.y) );
    };
    return that;
}

/*
 Polygon
 */
function Polygon( isConcave )
{
    var that = new Shape();

    that.isConcave = isConcave;
    that.e = [];
    that.v = [];

    if( !isConcave || (isConcave === undefined))
    {
        that.distanceTo = function(x, y) {
            var res = -1e32;
            for(var i=0; i<this.e.length; i++) {
                var dist = this.e[i].distanceTo(x, y);
                res = Math.max(res, dist);
            }
            return res;
        };
    }
    else
    {
        // ray casting
        that.distanceTo = function(x, y){
            var THRES = 0;//1e-3;
            var cnt = 0;
            for(var i=0;i<this.e.length;i++)
            {
                var dir = this.e[i].dir;
                var flag = false;
                if( Math.abs(dir.y) < THRES )
                {
                    if( Math.abs(this.e[i].p.y - y) < THRES )
                        flag = true;
                }
                else
                {
                    var t = (y - this.e[i].p.y) / dir.y;
                    if( (t > -THRES) && (t <= 1 - THRES) )
                    {
                        var xi = this.e[i].p.x + t * dir.x;
                        if( xi >= x )
                            flag = true;
                    }
                }

                if( flag ) cnt++;
            }
            return (cnt % 2 === 1)?-1:1;
        };
    }

    that.genEdges = function() {
        this.e = [];
        for(var i=0; i<this.v.length; i++) {
            var j = (i+1) % this.v.length;
            var dir = new Vector2(this.v[j].x - this.v[i].x, this.v[j].y - this.v[i].y);
            var n = new Vector2(dir.y, -dir.x);
            var ed = new Edge(this.v[i], n, dir);
            this.e.push(ed);
        }
    };

    that.addVertex = function( p ) {
        this.v.push(p);
    };

    return that;
}

/*
 Circle
 */
function Circle(x, y, r) {
    var that = new Shape();
    that.r = r;
    that.x = x;
    that.y = y;
    that.r2 = r * r;

    that.distanceTo = function( x, y )
    {
        var dx = x - this.x;
        var dy = y - this.y;
        return (Math.sqrt(dx*dx+dy*dy) - r);
    };

    return that;
}

/*
 Star
 */
function Star(x, y, r, corners) {
    var that = new Shape();

    that.x = x;
    that.y = y;
    that.r = r;
    that.corners = corners;

    that.e = [];
    var center = new Point2(x, y);
    var theta = PI / corners * ((corners & 0x1)?0.5:1.0);
    for( var i=0; i<corners; i++ ) {
        var n = new Vector2(Math.cos(theta), Math.sin(theta));
        var p = center.add( (new Point2(Math.cos(theta), Math.sin(theta))).mul(r) );
        that.e.push(new Edge(p, n));

        theta += 2.0 * PI / corners;
    }

    that.distanceTo = function(x, y) {
        var cnt = 0;
        for(var i=0;i<corners;i++) {
            if( this.e[i].distanceTo(x, y) <= 0 )
                cnt++;
        }
        return ((cnt >= (corners-1))?-1:1);
    };

    return that;
}

/*
 Blobby
 */
function Blobby() {
    var that = new Shape();

    that.circles = [];

    that.addCircle = function( c ) {
        this.circles.push( c );
        console.log(this.circles.length);
    };

    that.distanceTo = function( x, y ) {
        var alpha = 1.5e-4;
        var res = 0;
        for( var i=0;i<this.circles.length;i++) {
            var dx = x - this.circles[i].x;
            var dy = y - this.circles[i].y;

            res += Math.exp( -alpha * ((dx*dx+dy*dy) - this.circles[i].r2) );
        }
        res = -1.0 / alpha * Math.log(res);
        return res;
    };

    return that;
}

function FunctionShape( fun ) {
    var that = new Shape();

    that.distanceTo = function( x, y ) {
        return fun(x, y);
    };

    return that;
}