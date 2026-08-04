import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { PI, clamp, reflect } from './utils.js';
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
        if( hit.hit && hit.ior > 0 && hit.newRay )
        {
            var recursiveHit = this.intersect( hit.newRay, eyepos );
            if( recursiveHit.hit )
                hit.color = Color.interpolate(recursiveHit.color, hit.color, hit.ior);
            else
                hit.color = Color.interpolate(this.bgColor, hit.color, hit.ior);
        }
        else if (!hit.hit)
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
			var sampleCount = Math.max(0, Math.floor(n));
			if (sampleCount === 0) return [];
			var nx = Math.ceil(Math.sqrt(sampleCount));
			var ny = Math.ceil(sampleCount / nx);
			var rays = [];
			for (var sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
				var xx = sampleIdx % nx;
				var yy = Math.floor(sampleIdx / nx);
				var offsetX = nx === 1 ? 0 : (xx + 0.5) / nx - 0.5;
				var offsetY = ny === 1 ? 0 : (yy + 0.5) / ny - 0.5;
				rays.push(this.canvas.getRay(x + offsetX, y + offsetY, this.origin, maxDepth));
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

export function dielectricFresnel(cosTheta, eta) {
    var cosI = Math.min(1, Math.max(0, cosTheta));
    var sinThetaTSquared = eta * eta * Math.max(0, 1.0 - cosI * cosI);
    if (sinThetaTSquared >= 1.0) return 1.0;
    var cosT = Math.sqrt(Math.max(0, 1.0 - sinThetaTSquared));
    var parallelNumerator = eta * cosI - cosT;
    var parallelDenominator = eta * cosI + cosT;
    var perpendicularNumerator = cosI - eta * cosT;
    var perpendicularDenominator = cosI + eta * cosT;
    var parallel = parallelNumerator / Math.max(Math.abs(parallelDenominator), 1e-8);
    var perpendicular = perpendicularNumerator / Math.max(Math.abs(perpendicularDenominator), 1e-8);
    return 0.5 * (parallel * parallel + perpendicular * perpendicular);
}

export function attenuateColor(throughput, color) {
    return new Color(
        throughput.r * color.r / 255.0,
        throughput.g * color.g / 255.0,
        throughput.b * color.b / 255.0,
        1.0
    );
}

export function transmissionTint(color) {
    return new Color(
        255.0 * Math.sqrt(Math.max(color.r / 255.0, 0.0001)),
        255.0 * Math.sqrt(Math.max(color.g / 255.0, 0.0001)),
        255.0 * Math.sqrt(Math.max(color.b / 255.0, 0.0001)),
        255
    );
}

export function getTransmissionColor(mat, surfaceColor) {
    if (mat && mat.transmissionColor) {
        return mat.transmissionColor;
    }
    if (mat && mat.refractive) {
        return Color.WHITE;
    }
    return surfaceColor;
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

export function materialLobes(mat) {
    mat = mat || {};
    var Kd = Math.max(0, materialValue(mat.Kd, 0.6));
    var Ks = Math.max(0, materialValue(mat.Ks, 0.3));
    var subsurface = Math.max(0, Math.min(1, materialValue(mat.subsurface, 0)));
    var diffuse = Kd * (1.0 - subsurface);
    var total = diffuse + Ks + subsurface;
    var scale = total > 1.0 ? 1.0 / total : 1.0;
    return {
        diffuse: diffuse * scale,
        specular: Ks * scale,
        subsurface: subsurface * scale,
        total: total * scale
    };
}

export function offsetPathOrigin(point, normal, direction) {
    var sign = direction.dot(normal) < 0 ? -1 : 1;
    return point.add(normal.mul(sign * 1e-4));
}

export function refractPathDirection(normal, direction, ior, frontFace) {
    var entering = frontFace !== undefined ? frontFace : normal.dot(direction) < 0;
    var eta = entering ? 1.0 / ior : ior;
    var n = frontFace !== undefined ? normal : (entering ? normal : normal.mul(-1));
    var cosTheta = Math.min(1, Math.max(0, -direction.dot(n)));
    var k = 1.0 - eta * eta * (1.0 - cosTheta * cosTheta);
    if (k < 0) {
        return null;
    }
    return direction.mul(eta)
        .sub(n.mul(eta * cosTheta + Math.sqrt(k)))
        .normalized();
}

function deltaDirectionWeight(actual, expected) {
    if (!expected) {
        return 0;
    }
    return actual.dot(expected) > 0.9995 ? 1.0 : 0.0;
}

export function subsurfaceTransmittance(color, travelDistance, depthScale) {
    var distanceFactor = Math.max(0, travelDistance) / Math.max(depthScale, 0.0002);
    return new Color(
        255.0 * Math.pow(Math.max(color.r / 255.0, 0.001), distanceFactor),
        255.0 * Math.pow(Math.max(color.g / 255.0, 0.001), distanceFactor),
        255.0 * Math.pow(Math.max(color.b / 255.0, 0.001), distanceFactor),
        255
    );
}

export function sampleDiffuseDirection(normal, rng) {
    var basis = stableOrthonormalBasis(normal);
    var tangent = basis.tangent;
    var bitangent = basis.bitangent;

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
        var shadowMaxT = maxDistance - 1e-4;
        if (obj.shadowIntersect && obj.shadowIntersect(origin, direction, shadowMaxT)) {
            return false;
        }
        if (!obj.shadowIntersect && obj.intersectT) {
            var t = obj.intersectT(origin, direction);
            if (t !== undefined && t < shadowMaxT) return false;
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

        var factor = Kd / Math.PI * light.intensity * light.area * surfaceCos * lightCos / Math.max(distanceSquared, 1e-6);
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
        if (obj.intersectDetail) {
            var detail = obj.intersectDetail(ray.p, ray.v);
            if (detail && detail.t < hit.t) {
                var hitPos = ray.p.add(ray.v.mul(detail.t));
                var geometricNormal = detail.normal.normalized();
                var frontFace = geometricNormal.dot(ray.v) < 0;
                var normal = frontFace ? geometricNormal : geometricNormal.mul(-1);
                hit = {
                    hit: true,
                    t: detail.t,
                    p: hitPos,
                    normal: normal,
                    geometricNormal: geometricNormal,
                    frontFace: frontFace,
                    object: obj
                };
            }
        } else if (obj.intersectT) {
            var t = obj.intersectT(ray.p, ray.v);
            if (t !== undefined && t < hit.t) {
                var hitPos = ray.p.add(ray.v.mul(t));
                var geometricNormal = obj.center ? Vector3.fromPoint3(obj.center, hitPos).normalized() : new Vector3(0, 1, 0);
                var frontFace = geometricNormal.dot(ray.v) < 0;
                hit = {
                    hit: true,
                    t: t,
                    p: hitPos,
                    normal: frontFace ? geometricNormal : geometricNormal.mul(-1),
                    geometricNormal: geometricNormal,
                    frontFace: frontFace,
                    object: obj
                };
            }
        } else {
            var h = obj.intersect(ray, this, eyepos);
            if(h.hit && h.t < hit.t) {
                hit = h;
                hit.object = obj;
                if (!hit.normal && hit.object.center) {
                    hit.geometricNormal = Vector3.fromPoint3(hit.object.center, hit.p).normalized();
                    hit.frontFace = hit.geometricNormal.dot(ray.v) < 0;
                    hit.normal = hit.frontFace ? hit.geometricNormal : hit.geometricNormal.mul(-1);
                }
            }
        }
     }
    if(hit.t === Number.MAX_VALUE) {
        hit.t = 0;
     }
    return hit;
};

Scene.prototype.sampleSubsurfaceExit = function(hit, rng, depthScale) {
    var inwardNormal = hit.normal.mul(-1);
    var inwardDir = sampleDiffuseDirection(inwardNormal, rng);
    var depth = Math.max(0.0002, depthScale !== undefined ? depthScale : 0.35);
    var insideOrigin = hit.p.add(inwardNormal.mul(depth));
    var exitHit = this.intersectSingle(
        { v: inwardDir, p: insideOrigin, depth: 0 },
        hit.p
    );

    if (!exitHit.hit || exitHit.object !== hit.object) {
        return null;
    }

    exitHit.normal = exitHit.geometricNormal || exitHit.normal.mul(-1);

    return exitHit;
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
        var lobes = materialLobes(mat);
        var Ks = lobes.specular;
        var ior = Math.max(1.0001, materialValue(mat.ior, 1.5));
        var subsurface = lobes.subsurface;
        var subsurfaceDepth = Math.max(0.0002, materialValue(mat.subsurfaceDepth, 0.35));
        var subsurfaceColor = mat.subsurfaceColor || surfaceColor;

        var surfaceMat = {
            Kd: lobes.diffuse,
            Ks: Ks,
            ior: ior,
            refractive: mat.refractive,
            Ka: mat.Ka
        };
        if (!mat.refractive) {
            radiance = addColor(radiance, estimateAreaLighting(this, hit, N, surfaceMat, throughput, rng));
        }

        // 6. Sample next ray direction
        if (mat.refractive) {
            // ── Refraction with Fresnel and TIR ──
            var entering = hit.frontFace;
            var newIor = entering ? 1.0 / ior : ior;
            var n = N;
            var cosTheta = Math.min(1, Math.max(0, -rayDir.dot(n)));
            var fresnel = dielectricFresnel(cosTheta, newIor);

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
                    if (entering) {
                        throughput = attenuateColor(throughput, transmissionTint(getTransmissionColor(mat, surfaceColor)));
                    }
                }
            }
        } else {
            var total = surfaceMat.Kd + Ks + subsurface;
            if (total <= 0) {
                return addColor(radiance, applyThroughput(this.bgColor, throughput));
            }

            var diffuseProbability = surfaceMat.Kd / total;
            var specularProbability = Ks / total;
            var choice = rng();

            if (choice < diffuseProbability) {
                var newDir = sampleDiffuseDirection(N, rng);
                rayOrigin = offsetPathOrigin(hit.p, N, newDir);
                rayDir = newDir;
                throughput = attenuateColor(throughput, surfaceColor);
                throughput = scaleThroughput(throughput, surfaceMat.Kd / Math.max(diffuseProbability, 1e-4));
            } else if (choice < diffuseProbability + specularProbability) {
                var reflected = reflect(N, rayDir);
                rayOrigin = offsetPathOrigin(hit.p, N, reflected);
                rayDir = reflected;
                throughput = scaleThroughput(throughput, Ks / Math.max(specularProbability, 1e-4));
            } else {
                var exitHit = this.sampleSubsurfaceExit(hit, rng, subsurfaceDepth);
                if (!exitHit) {
                    var localScatterDir = sampleDiffuseDirection(N, rng);
                    rayOrigin = offsetPathOrigin(hit.p, N, localScatterDir);
                    rayDir = localScatterDir;
                    throughput = attenuateColor(throughput, surfaceColor);
                    throughput = scaleThroughput(throughput, subsurface / Math.max(subsurface / total, 1e-4));
                    continue;
                }
                var transmissionColor = subsurfaceTransmittance(subsurfaceColor, exitHit.t, subsurfaceDepth);
                radiance = addColor(radiance, estimateAreaLighting(this, {
                    p: exitHit.p,
                    object: { color: transmissionColor }
                }, exitHit.normal, { Kd: 1.0, Ks: 0.0 }, throughput, rng));
                return radiance;
            }
        }
    }

    return radiance;
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

