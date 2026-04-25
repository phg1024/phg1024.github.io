import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { PI, clamp, reflect, russianRoulette } from './utils.js';
import { Color } from './image.js';

/*
 Ray tracer 
*/

export function Scene() {
    this.lights = [];
    this.addLight = function( l ) {
        this.lights.push(l);
    };
    this.areaLights = [];
    this.addAreaLight = function( l ) {
        this.areaLights.push(l);
    };
    this.objects = [];
    this.addObject = function(obj) {
        this.objects.push(obj);
    };
    this.bgColor = Color.LIGHTGRAY;
	
	this.isLightVisible = function( pos, lidx ) {
		var light = this.lights[lidx];
		
		var v = Vector3.fromPoint3(pos, light.pos.add(new Vector3(Math.random(), Math.random(), Math.random()).mul(light.radius)));
		var tRef = v.norm();
		var tMin = Number.MAX_VALUE;
		v = v.normalized();
        for(var i=0;i<this.objects.length;i++)
        {
            var t = this.objects[i].intersectT(pos, v);
			
            if( t !== undefined )
            {
                tMin = Math.min(tMin, t);
            }
        }
		
		return (tMin > tRef);
	};

    this.intersect = function( ray, eyepos ) {
        if( ray.depth === 0 )
        {
            return {hit: false, t: Number.MAX_VALUE, p: new Point3(), color: this.bgColor}
        }

        var hit = {t: Number.MAX_VALUE};
        for(var i=0;i<this.objects.length;i++)
        {
            var h = this.objects[i].intersect( ray, this, eyepos );
            if(h.hit && (h.t < hit.t))
            {
                hit = h;
            }
        }

        // blend the hit with recursive hits
        if( hit.hit )
        {
            //console.log(hit);
            var recursiveHit = this.intersect( hit.newRay, eyepos );
            if( recursiveHit.hit )
                hit.color = Color.interpolate(recursiveHit.color, hit.color, hit.ior);
            else
                hit.color = Color.interpolate(this.bgColor, hit.color, hit.ior);
        }
        else
        {
            hit.color = this.bgColor;
        }

        return hit;
    }
}

export function Camera(origin, dir, up, f, fovy, w, h) {
    this.origin = origin;
    this.direction = dir.normalized();
    this.up = up.normalized();
    this.f = f;     /* foco length */
    this.fovy = fovy;

    this.canvas = new Canvas(
        origin.add(this.direction.mul(f)),
        up.cross(this.direction),
        up,
        f * Math.atan(fovy / 180.0 * PI ),
        w,
        h
    );

    this.getRays = function(x, y, n, maxDepth) {
		var nx = Math.floor(Math.sqrt(n)), ny = nx;
		var h = 1.0 / nx;
		var rays = [];
		for(var yy=0;yy<ny;yy++)
		{
			for(var xx=0;xx<nx;xx++)
			{
				rays.push(this.canvas.getRay(x+h*xx, y+h*yy, this.origin, maxDepth));
			}
		}
        return rays; 
    }
}

export function Canvas(center, u, v, scale, w, h) {
    this.center = center;
    this.width =  w;//document.getElementById('width').value;
    this.height = h;//document.getElementById('height').value;
    this.u = u;
    this.v = v;
    this.scale = scale;
    this.aspectRatio = this.width/this.height;

    this.getPoint = function(x, y) {
        var dx = (x/this.width - 0.5) * this.scale;
        var dy = (y/this.height - 0.5) * this.scale;
        return this.center.add(this.u.mul(dx).mul(this.aspectRatio))
            .add(this.v.mul(dy));
    }
    this.getRay = function(x, y, origin, maxDepth)
    {
        var p = this.getPoint(x, y);
        return {
            v: Vector3.fromPoint3(origin, p).normalized(),
            p: origin,
            depth: maxDepth
        };
    }
}

