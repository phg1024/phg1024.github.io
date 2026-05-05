import { Point2, Point3 } from './point.js';
import { Vector2, Vector3 } from './vector.js';
import { PI, quadraticSolve, reflect, refract } from './utils.js';
import { Color } from './image.js';
import { materialValue, shading } from './raytracer.js';

/*
 Shape base class
 */
export function Shape()
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
export function Sphere(center, radius, color, material)
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

            var reflectivity = this.material.refractive ? 0.7 : materialValue(this.material.Ks, this.material.ior);

            return {
                hit: true, t: t,
                p: hitPos, color: c,
                newRay : {v:rv, p: hitPos, depth: ray.depth - 1},
                ior: reflectivity
            };
        }
    };

    return that;
}

export function TriangleMesh(vertices, indices, color, material, transform)
{
    var that = new Shape();
    that.color = color;
    that.material = material;
    that.vertices = [];
    that.vertexNormals = [];
    that.triangles = [];
    that.bvhNodes = [];
    that.bvhTriangles = [];
    that.useBvh = !(transform && transform.useBvh === false);

    var scale = transform && transform.scale !== undefined ? transform.scale : 1.0;
    var offset = transform && transform.offset ? transform.offset : new Vector3(0, 0, 0);
    var rotateY = transform && transform.rotateY !== undefined ? transform.rotateY : 0.0;
    var cosY = Math.cos(rotateY);
    var sinY = Math.sin(rotateY);
    var minBound = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    var maxBound = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (var i = 0; i < vertices.length; i += 3) {
        var scaledX = vertices[i] * scale;
        var scaledY = vertices[i + 1] * scale;
        var scaledZ = vertices[i + 2] * scale;
        var point = new Point3(
            scaledX * cosY + scaledZ * sinY + offset.x,
            scaledY + offset.y,
            -scaledX * sinY + scaledZ * cosY + offset.z
        );
        that.vertices.push(point);
        that.vertexNormals.push(new Vector3(0, 0, 0));
        minBound.x = Math.min(minBound.x, point.x);
        minBound.y = Math.min(minBound.y, point.y);
        minBound.z = Math.min(minBound.z, point.z);
        maxBound.x = Math.max(maxBound.x, point.x);
        maxBound.y = Math.max(maxBound.y, point.y);
        maxBound.z = Math.max(maxBound.z, point.z);
    }

    that.boundsMin = minBound;
    that.boundsMax = maxBound;
    that.center = new Point3(
        (minBound.x + maxBound.x) * 0.5,
        (minBound.y + maxBound.y) * 0.5,
        (minBound.z + maxBound.z) * 0.5
    );

    for (var triIndex = 0; triIndex < indices.length; triIndex += 3) {
        var i0 = indices[triIndex];
        var i1 = indices[triIndex + 1];
        var i2 = indices[triIndex + 2];
        var v0 = that.vertices[i0];
        var v1 = that.vertices[i1];
        var v2 = that.vertices[i2];
        var edge1 = Vector3.fromPoint3(v0, v1);
        var edge2 = Vector3.fromPoint3(v0, v2);
        var faceNormal = edge1.cross(edge2);
        that.vertexNormals[i0] = that.vertexNormals[i0].add(faceNormal);
        that.vertexNormals[i1] = that.vertexNormals[i1].add(faceNormal);
        that.vertexNormals[i2] = that.vertexNormals[i2].add(faceNormal);
        var triMin = new Point3(
            Math.min(v0.x, v1.x, v2.x),
            Math.min(v0.y, v1.y, v2.y),
            Math.min(v0.z, v1.z, v2.z)
        );
        var triMax = new Point3(
            Math.max(v0.x, v1.x, v2.x),
            Math.max(v0.y, v1.y, v2.y),
            Math.max(v0.z, v1.z, v2.z)
        );
        that.triangles.push({
            i0: i0,
            i1: i1,
            i2: i2,
            normal: faceNormal.normalized(),
            boundsMin: triMin,
            boundsMax: triMax,
            centroid: new Point3(
                (v0.x + v1.x + v2.x) / 3.0,
                (v0.y + v1.y + v2.y) / 3.0,
                (v0.z + v1.z + v2.z) / 3.0
            )
        });
    }

    for (var normalIdx = 0; normalIdx < that.vertexNormals.length; normalIdx++) {
        that.vertexNormals[normalIdx] = that.vertexNormals[normalIdx].normalized();
    }

    buildBVH(that);

    that.intersectBoundsT = function(p, v) {
        var minT = -Infinity;
        var maxT = Infinity;
        var boundsMin = this.boundsMin;
        var boundsMax = this.boundsMax;
        var origins = [p.x, p.y, p.z];
        var dirs = [v.x, v.y, v.z];
        var mins = [boundsMin.x, boundsMin.y, boundsMin.z];
        var maxs = [boundsMax.x, boundsMax.y, boundsMax.z];

        for (var axis = 0; axis < 3; axis++) {
            var dir = dirs[axis];
            var origin = origins[axis];
            if (Math.abs(dir) < 1e-8) {
                if (origin < mins[axis] || origin > maxs[axis]) {
                    return undefined;
                }
                continue;
            }

            var invDir = 1.0 / dir;
            var t0 = (mins[axis] - origin) * invDir;
            var t1 = (maxs[axis] - origin) * invDir;
            if (t0 > t1) {
                var swap = t0;
                t0 = t1;
                t1 = swap;
            }
            minT = Math.max(minT, t0);
            maxT = Math.min(maxT, t1);
            if (maxT < minT) {
                return undefined;
            }
        }

        return maxT > 1e-6 ? minT : undefined;
    };

    that.intersectDetail = function(p, v) {
        if (this.intersectBoundsT(p, v) === undefined) {
            return null;
        }

        var bestT = Number.POSITIVE_INFINITY;
        var bestNormal = null;
        if (!this.useBvh) {
            var bruteForceHit = intersectTriangleRange(this, this.triangles, 0, this.triangles.length, p, v, bestT);
            bestT = bruteForceHit.bestT;
            bestNormal = bruteForceHit.bestNormal;
        } else {
            var stack = [0];

            while (stack.length) {
                var node = this.bvhNodes[stack.pop()];
                if (!intersectAabb(node.boundsMin, node.boundsMax, p, v, bestT)) {
                    continue;
                }

                if (node.count > 0) {
                    var leafHit = intersectTriangleRange(this, this.bvhTriangles, node.start, node.count, p, v, bestT);
                    bestT = leafHit.bestT;
                    bestNormal = leafHit.bestNormal || bestNormal;
                } else {
                    stack.push(node.right);
                    stack.push(node.left);
                }
            }
        }

        if (bestNormal === null) {
            return null;
        }

        return { t: bestT, normal: bestNormal };
    };

    that.intersectT = function(p, v) {
        var hit = this.intersectDetail(p, v);
        return hit ? hit.t : undefined;
    };

    that.intersect = function(ray, scene, eyepos) {
        var detail = this.intersectDetail(ray.p, ray.v);
        if (!detail) {
            return {
                hit: false, t: Number.MAX_VALUE,
                p: new Point3(), color: new Color()
            };
        }

        var hitPos = ray.p.add(ray.v.mul(detail.t));
        var n = detail.normal;
        if (n.dot(ray.v) > 0) {
            n = n.mul(-1);
        }

        var rv;
        if (this.material.refractive) {
            rv = refract(n, ray.v.normalized(), this.material.ior);
        } else {
            rv = reflect(n, ray.v);
        }

        var c = shading(this, eyepos, hitPos, n, scene);
        var reflectivity = this.material.refractive ? 0.7 : materialValue(this.material.Ks, this.material.ior);

        return {
            hit: true, t: detail.t,
            p: hitPos, color: c, normal: n,
            newRay: {v: rv, p: hitPos, depth: ray.depth - 1},
            ior: reflectivity
        };
    };

    return that;
}