Scene.prototype.bidirectionalPathTrace = function(origin, direction, maxDepth, rng) {
    var cameraPath = buildCameraSubpath(this, origin, direction, maxDepth, rng);
    var lightPath = buildLightSubpath(this, maxDepth, rng);
    var radiance = cameraPath.radiance || new Color(0, 0, 0, 255);

    for (var cameraIdx = 0; cameraIdx < cameraPath.vertices.length; cameraIdx++) {
        var cameraVertex = cameraPath.vertices[cameraIdx];
        if (!cameraVertex.connectable) continue;

        radiance = addColor(
            radiance,
            estimateAreaLighting(
                this,
                { p: cameraVertex.p, object: { color: cameraVertex.color } },
                cameraVertex.normal,
                { Kd: cameraVertex.kd, Ks: 0.0 },
                cameraVertex.throughput,
                rng
            )
        );

        for (var lightIdx = 0; lightIdx < lightPath.vertices.length; lightIdx++) {
            var lightVertex = lightPath.vertices[lightIdx];
            if (lightVertex.deltaType !== 'refractive') continue;
            var connection = connectPathVertices(this, cameraVertex, lightVertex);
            if (connection) {
                radiance = addColor(radiance, connection);
            }
        }
    }

    return radiance;
};

function buildCameraSubpath(scene, origin, direction, maxDepth, rng) {
    var vertices = [];
    var radiance = new Color(0, 0, 0, 255);
    var rayOrigin = new Point3(origin.x, origin.y, origin.z);
    var rayDir = direction.normalized();
    var throughput = new Color(1.0, 1.0, 1.0, 1.0);

    for (var depth = 0; depth < maxDepth; depth++) {
        var hit = scene.intersectSingle({ v: rayDir, p: rayOrigin, depth: 0 }, origin);
        if (!hit.hit || hit.t === 0) {
            radiance = addColor(radiance, applyThroughput(scene.bgColor, throughput));
            break;
        }

        var obj = hit.object;
        var mat = obj.material || {};
        var bounce = samplePathBounce(scene, hit, mat, obj.color, throughput, rayDir, rng);
        vertices.push(bounce.vertex);
        throughput = bounce.throughput;
        rayOrigin = bounce.origin;
        rayDir = bounce.direction;

        if (!rayOrigin || !rayDir) {
            break;
        }
    }

    return { vertices: vertices, radiance: radiance };
}