export function shading( obj, epos, pos, normal, scene )
{
    var shadeSum = new Color();
    var intSum = 0;

	var lights = scene.lights;
    var areaLights = scene.areaLights || [];
    var Ka = materialValue(obj.material.Ka, 0.1);
    var Kd = materialValue(obj.material.Kd, 0.6);
    var Ks = materialValue(obj.material.Ks, 0.3);
    for( var i=0;i<lights.length;i++ )
    {
		// test if this light is visible from the point
        var nshadowrays = 32;
        var lightingCount = 0;
        for(var j=0;j<nshadowrays;j++) {
		    if( scene.isLightVisible(pos, i) ) lightingCount++;
        }

        var visibleRatio = lightingCount / nshadowrays;
        var V = Vector3.fromPoint3(pos, epos).normalized();
        var L = Vector3.fromPoint3(pos, lights[i].pos);
        var factor = 1.0 / L.normSquared();
        L = L.normalized();
        var N = normal.normalized();
        var LdotN = L.dot(N);
        var R = N.mul(LdotN).mul(2.0).sub(L);

        var diff = Math.max(0, LdotN);
        var spec = Math.pow(Math.max(0, R.dot(V)), lights[i].specFactor);

        var shade = lights[i].ambient.mul(Ka)
            .add(lights[i].diffuse.mul(diff).mul(Kd).mul(visibleRatio))
            .add(lights[i].specular.mul(spec).mul(Ks));

        shadeSum = shadeSum.add(shade.mul(lights[i].intensity));//.mul(factor));
        intSum += lights[i].intensity;
    }

    for (var li = 0; li < areaLights.length; li++) {
        var areaLight = areaLights[li];
        var areaSamples = 16;
        var areaShade = new Color();
        var Varea = Vector3.fromPoint3(pos, epos).normalized();
        var Narea = normal.normalized();

        for (var sample = 0; sample < areaSamples; sample++) {
            var lightPoint = sampleAreaLight(areaLight, Math.random);
            var toLight = Vector3.fromPoint3(pos, lightPoint);
            var distanceSquared = toLight.normSquared();
            var distance = Math.sqrt(distanceSquared);
            var Larea = toLight.mul(1.0 / distance);
            var surfaceCos = Math.max(0, Larea.dot(Narea));
            var lightCos = Math.max(0, areaLight.normal.mul(-1).dot(Larea));

            if (surfaceCos <= 0 || lightCos <= 0) continue;

            var shadowOrigin = offsetPathOrigin(pos, Narea, Larea);
            if (!isPathToLightClear(scene, shadowOrigin, Larea, distance)) continue;

            var Rarea = Narea.mul(surfaceCos).mul(2.0).sub(Larea);
            var diffArea = surfaceCos;
            var specArea = Math.pow(Math.max(0, Rarea.dot(Varea)), 40.0);
            var areaFactor = areaLight.intensity * areaLight.area * lightCos / Math.max(distanceSquared, 1e-6);

            areaShade = areaShade.add(
                areaLight.color.mul(areaFactor)
                    .mul(diffArea * Kd)
                    .add(areaLight.color.mul(areaFactor).mul(specArea * Ks))
            );
        }

        shadeSum = shadeSum.add(areaShade.mul(1.0 / areaSamples));
        intSum += areaLight.intensity;
    }

    if (intSum > 0) {
        shadeSum = shadeSum.mul(1.0 / intSum);
    }

    // add the shading to the object's color
    var color = obj.color.add(shadeSum);
    color.r = clamp(color.r, 0, 255);
    color.g = clamp(color.g, 0, 255);
    color.b = clamp(color.b, 0, 255);
    color.a = clamp(color.a, 0, 255);

    return color;
}

/*
 Path Tracing Mode
 Uses Monte Carlo integration of the rendering equation.
*/

// ── Schlick's approximation for Fresnel ──
export function fresnelSchiek(cosTheta, ior) {
    var r0 = (1.0 - ior) / (1.0 + ior);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * Math.pow(1.0 - cosTheta, 5.0);
}

export function attenuateColor(throughput, color) {
    return new Color(
        throughput.r * color.r / 255.0,
        throughput.g * color.g / 255.0,
        throughput.b * color.b / 255.0,
        1.0
    );
}

export function scaleThroughput(throughput, factor) {
    return new Color(
        throughput.r * factor,
        throughput.g * factor,
        throughput.b * factor,
        1.0
    );
}

export function applyThroughput(color, throughput) {
    return new Color(
        clamp(color.r * throughput.r, 0, 255),
        clamp(color.g * throughput.g, 0, 255),
        clamp(color.b * throughput.b, 0, 255),
        255
    );
}

export function addColor(a, b) {
    return new Color(a.r + b.r, a.g + b.g, a.b + b.b, 255);
}

export function materialValue(value, fallback) {
    return value === undefined ? fallback : value;
}

export function offsetPathOrigin(point, normal, direction) {
    var sign = direction.dot(normal) < 0 ? -1 : 1;
    return point.add(normal.mul(sign * 1e-4));
}