function buildBVH(mesh) {
    var orderedTriangles = [];
    var nodes = [];
    var triangleIndices = [];
    for (var i = 0; i < mesh.triangles.length; i++) {
        triangleIndices.push(i);
    }

    function computeBounds(indices) {
        var min = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        var max = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
        var centroidMin = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        var centroidMax = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

        for (var i = 0; i < indices.length; i++) {
            var tri = mesh.triangles[indices[i]];
            min.x = Math.min(min.x, tri.boundsMin.x);
            min.y = Math.min(min.y, tri.boundsMin.y);
            min.z = Math.min(min.z, tri.boundsMin.z);
            max.x = Math.max(max.x, tri.boundsMax.x);
            max.y = Math.max(max.y, tri.boundsMax.y);
            max.z = Math.max(max.z, tri.boundsMax.z);
            centroidMin.x = Math.min(centroidMin.x, tri.centroid.x);
            centroidMin.y = Math.min(centroidMin.y, tri.centroid.y);
            centroidMin.z = Math.min(centroidMin.z, tri.centroid.z);
            centroidMax.x = Math.max(centroidMax.x, tri.centroid.x);
            centroidMax.y = Math.max(centroidMax.y, tri.centroid.y);
            centroidMax.z = Math.max(centroidMax.z, tri.centroid.z);
        }

        return {
            min: min,
            max: max,
            centroidMin: centroidMin,
            centroidMax: centroidMax
        };
    }

    function build(indices) {
        var bounds = computeBounds(indices);
        var nodeIndex = nodes.length;
        var node = {
            boundsMin: bounds.min,
            boundsMax: bounds.max,
            left: -1,
            right: -1,
            start: 0,
            count: 0
        };
        nodes.push(node);

        if (indices.length <= 8) {
            node.start = orderedTriangles.length;
            node.count = indices.length;
            for (var i = 0; i < indices.length; i++) {
                orderedTriangles.push(mesh.triangles[indices[i]]);
            }
            return nodeIndex;
        }

        var extents = [
            bounds.centroidMax.x - bounds.centroidMin.x,
            bounds.centroidMax.y - bounds.centroidMin.y,
            bounds.centroidMax.z - bounds.centroidMin.z
        ];
        var axis = 0;
        if (extents[1] > extents[axis]) axis = 1;
        if (extents[2] > extents[axis]) axis = 2;
        if (extents[axis] < 1e-8) {
            node.start = orderedTriangles.length;
            node.count = indices.length;
            for (var flatIdx = 0; flatIdx < indices.length; flatIdx++) {
                orderedTriangles.push(mesh.triangles[indices[flatIdx]]);
            }
            return nodeIndex;
        }

        indices.sort(function(a, b) {
            var ca = mesh.triangles[a].centroid;
            var cb = mesh.triangles[b].centroid;
            return axis === 0 ? ca.x - cb.x : axis === 1 ? ca.y - cb.y : ca.z - cb.z;
        });

        var mid = Math.floor(indices.length / 2);
        node.left = build(indices.slice(0, mid));
        node.right = build(indices.slice(mid));
        return nodeIndex;
    }

    build(triangleIndices);
    mesh.bvhNodes = nodes;
    mesh.bvhTriangles = orderedTriangles;
}