function buildLightSubpath(scene, maxDepth, rng) {
    if (!scene.areaLights.length) {
        return { vertices: [] };
    }

    var light = scene.areaLights[Math.floor(rng() * scene.areaLights.length)];
    var lightPoint = sampleAreaLight(light, rng);
    var emitNormal = light.normal.mul(-1);
    var rayDir = sampleDiffuseDirection(emitNormal, rng);
    var rayOrigin = offsetPathOrigin(lightPoint, emitNormal, rayDir);
    var throughput = new Color(
        light.color.r / 255.0 * light.intensity * light.area,
        light.color.g / 255.0 * light.intensity * light.area,
        light.color.b / 255.0 * light.intensity * light.area,
        1.0
    );
    var vertices = [];

    for (var depth = 0; depth < maxDepth; depth++) {
        var hit = scene.intersectSingle({ v: rayDir, p: rayOrigin, depth: 0 }, lightPoint);
        if (!hit.hit || hit.t === 0) {
            break;
        }

        var obj = hit.object;
        var mat = obj.material || {};
        var bounce = samplePathBounce(scene, hit, mat, obj.color, throughput, rayDir, rng);
        vertices.push(bounce.vertex);
        throughput = bounce.throughput;
        rayOrigin = bounce.origin;
        rayDir = bounce.direction;

        if (!rayOrigin || !rayDir) {
            break;
        }
    }

    return { vertices: vertices };
}