export function sampleDiffuseDirection(normal, rng) {
    var tangent = new Vector3(1, 0, 0);
    if (Math.abs(normal.dot(tangent)) > 0.9) tangent = new Vector3(0, 1, 0);
    tangent = normal.cross(tangent).normalize();
    var bitangent = normal.cross(tangent).normalize();

    var r1 = 2 * Math.PI * rng();
    var r2 = rng();
    var r2s = Math.sqrt(r2);
    var local = new Vector3(
        Math.cos(r1) * r2s,
        Math.sin(r1) * r2s,
        Math.sqrt(Math.max(0, 1 - r2))
    );

    return new Vector3(
        local.x * tangent.x + local.y * bitangent.x + local.z * normal.x,
        local.x * tangent.y + local.y * bitangent.y + local.z * normal.y,
        local.x * tangent.z + local.y * bitangent.z + local.z * normal.z
    ).normalized();
}

export function makeAreaLight(center, u, v, color, intensity) {
    return {
        center: center,
        u: u,
        v: v,
        color: color,
        intensity: intensity,
        area: u.cross(v).norm(),
        normal: u.cross(v).normalized()
    };
}

export function sampleAreaLight(light, rng) {
    var su = rng() - 0.5;
    var sv = rng() - 0.5;
    return light.center.add(light.u.mul(su)).add(light.v.mul(sv));
}

export function isPathToLightClear(scene, origin, direction, maxDistance) {
    for (var i = 0; i < scene.objects.length; i++) {
        var obj = scene.objects[i];
        if (!obj.intersectT) continue;
        var t = obj.intersectT(origin, direction);
        if (t !== undefined && t < maxDistance - 1e-4) {
            return false;
        }
    }
    return true;
}

export function estimateAreaLighting(scene, hit, normal, mat, throughput, rng) {
    var result = new Color(0, 0, 0, 255);
    var Kd = Math.max(0, materialValue(mat.Kd, 0.6));
    if (Kd === 0) return result;

    for (var i = 0; i < scene.areaLights.length; i++) {
        var light = scene.areaLights[i];
        var lightPoint = sampleAreaLight(light, rng);
        var toLight = Vector3.fromPoint3(hit.p, lightPoint);
        var distanceSquared = toLight.normSquared();
        var distance = Math.sqrt(distanceSquared);
        var lightDir = toLight.mul(1.0 / distance);
        var surfaceCos = Math.max(0, normal.dot(lightDir));
        var lightCos = Math.max(0, light.normal.mul(-1).dot(lightDir));

        if (surfaceCos <= 0 || lightCos <= 0) continue;

        var shadowOrigin = offsetPathOrigin(hit.p, normal, lightDir);
        if (!isPathToLightClear(scene, shadowOrigin, lightDir, distance)) continue;

        var factor = Kd * light.intensity * light.area * surfaceCos * lightCos / Math.max(distanceSquared, 1e-6);
        result = addColor(result, new Color(
            light.color.r * throughput.r * hit.object.color.r / 255.0 * factor,
            light.color.g * throughput.g * hit.object.color.g / 255.0 * factor,
            light.color.b * throughput.b * hit.object.color.b / 255.0 * factor,
            255
        ));
    }

    return result;
}

// ── Single-bounce intersection (no recursion) for path tracing ──
Scene.prototype.intersectSingle = function( ray, eyepos ) {
    var hit = {hit: false, t: Number.MAX_VALUE, object: null};
    for(var i=0; i<this.objects.length; i++) {
        var obj = this.objects[i];
        if (obj.intersectT) {
            var t = obj.intersectT(ray.p, ray.v);
            if (t !== undefined && t < hit.t) {
                var hitPos = ray.p.add(ray.v.mul(t));
                hit = {
                    hit: true,
                    t: t,
                    p: hitPos,
                    normal: obj.center ? Vector3.fromPoint3(obj.center, hitPos).normalized() : new Vector3(0, 1, 0),
                    object: obj
                };
            }
        } else {
            var h = obj.intersect(ray, this, eyepos);
            if(h.hit && h.t < hit.t) {
                hit = h;
                hit.object = obj;
                if (!hit.normal && hit.object.center) {
                    hit.normal = Vector3.fromPoint3(hit.object.center, hit.p).normalized();
                }
            }
        }
     }
    if(hit.t === Number.MAX_VALUE) {
        hit.t = 0;
     }
    return hit;
};