function intersectAabb(boundsMin, boundsMax, p, v, maxDistance) {
    var minT = -Infinity;
    var maxT = maxDistance;
    var origins = [p.x, p.y, p.z];
    var dirs = [v.x, v.y, v.z];
    var mins = [boundsMin.x, boundsMin.y, boundsMin.z];
    var maxs = [boundsMax.x, boundsMax.y, boundsMax.z];

    for (var axis = 0; axis < 3; axis++) {
        var dir = dirs[axis];
        var origin = origins[axis];
        if (Math.abs(dir) < 1e-8) {
            if (origin < mins[axis] || origin > maxs[axis]) {
                return false;
            }
            continue;
        }

        var invDir = 1.0 / dir;
        var t0 = (mins[axis] - origin) * invDir;
        var t1 = (maxs[axis] - origin) * invDir;
        if (t0 > t1) {
            var swap = t0;
            t0 = t1;
            t1 = swap;
        }
        minT = Math.max(minT, t0);
        maxT = Math.min(maxT, t1);
        if (maxT < minT) {
            return false;
        }
    }

    return maxT > 1e-6;
}

function intersectTriangleRange(mesh, triangles, start, count, p, v, bestT) {
    var bestNormal = null;
    for (var triOffset = 0; triOffset < count; triOffset++) {
        var tri = triangles[start + triOffset];
        var v0 = mesh.vertices[tri.i0];
        var v1 = mesh.vertices[tri.i1];
        var v2 = mesh.vertices[tri.i2];
        var edge1 = Vector3.fromPoint3(v0, v1);
        var edge2 = Vector3.fromPoint3(v0, v2);
        var pvec = v.cross(edge2);
        var det = edge1.dot(pvec);
        if (Math.abs(det) < 1e-8) continue;

        var invDet = 1.0 / det;
        var tvec = Vector3.fromPoint3(v0, p);
        var u = tvec.dot(pvec) * invDet;
        if (u < 0 || u > 1) continue;

        var qvec = tvec.cross(edge1);
        var vCoord = v.dot(qvec) * invDet;
        if (vCoord < 0 || u + vCoord > 1) continue;

        var t = edge2.dot(qvec) * invDet;
        if (t > 1e-6 && t < bestT) {
            var wCoord = 1.0 - u - vCoord;
            bestT = t;
            bestNormal = mesh.vertexNormals[tri.i0].mul(wCoord)
                .add(mesh.vertexNormals[tri.i1].mul(u))
                .add(mesh.vertexNormals[tri.i2].mul(vCoord))
                .normalized();
        }
    }

    return {
        bestT: bestT,
        bestNormal: bestNormal
    };
}

// ================================================================
//  2D shapes
// ================================================================
/*
 Edge
 */
export function Edge(p, n, dir)
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
export function Polygon( isConcave )
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
export function Circle(x, y, r) {
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
export function Star(x, y, r, corners) {
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
export function Blobby() {
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

export function FunctionShape( fun ) {
    var that = new Shape();

    that.distanceTo = function( x, y ) {
        return fun(x, y);
    };

    return that;
}