function samplePathBounce(scene, hit, mat, surfaceColor, throughput, rayDir, rng) {
    var N = hit.normal;
    var lobes = materialLobes(mat);
    var Ks = lobes.specular;
    var ior = Math.max(1.0001, materialValue(mat.ior, 1.5));
    var subsurface = lobes.subsurface;
    var subsurfaceDepth = Math.max(0.0002, materialValue(mat.subsurfaceDepth, 0.35));
    var subsurfaceColor = mat.subsurfaceColor || surfaceColor;
    var surfaceKd = lobes.diffuse;
    var connectColor = subsurface > 0.5 ? subsurfaceColor : surfaceColor;
    var vertex = {
        p: hit.p,
        normal: N,
        throughput: new Color(throughput.r, throughput.g, throughput.b, 1.0),
        color: connectColor,
        kd: mat.refractive ? 0.0 : Math.max(surfaceKd, subsurface),
        object: hit.object,
        connectable: !mat.refractive,
        deltaType: mat.refractive ? 'refractive' : (Ks > 0 ? 'glossy' : 'diffuse'),
        isSubsurface: false,
        incidentDir: rayDir,
        ior: ior
    };

    if (mat.refractive) {
            var entering = hit.frontFace;
            var newIor = entering ? 1.0 / ior : ior;
            var n = N;
        var cosTheta = Math.min(1, Math.max(0, -rayDir.dot(n)));
        var fresnel = dielectricFresnel(cosTheta, newIor);

        if (rng() < fresnel) {
            var reflectedRay = reflect(n, rayDir);
            return {
                vertex: vertex,
                throughput: throughput,
                origin: offsetPathOrigin(hit.p, N, reflectedRay),
                direction: reflectedRay
            };
        }

        var k = 1.0 - newIor * newIor * (1.0 - cosTheta * cosTheta);
        if (k < 0) {
            var tirRay = reflect(n, rayDir);
            return {
                vertex: vertex,
                throughput: throughput,
                origin: offsetPathOrigin(hit.p, N, tirRay),
                direction: tirRay
            };
        }

        var refractedRay = refractPathDirection(N, rayDir, ior, hit.frontFace);
        var transmissionColor = entering ? transmissionTint(getTransmissionColor(mat, surfaceColor)) : new Color(255, 255, 255, 255);
        return {
            vertex: vertex,
            throughput: attenuateColor(throughput, transmissionColor),
            origin: offsetPathOrigin(hit.p, N, refractedRay),
            direction: refractedRay
        };
    }

    var total = surfaceKd + Ks + subsurface;
    if (total <= 0) {
        return { vertex: vertex, throughput: throughput, origin: null, direction: null };
    }

    var diffuseProbability = surfaceKd / total;
    var specularProbability = Ks / total;
    var choice = rng();

    if (choice < diffuseProbability) {
        var diffuseDir = sampleDiffuseDirection(N, rng);
        return {
            vertex: vertex,
            throughput: scaleThroughput(attenuateColor(throughput, surfaceColor), surfaceKd / Math.max(diffuseProbability, 1e-4)),
            origin: offsetPathOrigin(hit.p, N, diffuseDir),
            direction: diffuseDir
        };
    }

    if (choice < diffuseProbability + specularProbability) {
        var specularDir = reflect(N, rayDir);
        return {
            vertex: vertex,
            throughput: scaleThroughput(throughput, Ks / Math.max(specularProbability, 1e-4)),
            origin: offsetPathOrigin(hit.p, N, specularDir),
            direction: specularDir
        };
    }

    var exitHit = scene.sampleSubsurfaceExit(hit, rng, subsurfaceDepth);
    if (!exitHit) {
        var localScatterDir = sampleDiffuseDirection(N, rng);
        return {
            vertex: vertex,
            throughput: scaleThroughput(attenuateColor(throughput, surfaceColor), subsurface / Math.max(subsurface / total, 1e-4)),
            origin: offsetPathOrigin(hit.p, N, localScatterDir),
            direction: localScatterDir
        };
    }

    var transmissionColor = subsurfaceTransmittance(subsurfaceColor, exitHit.t, subsurfaceDepth);
    vertex.p = exitHit.p;
    vertex.normal = exitHit.normal;
    vertex.color = transmissionColor;
    vertex.kd = 1.0;
    vertex.isSubsurface = true;
    return {
        vertex: vertex,
        throughput: throughput,
        origin: null,
        direction: null
    };
}

function connectPathVertices(scene, cameraVertex, lightVertex) {
    if (!cameraVertex.connectable) {
        return null;
    }

    if (lightVertex.deltaType === 'refractive') {
        if (cameraVertex.isSubsurface) {
            return null;
        }
        return connectViaRefractiveVertex(scene, cameraVertex, lightVertex);
    }

    if (!lightVertex.connectable) {
        return null;
    }

    var toLight = Vector3.fromPoint3(cameraVertex.p, lightVertex.p);
    var distanceSquared = toLight.normSquared();
    if (distanceSquared <= 1e-8) {
        return null;
    }

    var distance = Math.sqrt(distanceSquared);
    var direction = toLight.mul(1.0 / distance);
    var cameraCos = Math.max(0, cameraVertex.normal.dot(direction));
    var lightCos = Math.max(0, lightVertex.normal.dot(direction.mul(-1)));
    if (cameraCos <= 0 || lightCos <= 0) {
        return null;
    }

    var shadowOrigin = offsetPathOrigin(cameraVertex.p, cameraVertex.normal, direction);
    if (!isPathToLightClear(scene, shadowOrigin, direction, distance)) {
        return null;
    }

    var factor = cameraVertex.kd * lightVertex.kd * cameraCos * lightCos / Math.max(distanceSquared, 1e-6);
    return new Color(
        255.0 * cameraVertex.throughput.r * lightVertex.throughput.r * (cameraVertex.color.r / 255.0) * (lightVertex.color.r / 255.0) * factor,
        255.0 * cameraVertex.throughput.g * lightVertex.throughput.g * (cameraVertex.color.g / 255.0) * (lightVertex.color.g / 255.0) * factor,
        255.0 * cameraVertex.throughput.b * lightVertex.throughput.b * (cameraVertex.color.b / 255.0) * (lightVertex.color.b / 255.0) * factor,
        255
    );
}

