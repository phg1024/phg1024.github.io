/*
 Shape base class
 */
function Shape()
{
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
			
			var r1 = roots.min(), r2 = roots.max();
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
            var rv = ray.v.sub(n.mul(ray.v.dot(n)).mul(2)).normalized();

            // add lighting
            var c = phongShading( this, eyepos, hitPos, n, scene );

            return {
                hit: true, t: t,
                p: hitPos, color: c,
                newRay : {v:rv, p: hitPos, depth: ray.depth - 1},
                fr: this.material.fr
            };
        }
    };

    return that;
}