// ── Main path trace loop ──
Scene.prototype.pathTrace = function(origin, direction, maxDepth, rng) {
    var rayOrigin = new Point3(origin.x, origin.y, origin.z);
    var rayDir = direction.normalized();
    var throughput = new Color(1.0, 1.0, 1.0, 1.0);
    var surfaceColor = new Color(255, 255, 255, 255);
    var radiance = new Color(0, 0, 0, 255);

    for (var depth = 0; depth < maxDepth; depth++) {
        // 1. Find closest intersection (single bounce, no recursion)
        var hit = this.intersectSingle(
            { v: rayDir, p: rayOrigin, depth: 0 },
            origin
        );

        // 2. No hit: return background scaled by throughput
        if (!hit.hit || hit.t === 0) {
            return addColor(radiance, applyThroughput(this.bgColor, throughput));
        }

        // 3. Get object and material
        var obj = hit.object;
        var mat = obj.material || {};
        var N = hit.normal;
        surfaceColor = obj.color;   // accumulate base color

        // 5. Weighted BRDF sampling
        var Kd = Math.max(0, materialValue(mat.Kd, 0.6));
        var Ks = Math.max(0, materialValue(mat.Ks, 0.3));
        var ior = Math.max(1.0001, materialValue(mat.ior, 1.5));

        if (!mat.refractive) {
            radiance = addColor(radiance, estimateAreaLighting(this, hit, N, mat, throughput, rng));
        }

        // 6. Sample next ray direction
        if (mat.refractive) {
            // ── Refraction with Fresnel and TIR ──
            var entering = N.dot(rayDir) < 0;
            var newIor = entering ? 1.0 / ior : ior;
            var n = entering ? N : N.mul(-1);
            var cosTheta = Math.min(1, Math.max(0, -rayDir.dot(n)));
            var fresnel = fresnelSchiek(cosTheta, newIor);

            if (rng() < fresnel) {
                // ── Reflect ──
                var R = reflect(n, rayDir);
                rayOrigin = offsetPathOrigin(hit.p, N, R);
                rayDir = R;
            } else {
                // ── Refract ──
                var k = 1.0 - newIor * newIor * (1.0 - cosTheta * cosTheta);
                if (k < 0) {
                    // Total internal reflection → reflect
                    var R = reflect(n, rayDir);
                    rayOrigin = offsetPathOrigin(hit.p, N, R);
                    rayDir = R;
                } else {
                    var refractDir = rayDir.mul(newIor)
                        .sub(n.mul(newIor * cosTheta + Math.sqrt(k))).normalized();
                    rayOrigin = offsetPathOrigin(hit.p, N, refractDir);
                    rayDir = refractDir;
                    throughput = attenuateColor(throughput, surfaceColor);
                }
            }
        } else {
            var total = Kd + Ks;
            if (total <= 0) {
                return addColor(radiance, applyThroughput(this.bgColor, throughput));
            }

            var diffuseProbability = Kd / total;
            if (rng() < diffuseProbability) {
                var newDir = sampleDiffuseDirection(N, rng);
                rayOrigin = offsetPathOrigin(hit.p, N, newDir);
                rayDir = newDir;
                throughput = attenuateColor(throughput, surfaceColor);
                throughput = scaleThroughput(throughput, Kd / diffuseProbability);
            } else {
                var specularProbability = 1.0 - diffuseProbability;
                var reflected = reflect(N, rayDir);
                rayOrigin = offsetPathOrigin(hit.p, N, reflected);
                rayDir = reflected;
                throughput = scaleThroughput(throughput, Ks / specularProbability);
            }
        }
    }

    // 7. Russian Roulette termination
    var rrResult = russianRoulette(surfaceColor, rng);
    if (!rrResult.survive) {
        return addColor(radiance, this.bgColor);
    }
    throughput = attenuateColor(throughput, rrResult.color);

    // 8. Final accumulated color
    return addColor(radiance, applyThroughput(surfaceColor, throughput));
};

/*
 Convenience: shoot a single path through pixel (x, y)
*/
Scene.prototype.pathTracePixel = function(cam, x, y, maxDepth, rng) {
    var rays = cam.getRays(x, y, 1, maxDepth);
    var origin = cam.origin;
    var direction = rays[0].v;
    return this.pathTrace(origin, direction, maxDepth, rng);
};