function connectViaRefractiveVertex(scene, cameraVertex, lightVertex) {
    var toCamera = Vector3.fromPoint3(lightVertex.p, cameraVertex.p);
    var distanceSquared = toCamera.normSquared();
    if (distanceSquared <= 1e-8) {
        return null;
    }

    var distance = Math.sqrt(distanceSquared);
    var direction = toCamera.mul(1.0 / distance);
    var cameraCos = Math.max(0, cameraVertex.normal.dot(direction.mul(-1)));
    if (cameraCos <= 0) {
        return null;
    }

    var incomingDir = lightVertex.incidentDir;
    var normal = lightVertex.normal;
    var reflected = reflect(normal, incomingDir);
    var refracted = refractPathDirection(normal, incomingDir, Math.max(1.0001, lightVertex.ior || 1.5));
    var entering = normal.dot(incomingDir) < 0;
    var fresnel = dielectricFresnel(
        Math.min(1, Math.max(0, -(entering ? incomingDir.dot(normal) : incomingDir.dot(normal.mul(-1))))),
        entering ? 1.0 / Math.max(1.0001, lightVertex.ior || 1.5) : Math.max(1.0001, lightVertex.ior || 1.5)
    );
    var branchWeight = Math.max(
        deltaDirectionWeight(direction, reflected) * fresnel,
        deltaDirectionWeight(direction, refracted) * (1.0 - fresnel)
    );
    if (branchWeight <= 0) {
        return null;
    }

    var shadowOrigin = offsetPathOrigin(lightVertex.p, lightVertex.normal, direction);
    if (!isPathToLightClear(scene, shadowOrigin, direction, distance)) {
        return null;
    }

    var factor = cameraVertex.kd * cameraCos * branchWeight / Math.max(distanceSquared, 1e-6);
    return new Color(
        255.0 * cameraVertex.throughput.r * lightVertex.throughput.r * (cameraVertex.color.r / 255.0) * (lightVertex.color.r / 255.0) * factor,
        255.0 * cameraVertex.throughput.g * lightVertex.throughput.g * (cameraVertex.color.g / 255.0) * (lightVertex.color.g / 255.0) * factor,
        255.0 * cameraVertex.throughput.b * lightVertex.throughput.b * (cameraVertex.color.b / 255.0) * (lightVertex.color.b / 255.0) * factor,
        255
    );
}

function maxColorComponent(color) {
    return Math.max(color.r, color.g, color.b);
}

function cloneColor(color) {
    return new Color(color.r, color.g, color.b, color.a);
}

function photonCellKey(ix, iy, iz) {
    return ix + '|' + iy + '|' + iz;
}

function buildBasis(normal) {
    return stableOrthonormalBasis(normal);
}

function stableOrthonormalBasis(normal) {
    if (normal.z < -0.9999999) {
        return {
            tangent: new Vector3(0, -1, 0),
            bitangent: new Vector3(-1, 0, 0)
        };
    }
    var a = 1.0 / (1.0 + normal.z);
    var b = -normal.x * normal.y * a;
    return {
        tangent: new Vector3(1.0 - normal.x * normal.x * a, b, -normal.x),
        bitangent: new Vector3(b, 1.0 - normal.y * normal.y * a, -normal.y)
    };
}

function photonCellCoords(point, cellSize) {
    return {
        x: Math.floor(point.x / cellSize),
        y: Math.floor(point.y / cellSize),
        z: Math.floor(point.z / cellSize)
    };
}

function buildPhotonLookup(photons, radius) {
    var cellSize = Math.max(radius, 0.0001);
    var cells = Object.create(null);

    for (var i = 0; i < photons.length; i++) {
        var photon = photons[i];
        var cell = photonCellCoords(photon.p, cellSize);
        var key = photonCellKey(cell.x, cell.y, cell.z);
        if (!cells[key]) {
            cells[key] = [];
        }
        cells[key].push(photon);
    }

    return {
        photons: photons,
        cells: cells,
        radius: radius,
        radiusSquared: radius * radius,
        cellSize: cellSize
    };
}

function sampleWeightedAreaLight(scene, rng) {
    if (!scene.areaLights.length) {
        return null;
    }

    var totalWeight = 0;
    for (var i = 0; i < scene.areaLights.length; i++) {
        totalWeight += scene.areaLights[i].intensity * scene.areaLights[i].area;
    }

    if (totalWeight <= 0) {
        return {
            light: scene.areaLights[0],
            totalWeight: 1.0
        };
    }

    var target = rng() * totalWeight;
    var accum = 0;
    for (var lightIdx = 0; lightIdx < scene.areaLights.length; lightIdx++) {
        var light = scene.areaLights[lightIdx];
        accum += light.intensity * light.area;
        if (target <= accum) {
            return {
                light: light,
                totalWeight: totalWeight
            };
        }
    }

    return {
        light: scene.areaLights[scene.areaLights.length - 1],
        totalWeight: totalWeight
    };
}

function listRefractiveTargets(scene) {
    var targets = [];
    for (var i = 0; i < scene.objects.length; i++) {
        var obj = scene.objects[i];
        if (obj && obj.material && obj.material.refractive) {
            targets.push(obj);
        }
    }
    return targets;
}

function sampleTargetPoint(target, lightPoint, rng) {
    if (target.radius !== undefined && target.center) {
        var axis = Vector3.fromPoint3(lightPoint, target.center).normalized();
        var basis = buildBasis(axis);
        var radius = Math.sqrt(rng()) * target.radius * 0.9;
        var theta = rng() * 2.0 * Math.PI;
        return target.center
            .add(basis.tangent.mul(Math.cos(theta) * radius))
            .add(basis.bitangent.mul(Math.sin(theta) * radius));
    }

    if (target.boundsMin && target.boundsMax) {
        return new Point3(
            target.boundsMin.x + (target.boundsMax.x - target.boundsMin.x) * rng(),
            target.boundsMin.y + (target.boundsMax.y - target.boundsMin.y) * rng(),
            target.boundsMin.z + (target.boundsMax.z - target.boundsMin.z) * rng()
        );
    }

    return target.center || lightPoint;
}

function normalizedPhotonPower(color, scale) {
    return new Color(
        (color.r / 255.0) * scale,
        (color.g / 255.0) * scale,
        (color.b / 255.0) * scale,
        1.0
    );
}

function storePhoton(list, hit, incomingDir, power) {
    list.push({
        p: new Point3(hit.p.x, hit.p.y, hit.p.z),
        normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
        direction: incomingDir.normalized(),
        power: cloneColor(power)
    });
}

function tracePhoton(scene, origin, direction, power, maxDepth, rng, globalPhotons, causticPhotons) {
    var rayOrigin = new Point3(origin.x, origin.y, origin.z);
    var rayDir = direction.normalized();
    var throughput = cloneColor(power);
    var specularPath = false;

    for (var depth = 0; depth < maxDepth; depth++) {
        if (maxColorComponent(throughput) < 1e-5) {
            return;
        }

        var hit = scene.intersectSingle({ v: rayDir, p: rayOrigin, depth: 0 }, origin);
        if (!hit.hit || hit.t === 0) {
            return;
        }

        var obj = hit.object;
        var mat = obj.material || {};
        var normal = hit.normal;
        var surfaceColor = obj.color;
        var lobes = materialLobes(mat);
        var Ks = lobes.specular;
        var ior = Math.max(1.0001, materialValue(mat.ior, 1.5));
        var subsurface = lobes.subsurface;
        var surfaceKd = lobes.diffuse;

        if (mat.refractive) {
            var entering = hit.frontFace;
            var eta = entering ? 1.0 / ior : ior;
            var n = normal;
            var cosTheta = Math.min(1, Math.max(0, -rayDir.dot(n)));
            var fresnel = dielectricFresnel(cosTheta, eta);

            if (rng() < fresnel) {
                rayDir = reflect(n, rayDir);
                rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
            } else {
                var refracted = refractPathDirection(normal, rayDir, ior, hit.frontFace);
                if (!refracted) {
                    rayDir = reflect(n, rayDir);
                    rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
                } else {
                    rayDir = refracted;
                    rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
                    if (entering) {
                        throughput = attenuateColor(throughput, transmissionTint(getTransmissionColor(mat, surfaceColor)));
                    }
                }
            }

            specularPath = true;
            continue;
        }

        if (surfaceKd > 0.0001 || subsurface > 0.0001) {
            if (specularPath) {
                storePhoton(causticPhotons, hit, rayDir, throughput);
            } else {
                storePhoton(globalPhotons, hit, rayDir, throughput);
            }
        }

        var total = surfaceKd + Ks;
        if (total <= 0.0) {
            return;
        }

        var diffuseProbability = surfaceKd / total;
        var specularProbability = Ks / total;
        var branchChoice = rng();
        if (branchChoice < diffuseProbability) {
            rayDir = sampleDiffuseDirection(normal, rng);
            rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
            throughput = scaleThroughput(
                attenuateColor(throughput, surfaceColor),
                surfaceKd / Math.max(diffuseProbability, 1e-4)
            );
            specularPath = false;
        } else {
            rayDir = reflect(normal, rayDir);
            rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
            throughput = scaleThroughput(throughput, Ks / Math.max(specularProbability, 1e-4));
            specularPath = true;
        }
    }
}

function gatherPhotonIrradiance(photonLookup, point, normal) {
    if (!photonLookup || !photonLookup.photons.length) {
        return new Color(0, 0, 0, 255);
    }

    var radius = photonLookup.radius;
    var radiusSquared = photonLookup.radiusSquared;
    var cellSize = photonLookup.cellSize;
    var baseCell = photonCellCoords(point, cellSize);
    var sum = new Color(0, 0, 0, 255);

    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                var bucket = photonLookup.cells[photonCellKey(baseCell.x + dx, baseCell.y + dy, baseCell.z + dz)];
                if (!bucket) {
                    continue;
                }

                for (var i = 0; i < bucket.length; i++) {
                    var photon = bucket[i];
                    var normalAlignment = photon.normal.x * normal.x + photon.normal.y * normal.y + photon.normal.z * normal.z;
                    if (normalAlignment <= 0.25) {
                        continue;
                    }

                    var offset = Vector3.fromPoint3(point, photon.p);
                    var distanceSquared = offset.normSquared();
                    if (distanceSquared > radiusSquared) {
                        continue;
                    }

                    var incomingCos = -(normal.x * photon.direction.x + normal.y * photon.direction.y + normal.z * photon.direction.z);
                    if (incomingCos <= 0) {
                        continue;
                    }

                    sum = addColor(sum, photon.power);
                }
            }
        }
    }

    return sum.mul(1.0 / Math.max(Math.PI * radiusSquared, 1e-6));
}

function estimatePhotonMapLighting(hit, normal, mat, throughput, photonMap) {
    if (!photonMap) {
        return new Color(0, 0, 0, 255);
    }

    var Kd = materialLobes(mat).diffuse;
    if (Kd <= 0.0) {
        return new Color(0, 0, 0, 255);
    }

    var globalIrradiance = gatherPhotonIrradiance(photonMap.global, hit.p, normal);
    var causticIrradiance = gatherPhotonIrradiance(photonMap.caustic, hit.p, normal);
    var irradiance = addColor(globalIrradiance, causticIrradiance);
    var color = hit.object.color;
    var brdfScale = Kd / Math.PI;

    return new Color(
        255.0 * throughput.r * (color.r / 255.0) * irradiance.r * brdfScale,
        255.0 * throughput.g * (color.g / 255.0) * irradiance.g * brdfScale,
        255.0 * throughput.b * (color.b / 255.0) * irradiance.b * brdfScale,
        255
    );
}

function estimateCausticPhotonLighting(hit, normal, mat, throughput, photonMap) {
    if (!photonMap || !photonMap.caustic) {
        return new Color(0, 0, 0, 255);
    }
    var Kd = materialLobes(mat).diffuse;
    if (Kd <= 0.0) {
        return new Color(0, 0, 0, 255);
    }

    var irradiance = gatherPhotonIrradiance(photonMap.caustic, hit.p, normal);
    var color = hit.object.color;
    var brdfScale = Kd / Math.PI;
    return new Color(
        255.0 * throughput.r * (color.r / 255.0) * irradiance.r * brdfScale,
        255.0 * throughput.g * (color.g / 255.0) * irradiance.g * brdfScale,
        255.0 * throughput.b * (color.b / 255.0) * irradiance.b * brdfScale,
        255
    );
}

function isVisibleCausticReceiver(hit) {
    if (!hit || !hit.object) {
        return false;
    }
    var mat = hit.object.material || {};
    if (mat.refractive) {
        return false;
    }
    return materialLobes(mat).diffuse > 0.0;
}

Scene.prototype.buildPhotonMap = function(options, rng) {
    options = options || {};
    var photonCount = options.photonCount || 16000;
    var maxDepth = options.maxDepth || 8;
    var globalRadius = options.globalRadius || 2.5;
    var causticRadius = options.causticRadius || 1.0;
    var globalPhotons = [];
    var causticPhotons = [];
    var refractiveTargets = listRefractiveTargets(this);
    var focusedPhotonRatio = refractiveTargets.length ? Math.max(0.0, Math.min(1.0, options.focusedPhotonRatio !== undefined ? options.focusedPhotonRatio : 0.0)) : 0.0;

    if (!this.areaLights.length || photonCount <= 0) {
        return {
            global: buildPhotonLookup([], globalRadius),
            caustic: buildPhotonLookup([], causticRadius)
        };
    }

    for (var photonIndex = 0; photonIndex < photonCount; photonIndex++) {
        var lightSample = sampleWeightedAreaLight(this, rng);
        var light = lightSample.light;
        var lightPoint = sampleAreaLight(light, rng);
        var emitNormal = light.normal;
        var photonDir;
        if (focusedPhotonRatio > 0.0 && rng() < focusedPhotonRatio) {
            var target = refractiveTargets[Math.floor(rng() * refractiveTargets.length)];
            var targetPoint = sampleTargetPoint(target, lightPoint, rng);
            photonDir = Vector3.fromPoint3(lightPoint, targetPoint).normalized();
        } else {
            photonDir = sampleDiffuseDirection(emitNormal, rng);
        }
        var scale = lightSample.totalWeight * Math.PI / photonCount;
        var photonPower = normalizedPhotonPower(light.color, scale);
        tracePhoton(
            this,
            offsetPathOrigin(lightPoint, emitNormal, photonDir),
            photonDir,
            photonPower,
            maxDepth,
            rng,
            globalPhotons,
            causticPhotons
        );
    }

    return {
        global: buildPhotonLookup(globalPhotons, globalRadius),
        caustic: buildPhotonLookup(causticPhotons, causticRadius)
    };
};

Scene.prototype.estimatePhotonMapAtHit = function(hit, normal, throughput, photonMap) {
    return estimatePhotonMapLighting(hit, normal, hit.object.material || {}, throughput, photonMap);
};

Scene.prototype.estimateCausticPhotonRadiance = function(hit, normal, photonMap) {
    return estimateCausticPhotonLighting(
        hit,
        normal,
        hit.object.material || {},
        new Color(1.0, 1.0, 1.0, 1.0),
        photonMap
    );
};

Scene.prototype.visibleSurfaceCausticRadiance = function(origin, direction, photonMap) {
    var rayOrigin = new Point3(origin.x, origin.y, origin.z);
    var rayDir = direction.normalized();
    var hit = this.intersectSingle({ v: rayDir, p: rayOrigin, depth: 0 }, origin);
    if (!hit.hit || hit.t === 0 || !isVisibleCausticReceiver(hit)) {
        return new Color(0, 0, 0, 255);
    }
    return this.estimateCausticPhotonRadiance(hit, hit.normal, photonMap);
};

Scene.prototype.photonMapTrace = function(origin, direction, maxDepth, rng, photonMap) {
    var rayOrigin = new Point3(origin.x, origin.y, origin.z);
    var rayDir = direction.normalized();
    var throughput = new Color(1.0, 1.0, 1.0, 1.0);
    var radiance = new Color(0, 0, 0, 255);

    for (var depth = 0; depth < maxDepth; depth++) {
        var hit = this.intersectSingle({ v: rayDir, p: rayOrigin, depth: 0 }, origin);
        if (!hit.hit || hit.t === 0) {
            return addColor(radiance, applyThroughput(this.bgColor, throughput));
        }

        var obj = hit.object;
        var mat = obj.material || {};
        var normal = hit.normal;
        var surfaceColor = obj.color;
        var lobes = materialLobes(mat);
        var Ks = lobes.specular;
        var ior = Math.max(1.0001, materialValue(mat.ior, 1.5));
        var subsurface = lobes.subsurface;
        var subsurfaceDepth = Math.max(0.0002, materialValue(mat.subsurfaceDepth, 0.35));
        var subsurfaceColor = mat.subsurfaceColor || surfaceColor;

        if (mat.refractive) {
            var entering = hit.frontFace;
            var eta = entering ? 1.0 / ior : ior;
            var n = normal;
            var cosTheta = Math.min(1, Math.max(0, -rayDir.dot(n)));
            var fresnel = dielectricFresnel(cosTheta, eta);

            if (rng() < fresnel) {
                rayDir = reflect(n, rayDir);
                rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
            } else {
                var refracted = refractPathDirection(normal, rayDir, ior, hit.frontFace);
                if (!refracted) {
                    rayDir = reflect(n, rayDir);
                    rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
                } else {
                    rayDir = refracted;
                    rayOrigin = offsetPathOrigin(hit.p, normal, rayDir);
                    if (entering) {
                        throughput = attenuateColor(throughput, transmissionTint(getTransmissionColor(mat, surfaceColor)));
                    }
                }
            }
            continue;
        }

        var surfaceMat = {
            Kd: lobes.diffuse,
            Ks: Ks,
            ior: ior,
            refractive: false,
            Ka: mat.Ka
        };
        radiance = addColor(radiance, estimateAreaLighting(this, hit, normal, surfaceMat, throughput, rng));
        if (surfaceMat.Kd > 0.0) {
            radiance = addColor(radiance, estimateCausticPhotonLighting(hit, normal, surfaceMat, throughput, photonMap));
        }

        if (subsurface > 0.0) {
            var exitHit = this.sampleSubsurfaceExit(hit, rng, subsurfaceDepth);
            if (!exitHit) {
                var localScatterDir = sampleDiffuseDirection(normal, rng);
                rayOrigin = offsetPathOrigin(hit.p, normal, localScatterDir);
                rayDir = localScatterDir;
                throughput = attenuateColor(throughput, surfaceColor);
                throughput = scaleThroughput(throughput, subsurface / Math.max(subsurface, 1e-4));
                continue;
            }
            var transmissionColor = subsurfaceTransmittance(subsurfaceColor, exitHit.t, subsurfaceDepth);
            radiance = addColor(radiance, estimateAreaLighting(this, {
                p: exitHit.p,
                object: { color: transmissionColor }
            }, exitHit.normal, { Kd: 1.0, Ks: 0.0 }, throughput, rng));
            return radiance;
        }

        var total = surfaceMat.Kd + Ks;
        if (total <= 0.0) {
            return addColor(radiance, applyThroughput(this.bgColor, throughput));
        }

        var diffuseProbability = surfaceMat.Kd / total;
        var specularProbability = Ks / total;
        var choice = rng();

        if (choice < diffuseProbability) {
            var diffuseDir = sampleDiffuseDirection(normal, rng);
            rayOrigin = offsetPathOrigin(hit.p, normal, diffuseDir);
            rayDir = diffuseDir;
            throughput = attenuateColor(throughput, surfaceColor);
            throughput = scaleThroughput(throughput, surfaceMat.Kd / Math.max(diffuseProbability, 1e-4));
        } else if (choice < diffuseProbability + specularProbability) {
            var reflected = reflect(normal, rayDir);
            rayOrigin = offsetPathOrigin(hit.p, normal, reflected);
            rayDir = reflected;
            throughput = scaleThroughput(throughput, Ks / Math.max(specularProbability, 1e-4));
        } else {
            return addColor(radiance, applyThroughput(this.bgColor, throughput));
        }
    }

    return radiance;
};
