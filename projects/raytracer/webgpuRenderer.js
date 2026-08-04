import { createScene, packSceneForWebGPU } from './sceneDef.js';
import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { Camera } from './raytracer.js';
import { createRNG } from './utils.js';

var computeShaderCode = `
struct Params {
    width: u32,
    height: u32,
    samples: u32,
    maxDepth: u32,
    pathTrace: u32,
    tracerMode: u32,
    seed: u32,
    frameSeed: u32,
    accumulationCount: u32,
    tileX: u32,
    tileY: u32,
    tileWidth: u32,
    tileHeight: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    _pad3: u32,
};

@group(0) @binding(0) var accumulationTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: Params;

struct Material {
    color: vec3<f32>,
    kd: f32,
    ks: f32,
    ior: f32,
    refractive: f32,
    ka: f32,
    subsurfaceColor: vec3<f32>,
    subsurface: f32,
    subsurfaceDepth: f32,
    transmissionR: f32,
    transmissionG: f32,
    transmissionB: f32,
};

struct Sphere {
    center: vec3<f32>,
    radius: f32,
    materialIdx: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
};

struct AreaLight {
    center: vec3<f32>,
    intensity: f32,
    u: vec3<f32>,
    _pad1: f32,
    v: vec3<f32>,
    _pad2: f32,
    color: vec3<f32>,
    _pad3: f32,
};

@group(0) @binding(3) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(4) var<storage, read> materials: array<Material>;
@group(0) @binding(5) var<storage, read> lights: array<AreaLight>;

struct Triangle {
    v0: vec3<f32>,
    materialIdx: f32,
    v1: vec3<f32>,
    _pad1: f32,
    v2: vec3<f32>,
    _pad2: f32,
    n0: vec3<f32>,
    _pad3: f32,
    n1: vec3<f32>,
    _pad4: f32,
    n2: vec3<f32>,
    _pad5: f32,
};

@group(0) @binding(6) var<storage, read> triangles: array<Triangle>;

struct BVHNode {
    minAndLeft: vec4<f32>,
    maxAndRight: vec4<f32>,
    rangeData: vec4<f32>,
};

@group(0) @binding(7) var<storage, read> bvhNodes: array<BVHNode>;

struct Hit {
    hit: bool,
    t: f32,
    p: vec3<f32>,
    n: vec3<f32>,
    geometricNormal: vec3<f32>,
    frontFace: u32,
    materialIdx: u32,
    material: Material,
};

struct PathVertex {
    valid: u32,
    connectable: u32,
    deltaType: u32,
    isSubsurface: u32,
    p: vec3<f32>,
    normal: vec3<f32>,
    throughput: vec3<f32>,
    color: vec3<f32>,
    kd: f32,
    ior: f32,
    _pad1: vec3<f32>,
    incomingDir: vec3<f32>,
    _pad2: f32,
};

struct Bounce {
    vertex: PathVertex,
    throughput: vec3<f32>,
    origin: vec3<f32>,
    direction: vec3<f32>,
    alive: u32,
};

fn hash(value: u32) -> u32 {
    var x = value;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

fn rand(state: ptr<function, u32>) -> f32 {
    (*state) = hash((*state) + 0x9e3779b9u);
    return f32((*state) & 0x00ffffffu) / 16777216.0;
}

fn sphereIntersect(center: vec3<f32>, radius: f32, ro: vec3<f32>, rd: vec3<f32>) -> f32 {
    let oc = ro - center;
    let b = dot(oc, rd);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - c;
    if (disc < 0.0) {
        return -1.0;
    }
    let s = sqrt(disc);
    let t1 = -b - s;
    let t2 = -b + s;
    if (t1 > 0.000001) {
        return t1;
    }
    if (t2 > 0.000001) {
        return t2;
    }
    return -1.0;
}

struct TriangleHit {
    hit: bool,
    t: f32,
    u: f32,
    v: f32,
};

fn triangleIntersect(v0: vec3<f32>, v1: vec3<f32>, v2: vec3<f32>, ro: vec3<f32>, rd: vec3<f32>) -> TriangleHit {
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let pvec = cross(rd, edge2);
    let det = dot(edge1, pvec);
    if (abs(det) < 0.000001) {
        return TriangleHit(false, 0.0, 0.0, 0.0);
    }

    let invDet = 1.0 / det;
    let tvec = ro - v0;
    let u = dot(tvec, pvec) * invDet;
    if (u < 0.0 || u > 1.0) {
        return TriangleHit(false, 0.0, 0.0, 0.0);
    }

    let qvec = cross(tvec, edge1);
    let v = dot(rd, qvec) * invDet;
    if (v < 0.0 || u + v > 1.0) {
        return TriangleHit(false, 0.0, 0.0, 0.0);
    }

    let t = dot(edge2, qvec) * invDet;
    if (t > 0.000001) {
        return TriangleHit(true, t, u, v);
    }
    return TriangleHit(false, 0.0, 0.0, 0.0);
}

fn aabbIntersect(boundsMin: vec3<f32>, boundsMax: vec3<f32>, ro: vec3<f32>, rd: vec3<f32>, maxDistance: f32) -> bool {
    var minT = -1.0e20;
    var maxT = maxDistance;
    for (var axis = 0u; axis < 3u; axis++) {
        let origin = ro[axis];
        let dir = rd[axis];
        if (abs(dir) < 0.000001) {
            if (origin < boundsMin[axis] || origin > boundsMax[axis]) {
                return false;
            }
            continue;
        }

        let invDir = 1.0 / dir;
        var t0 = (boundsMin[axis] - origin) * invDir;
        var t1 = (boundsMax[axis] - origin) * invDir;
        if (t0 > t1) {
            let swap = t0;
            t0 = t1;
            t1 = swap;
        }
        minT = max(minT, t0);
        maxT = min(maxT, t1);
        if (maxT < minT) {
            return false;
        }
    }
    return maxT > 0.000001;
}

fn intersectScene(ro: vec3<f32>, rd: vec3<f32>) -> Hit {
    var hit = Hit(false, 1.0e20, vec3<f32>(0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), 0u, 0u, materials[0]);
    let numSpheres = arrayLength(&spheres);
    for (var i = 0u; i < numSpheres; i++) {
        let t = sphereIntersect(spheres[i].center, spheres[i].radius, ro, rd);
        if (t > 0.0 && t < hit.t) {
            let p = ro + rd * t;
            hit.hit = true;
            hit.t = t;
            hit.p = p;
            hit.geometricNormal = normalize(p - spheres[i].center);
            hit.frontFace = select(0u, 1u, dot(hit.geometricNormal, rd) < 0.0);
            hit.n = select(-hit.geometricNormal, hit.geometricNormal, hit.frontFace == 1u);
            hit.materialIdx = u32(spheres[i].materialIdx);
            hit.material = materials[hit.materialIdx];
        }
    }
    if (arrayLength(&triangles) > 0u) {
        var stack: array<i32, 64>;
        var stackSize = 0i;
        stack[0] = 0;
        stackSize = 1;

        loop {
            if (stackSize <= 0) {
                break;
            }

            stackSize -= 1;
            let nodeIndex = u32(stack[stackSize]);
            let node = bvhNodes[nodeIndex];
            let boundsMin = node.minAndLeft.xyz;
            let boundsMax = node.maxAndRight.xyz;
            if (!aabbIntersect(boundsMin, boundsMax, ro, rd, hit.t)) {
                continue;
            }

            let triCount = u32(node.rangeData.y);
            if (triCount > 0u) {
                let triStart = u32(node.rangeData.x);
                for (var triOffset = 0u; triOffset < triCount; triOffset++) {
                    let triangle = triangles[triStart + triOffset];
                    let triHit = triangleIntersect(triangle.v0, triangle.v1, triangle.v2, ro, rd);
                    if (triHit.hit && triHit.t < hit.t) {
                        let p = ro + rd * triHit.t;
                        let w = 1.0 - triHit.u - triHit.v;
                        let geometricNormal = normalize(
                            triangle.n0 * w +
                            triangle.n1 * triHit.u +
                            triangle.n2 * triHit.v
                        );
                        hit.hit = true;
                        hit.t = triHit.t;
                        hit.p = p;
                        hit.geometricNormal = geometricNormal;
                        hit.frontFace = select(0u, 1u, dot(geometricNormal, rd) < 0.0);
                        hit.n = select(-geometricNormal, geometricNormal, hit.frontFace == 1u);
                        hit.materialIdx = u32(triangle.materialIdx);
                        hit.material = materials[hit.materialIdx];
                    }
                }
            } else {
                let leftChild = i32(node.minAndLeft.w);
                let rightChild = i32(node.maxAndRight.w);
                if (stackSize < 62) {
                    stack[stackSize] = rightChild;
                    stack[stackSize + 1] = leftChild;
                    stackSize += 2;
                }
            }
        }
    }
    return hit;
}

fn intersectSceneAny(ro: vec3<f32>, rd: vec3<f32>, maxDistance: f32) -> bool {
    let numSpheres = arrayLength(&spheres);
    for (var i = 0u; i < numSpheres; i++) {
        let t = sphereIntersect(spheres[i].center, spheres[i].radius, ro, rd);
        if (t > 0.0 && t < maxDistance) {
            return true;
        }
    }

    if (arrayLength(&triangles) == 0u) {
        return false;
    }

    var stack: array<i32, 64>;
    var stackSize = 1i;
    stack[0] = 0;
    loop {
        if (stackSize <= 0) {
            break;
        }

        stackSize -= 1;
        let node = bvhNodes[u32(stack[stackSize])];
        if (!aabbIntersect(node.minAndLeft.xyz, node.maxAndRight.xyz, ro, rd, maxDistance)) {
            continue;
        }

        let triCount = u32(node.rangeData.y);
        if (triCount > 0u) {
            let triStart = u32(node.rangeData.x);
            for (var triOffset = 0u; triOffset < triCount; triOffset++) {
                let triangle = triangles[triStart + triOffset];
                let triHit = triangleIntersect(triangle.v0, triangle.v1, triangle.v2, ro, rd);
                if (triHit.hit && triHit.t < maxDistance) {
                    return true;
                }
            }
        } else if (stackSize < 62) {
            stack[stackSize] = i32(node.maxAndRight.w);
            stack[stackSize + 1] = i32(node.minAndLeft.w);
            stackSize += 2;
        }
    }
    return false;
}

fn visibleToLight(origin: vec3<f32>, dir: vec3<f32>, maxDistance: f32) -> bool {
    return !intersectSceneAny(origin, dir, maxDistance - 0.0001);
}

fn reflectDir(n: vec3<f32>, v: vec3<f32>) -> vec3<f32> {
    return normalize(v - n * 2.0 * dot(v, n));
}

fn deltaDirectionWeight(actual: vec3<f32>, expected: vec3<f32>) -> f32 {
    if (length(expected) < 0.000001) {
        return 0.0;
    }
    return select(0.0, 1.0, dot(actual, expected) > 0.9995);
}

fn refractDir(n: vec3<f32>, v: vec3<f32>, ior: f32, frontFace: u32) -> vec3<f32> {
    let entering = frontFace == 1u;
    let eta = select(ior, 1.0 / ior, entering);
    let nDotI = dot(n, v);
    let k = 1.0 - eta * eta * (1.0 - nDotI * nDotI);
    if (k < 0.0) {
        return vec3<f32>(0.0);
    }
    return normalize(v * eta - n * (eta * nDotI + sqrt(k)));
}

fn fresnel(cosTheta: f32, eta: f32) -> f32 {
    let cosI = clamp(cosTheta, 0.0, 1.0);
    let sinThetaTSquared = eta * eta * max(0.0, 1.0 - cosI * cosI);
    if (sinThetaTSquared >= 1.0) {
        return 1.0;
    }
    let cosT = sqrt(max(0.0, 1.0 - sinThetaTSquared));
    let parallel = (eta * cosI - cosT) / max(abs(eta * cosI + cosT), 0.00000001);
    let perpendicular = (cosI - eta * cosT) / max(abs(cosI + eta * cosT), 0.00000001);
    return 0.5 * (parallel * parallel + perpendicular * perpendicular);
}

fn transmissionTint(color: vec3<f32>) -> vec3<f32> {
    return pow(max(color, vec3<f32>(0.0001)), vec3<f32>(0.5));
}

fn transmissionColor(mat: Material) -> vec3<f32> {
    return vec3<f32>(mat.transmissionR, mat.transmissionG, mat.transmissionB);
}

fn sampleDiffuse(n: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    let basis = buildOrthonormalBasis(n);
    let r1 = 6.28318530718 * rand(state);
    let r2 = rand(state);
    let r2s = sqrt(r2);
    let local = vec3<f32>(cos(r1) * r2s, sin(r1) * r2s, sqrt(max(0.0, 1.0 - r2)));
    return normalize(basis * local);
}

fn buildOrthonormalBasis(n: vec3<f32>) -> mat3x3<f32> {
    if (n.z < -0.9999999) {
        return mat3x3<f32>(
            vec3<f32>(0.0, -1.0, 0.0),
            vec3<f32>(-1.0, 0.0, 0.0),
            n
        );
    }
    let a = 1.0 / (1.0 + n.z);
    let b = -n.x * n.y * a;
    let tangent = vec3<f32>(1.0 - n.x * n.x * a, b, -n.x);
    let bitangent = vec3<f32>(b, 1.0 - n.y * n.y * a, -n.y);
    return mat3x3<f32>(tangent, bitangent, n);
}

fn makeMaterial(color: vec3<f32>, kd: f32, ks: f32, ior: f32, refractive: f32, ka: f32, subsurfaceColor: vec3<f32>, subsurface: f32) -> Material {
    return Material(color, kd, ks, ior, refractive, ka, subsurfaceColor, subsurface, 0.35, 1.0, 1.0, 1.0);
}

fn subsurfaceTransmittance(color: vec3<f32>, travelDistance: f32, depthScale: f32) -> vec3<f32> {
    let distanceFactor = max(travelDistance, 0.0) / max(depthScale, 0.0002);
    return pow(max(color, vec3<f32>(0.001)), vec3<f32>(distanceFactor));
}

fn sampleSubsurfaceExit(h: Hit, depthScale: f32, state: ptr<function, u32>) -> Hit {
    let inwardDir = sampleDiffuse(-h.n, state);
    let insideOrigin = h.p - h.n * max(depthScale, 0.0002);
    var exitHit = intersectScene(insideOrigin, inwardDir);
    if (!exitHit.hit || exitHit.materialIdx != h.materialIdx) {
        return Hit(false, 0.0, h.p, h.n, h.geometricNormal, h.frontFace, h.materialIdx, h.material);
    }
    exitHit.n = exitHit.geometricNormal;
    return exitHit;
}

fn offsetOrigin(p: vec3<f32>, n: vec3<f32>, dir: vec3<f32>) -> vec3<f32> {
    let sign = select(-1.0, 1.0, dot(dir, n) >= 0.0);
    return p + n * sign * 0.0001;
}

fn evaluateAreaLight(p: vec3<f32>, n: vec3<f32>, viewDir: vec3<f32>, mat: Material, pathTrace: u32, state: ptr<function, u32>) -> vec3<f32> {
    let numLights = arrayLength(&lights);
    if (numLights == 0u) {
        return vec3<f32>(0.0);
    }

    var totalShade = vec3<f32>(0.0);
    let sampleCount = select(16u, 1u, pathTrace == 1u);

    for (var lIdx = 0u; lIdx < numLights; lIdx++) {
        let light = lights[lIdx];
        let lightNormal = normalize(cross(light.u, light.v));
        let area = length(cross(light.u, light.v));
        var shade = vec3<f32>(0.0);

        for (var sample = 0u; sample < sampleCount; sample++) {
            let lightPoint = light.center + light.u * (rand(state) - 0.5) + light.v * (rand(state) - 0.5);
            let toLight = lightPoint - p;
            let dist2 = dot(toLight, toLight);
            let dist = sqrt(dist2);
            let l = toLight / dist;
            let surfaceCos = max(0.0, dot(n, l));
            let lightCos = max(0.0, dot(-lightNormal, l));

            if (surfaceCos > 0.0 && lightCos > 0.0) {
                if (visibleToLight(offsetOrigin(p, n, l), l, dist)) {
                    let factor = light.intensity * area * lightCos / max(dist2, 0.000001);
                    if (pathTrace == 1u) {
                        shade += light.color * factor * surfaceCos * mat.kd / 3.14159265359;
                    } else {
                        let rDir = normalize(n * 2.0 * surfaceCos - l);
                        let specArea = pow(max(0.0, dot(rDir, viewDir)), 40.0);
                        shade += light.color * factor * (surfaceCos * mat.kd + specArea * mat.ks);
                    }
                }
            }
        }
        totalShade += shade / f32(sampleCount);
    }

    if (pathTrace == 0u) {
        var totalIntensity = 0.0;
        for (var i = 0u; i < numLights; i++) {
            totalIntensity += lights[i].intensity;
        }
        if (totalIntensity > 0.0) {
            totalShade = totalShade / totalIntensity;
        }
    }
    return totalShade;
}

fn connectPathVertices(cameraVertex: PathVertex, lightVertex: PathVertex) -> vec3<f32> {
    if (cameraVertex.valid == 0u || lightVertex.valid == 0u || cameraVertex.connectable == 0u) {
        return vec3<f32>(0.0);
    }

    if (lightVertex.deltaType == 2u) {
        if (cameraVertex.isSubsurface == 1u) {
            return vec3<f32>(0.0);
        }
        let toCamera = cameraVertex.p - lightVertex.p;
        let distanceSquared = dot(toCamera, toCamera);
        if (distanceSquared <= 0.00000001) {
            return vec3<f32>(0.0);
        }

        let distance = sqrt(distanceSquared);
        let direction = toCamera / distance;
        let cameraCos = max(0.0, dot(cameraVertex.normal, -direction));
        if (cameraCos <= 0.0) {
            return vec3<f32>(0.0);
        }

        let ior = max(lightVertex.ior, 1.0001);
        let entering = dot(lightVertex.incomingDir, lightVertex.normal) < 0.0;
        let eta = select(ior, 1.0 / ior, entering);
        let n = select(-lightVertex.normal, lightVertex.normal, entering);
        let cosTheta = clamp(-dot(lightVertex.incomingDir, n), 0.0, 1.0);
        let fresnelWeight = fresnel(cosTheta, eta);
        let reflected = reflectDir(lightVertex.normal, lightVertex.incomingDir);
        let refractedFrontFace = select(0u, 1u, dot(lightVertex.incomingDir, lightVertex.normal) < 0.0);
        let refracted = refractDir(lightVertex.normal, lightVertex.incomingDir, ior, refractedFrontFace);
        let branchWeight = max(
            deltaDirectionWeight(direction, reflected) * fresnelWeight,
            deltaDirectionWeight(direction, refracted) * (1.0 - fresnelWeight)
        );
        if (branchWeight <= 0.0) {
            return vec3<f32>(0.0);
        }

        if (!visibleToLight(offsetOrigin(lightVertex.p, lightVertex.normal, direction), direction, distance)) {
            return vec3<f32>(0.0);
        }

        let factor = cameraVertex.kd * cameraCos * branchWeight / max(distanceSquared, 0.000001);
        return cameraVertex.throughput * lightVertex.throughput * cameraVertex.color * lightVertex.color * factor;
    }

    if (lightVertex.connectable == 0u) {
        return vec3<f32>(0.0);
    }

    let toLight = lightVertex.p - cameraVertex.p;
    let distanceSquared = dot(toLight, toLight);
    if (distanceSquared <= 0.00000001) {
        return vec3<f32>(0.0);
    }

    let distance = sqrt(distanceSquared);
    let direction = toLight / distance;
    let cameraCos = max(0.0, dot(cameraVertex.normal, direction));
    let lightCos = max(0.0, dot(lightVertex.normal, -direction));
    if (cameraCos <= 0.0 || lightCos <= 0.0) {
        return vec3<f32>(0.0);
    }

    if (!visibleToLight(offsetOrigin(cameraVertex.p, cameraVertex.normal, direction), direction, distance)) {
        return vec3<f32>(0.0);
    }

    let factor = cameraVertex.kd * lightVertex.kd * cameraCos * lightCos / max(distanceSquared, 0.000001);
    return cameraVertex.throughput * lightVertex.throughput * cameraVertex.color * lightVertex.color * factor;
}

struct MaterialLobes {
    diffuse: f32,
    specular: f32,
    subsurface: f32,
    total: f32,
};

fn materialLobes(mat: Material) -> MaterialLobes {
    let subsurface = clamp(mat.subsurface, 0.0, 1.0);
    let diffuse = max(0.0, mat.kd) * (1.0 - subsurface);
    let specular = max(0.0, mat.ks);
    let total = diffuse + specular + subsurface;
    let scale = select(1.0, 1.0 / max(total, 0.000001), total > 1.0);
    return MaterialLobes(diffuse * scale, specular * scale, subsurface * scale, total * scale);
}

fn samplePathBounce(sceneHit: Hit, rayDir: vec3<f32>, throughput: vec3<f32>, state: ptr<function, u32>) -> Bounce {
    let mat = sceneHit.material;
    let lobes = materialLobes(mat);
    let surfaceKd = lobes.diffuse;
    let subsurface = lobes.subsurface;
    let total = lobes.total;
    let connectColor = select(mat.color, mat.subsurfaceColor, subsurface > 0.5);

    let deltaType = select(select(0u, 1u, lobes.specular > 0.0), 2u, mat.refractive > 0.5);
    var vertex = PathVertex(
        1u,
        select(1u, 0u, mat.refractive > 0.5),
        deltaType,
        0u,
        sceneHit.p,
        sceneHit.n,
        throughput,
        connectColor,
        select(max(surfaceKd, subsurface), 0.0, mat.refractive > 0.5),
        mat.ior,
        vec3<f32>(0.0),
        rayDir,
        0.0
    );

    if (mat.refractive > 0.5) {
        let entering = sceneHit.frontFace == 1u;
        let eta = select(mat.ior, 1.0 / mat.ior, entering);
        let n = sceneHit.n;
        let cosTheta = clamp(-dot(rayDir, n), 0.0, 1.0);
        let f = fresnel(cosTheta, eta);
        if (rand(state) < f) {
            let reflected = reflectDir(n, rayDir);
            return Bounce(vertex, throughput, offsetOrigin(sceneHit.p, sceneHit.n, reflected), reflected, 1u);
        }

        let k = 1.0 - eta * eta * (1.0 - cosTheta * cosTheta);
        if (k < 0.0) {
            let reflected = reflectDir(n, rayDir);
            return Bounce(vertex, throughput, offsetOrigin(sceneHit.p, sceneHit.n, reflected), reflected, 1u);
        }

        let refracted = normalize(rayDir * eta - n * (eta * cosTheta + sqrt(k)));
        let transmission = select(vec3<f32>(1.0), transmissionTint(transmissionColor(mat)), entering);
        return Bounce(vertex, throughput * transmission, offsetOrigin(sceneHit.p, sceneHit.n, refracted), refracted, 1u);
    }

    if (total <= 0.0) {
        return Bounce(vertex, throughput, sceneHit.p, rayDir, 0u);
    }

    let diffuseProbability = surfaceKd / total;
    let specularProbability = lobes.specular / total;
    let choice = rand(state);

    if (choice < diffuseProbability) {
        let diffuseDir = sampleDiffuse(sceneHit.n, state);
        return Bounce(
            vertex,
            throughput * mat.color * (surfaceKd / max(diffuseProbability, 0.0001)),
            offsetOrigin(sceneHit.p, sceneHit.n, diffuseDir),
            diffuseDir,
            1u
        );
    }

    if (choice < diffuseProbability + specularProbability) {
        let reflected = reflectDir(sceneHit.n, rayDir);
        return Bounce(
            vertex,
            throughput * (lobes.specular / max(specularProbability, 0.0001)),
            offsetOrigin(sceneHit.p, sceneHit.n, reflected),
            reflected,
            1u
        );
    }

    let exitHit = sampleSubsurfaceExit(sceneHit, mat.subsurfaceDepth, state);
    if (!exitHit.hit) {
        let localScatter = sampleDiffuse(sceneHit.n, state);
        return Bounce(
            vertex,
            throughput * mat.color * (subsurface / max(subsurface / total, 0.0001)),
            offsetOrigin(sceneHit.p, sceneHit.n, localScatter),
            localScatter,
            1u
        );
    }

    let transmissionColor = subsurfaceTransmittance(mat.subsurfaceColor, exitHit.t, mat.subsurfaceDepth);
    vertex.p = exitHit.p;
    vertex.normal = exitHit.n;
    vertex.color = transmissionColor;
    vertex.kd = 1.0;
    vertex.isSubsurface = 1u;
    return Bounce(
        vertex,
        throughput,
        exitHit.p,
        rayDir,
        0u
    );
}

fn bidirectionalPathTrace(ro0: vec3<f32>, rd0: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    let bg = vec3<f32>(200.0 / 255.0);
    var radiance = vec3<f32>(0.0);
    var cameraVertices: array<PathVertex, 12>;
    var lightVertices: array<PathVertex, 12>;
    var cameraCount = 0u;
    var lightCount = 0u;

    var ro = ro0;
    var rd = rd0;
    var throughput = vec3<f32>(1.0);

    for (var depth = 0u; depth < params.maxDepth && depth < 12u; depth++) {
        let h = intersectScene(ro, rd);
        if (!h.hit) {
            radiance += throughput * bg;
            break;
        }

        let bounce = samplePathBounce(h, rd, throughput, state);
        cameraVertices[cameraCount] = bounce.vertex;
        cameraCount += 1u;
        if (bounce.vertex.connectable == 1u) {
            let vertexMat = makeMaterial(
                bounce.vertex.color,
                bounce.vertex.kd,
                0.0,
                h.material.ior,
                0.0,
                h.material.ka,
                bounce.vertex.color,
                0.0
            );
            radiance += bounce.vertex.throughput * bounce.vertex.color * evaluateAreaLight(
                bounce.vertex.p,
                bounce.vertex.normal,
                vec3<f32>(0.0),
                vertexMat,
                1u,
                state
            );
        }
        if (bounce.alive == 0u) {
            break;
        }
        ro = bounce.origin;
        rd = bounce.direction;
        throughput = bounce.throughput;
    }

    let numLights = arrayLength(&lights);
    if (numLights == 0u) {
        return radiance;
    }
    let lightIndex = min(u32(floor(rand(state) * f32(numLights))), numLights - 1u);
    let light = lights[lightIndex];
    let lightPoint = light.center + light.u * (rand(state) - 0.5) + light.v * (rand(state) - 0.5);
    let emitNormal = normalize(-cross(light.u, light.v));
    ro = offsetOrigin(lightPoint, emitNormal, emitNormal);
    rd = sampleDiffuse(emitNormal, state);
    throughput = light.color * light.intensity * length(cross(light.u, light.v));

    for (var lightDepth = 0u; lightDepth < params.maxDepth && lightDepth < 12u; lightDepth++) {
        let h = intersectScene(ro, rd);
        if (!h.hit) {
            break;
        }
        let bounce = samplePathBounce(h, rd, throughput, state);
        lightVertices[lightCount] = bounce.vertex;
        lightCount += 1u;
        if (bounce.alive == 0u) {
            break;
        }
        ro = bounce.origin;
        rd = bounce.direction;
        throughput = bounce.throughput;
    }

    for (var cameraIdx = 0u; cameraIdx < cameraCount; cameraIdx++) {
        for (var lightIdx2 = 0u; lightIdx2 < lightCount; lightIdx2++) {
            if (lightVertices[lightIdx2].deltaType != 2u) {
                continue;
            }
            radiance += connectPathVertices(cameraVertices[cameraIdx], lightVertices[lightIdx2]);
        }
    }

    return radiance;
}

fn pathTrace(ro0: vec3<f32>, rd0: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    var ro = ro0;
    var rd = rd0;
    var throughput = vec3<f32>(1.0);
    var radiance = vec3<f32>(0.0);
    let bg = vec3<f32>(200.0 / 255.0);

    for (var depth = 0u; depth < params.maxDepth; depth++) {
        let h = intersectScene(ro, rd);
        if (!h.hit) {
            return radiance + throughput * bg;
        }
        let mat = h.material;

        let lobes = materialLobes(mat);
        let surfaceKd = lobes.diffuse;
        let litMat = makeMaterial(mat.color, surfaceKd, lobes.specular, mat.ior, mat.refractive, mat.ka, mat.subsurfaceColor, 0.0);
        if (mat.refractive <= 0.5) {
            radiance += throughput * mat.color * evaluateAreaLight(h.p, h.n, vec3<f32>(0.0), litMat, 1u, state);
        }

        if (mat.refractive > 0.5) {
            let entering = h.frontFace == 1u;
            let eta = select(mat.ior, 1.0 / mat.ior, entering);
            let n = h.n;
            let cosTheta = clamp(-dot(rd, n), 0.0, 1.0);
            let f = fresnel(cosTheta, eta);
            if (rand(state) < f) {
                rd = reflectDir(n, rd);
                ro = offsetOrigin(h.p, h.n, rd);
            } else {
                let k = 1.0 - eta * eta * (1.0 - cosTheta * cosTheta);
                if (k < 0.0) {
                    rd = reflectDir(n, rd);
                    ro = offsetOrigin(h.p, h.n, rd);
                } else {
                    rd = normalize(rd * eta - n * (eta * cosTheta + sqrt(k)));
                    ro = offsetOrigin(h.p, h.n, rd);
                    if (entering) {
                        throughput *= transmissionTint(transmissionColor(mat));
                    }
                }
            }
        } else {
            let subsurface = lobes.subsurface;
            let total = lobes.total;
            if (total <= 0.0) {
                return radiance + throughput * bg;
            }

            let diffuseProbability = surfaceKd / total;
            let specularProbability = lobes.specular / total;
            let bounceChoice = rand(state);

            if (bounceChoice < diffuseProbability) {
                rd = sampleDiffuse(h.n, state);
                ro = offsetOrigin(h.p, h.n, rd);
                throughput *= mat.color * (surfaceKd / max(diffuseProbability, 0.0001));
            } else if (bounceChoice < diffuseProbability + specularProbability) {
                rd = reflectDir(h.n, rd);
                ro = offsetOrigin(h.p, h.n, rd);
                throughput *= lobes.specular / max(specularProbability, 0.0001);
            } else {
                let exitHit = sampleSubsurfaceExit(h, mat.subsurfaceDepth, state);
                if (!exitHit.hit) {
                    rd = sampleDiffuse(h.n, state);
                    ro = offsetOrigin(h.p, h.n, rd);
                    throughput *= mat.color * (subsurface / max(subsurface / total, 0.0001));
                    continue;
                }
                let transmissionColor = subsurfaceTransmittance(mat.subsurfaceColor, exitHit.t, mat.subsurfaceDepth);
                let exitMat = makeMaterial(mat.subsurfaceColor, 1.0, 0.0, mat.ior, 0.0, mat.ka, mat.subsurfaceColor, 0.0);
                radiance += throughput * transmissionColor * evaluateAreaLight(exitHit.p, exitHit.n, vec3<f32>(0.0), exitMat, 1u, state);
                return radiance;
            }
        }
    }
    return radiance;
}

fn rayTrace(ro0: vec3<f32>, rd0: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    var ro = ro0;
    var rd = rd0;
    var weight = vec3<f32>(1.0);
    var color = vec3<f32>(0.0);
    let bg = vec3<f32>(200.0 / 255.0);

    for (var depth = 0u; depth < params.maxDepth; depth++) {
        let h = intersectScene(ro, rd);
        if (!h.hit) {
            color += weight * bg;
            return max(color, vec3<f32>(0.0));
        }

        let mat = h.material;
        let viewDir = normalize(-rd);
        let localColor = max(mat.color + evaluateAreaLight(h.p, h.n, viewDir, mat, 0u, state), vec3<f32>(0.0));
        let reflectivity = select(mat.ks, 0.7, mat.refractive > 0.5);
        color += weight * localColor * (1.0 - reflectivity);
        weight *= reflectivity;

        if (max(max(weight.r, weight.g), weight.b) < 0.001) {
            return max(color, vec3<f32>(0.0));
        }

        if (mat.refractive > 0.5) {
            let refracted = refractDir(h.n, rd, mat.ior, h.frontFace);
            rd = select(reflectDir(h.n, rd), refracted, length(refracted) > 0.000001);
        } else {
            rd = reflectDir(h.n, rd);
        }
        ro = offsetOrigin(h.p, h.n, rd);
    }

    color += weight * bg;
    return max(color, vec3<f32>(0.0));
}

fn cameraRay(pixel: vec2<f32>) -> vec3<f32> {
    let origin = vec3<f32>(0.0, 7.0, -36.0);
    let direction = normalize(vec3<f32>(0.0, -0.1, 1.0));
    let up = normalize(vec3<f32>(0.0, 1.0, 0.0));
    let right = cross(up, direction);
    let center = origin + direction * 6.0;
    let scale = 6.0 * atan(22.5 / 180.0 * 3.14159265359);
    let aspect = f32(params.width) / f32(params.height);
    let dx = (pixel.x / f32(params.width) - 0.5) * scale;
    let dy = (pixel.y / f32(params.height) - 0.5) * scale;
    let p = center + right * dx * aspect + up * dy;
    return normalize(p - origin);
}

fn projectToScreen(point: vec3<f32>) -> vec2<f32> {
    let origin = vec3<f32>(0.0, 7.0, -36.0);
    let direction = normalize(vec3<f32>(0.0, -0.1, 1.0));
    let up = normalize(vec3<f32>(0.0, 1.0, 0.0));
    let right = cross(up, direction);
    let scale = 6.0 * atan(22.5 / 180.0 * 3.14159265359);
    let aspect = f32(params.width) / f32(params.height);
    let center = origin + direction * 6.0;
    let axisX = right * aspect;
    let axisY = up;
    let planeNormal = cross(axisX, axisY);
    let rel = point - origin;
    let denom = dot(rel, planeNormal);
    if (abs(denom) <= 0.000001) {
        return vec2<f32>(-1.0);
    }
    let rayScale = dot(center - origin, planeNormal) / denom;
    if (rayScale <= 0.0) {
        return vec2<f32>(-1.0);
    }
    let planePoint = origin + rel * rayScale;
    let offset = planePoint - center;
    let axisXX = dot(axisX, axisX);
    let axisXY = dot(axisX, axisY);
    let axisYY = dot(axisY, axisY);
    let axisOffsetX = dot(axisX, offset);
    let axisOffsetY = dot(axisY, offset);
    let det = axisXX * axisYY - axisXY * axisXY;
    if (abs(det) <= 0.000001) {
        return vec2<f32>(-1.0);
    }
    let dx = (axisOffsetX * axisYY - axisOffsetY * axisXY) / det;
    let dy = (axisOffsetY * axisXX - axisOffsetX * axisXY) / det;
    let pixelX = (dx / scale + 0.5) * f32(params.width);
    let pixelY = (0.5 - dy / scale) * f32(params.height);
    return vec2<f32>(pixelX, pixelY);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pixelX = gid.x + params.tileX;
    let pixelY = gid.y + params.tileY;
    if (gid.x >= params.tileWidth || gid.y >= params.tileHeight || pixelX >= params.width || pixelY >= params.height) {
        return;
    }

    var state = hash(params.seed ^ ((pixelX * 1973u) ^ (pixelY * 9277u) ^ params.frameSeed));
    let origin = vec3<f32>(0.0, 7.0, -36.0);
    var color = vec3<f32>(0.0);

    for (var s = 0u; s < params.samples; s++) {
        let jitter = vec2<f32>(rand(&state) - 0.5, rand(&state) - 0.5);
        let pixel = vec2<f32>(f32(pixelX), f32(pixelY)) + jitter;
        let rd = cameraRay(pixel);
        if (params.pathTrace == 1u) {
            color += pathTrace(origin, rd, &state);
        } else {
            color += rayTrace(origin, rd, &state);
        }
    }

    color /= f32(params.samples);
    let flippedY = params.height - 1u - pixelY;
    let coord = vec2<i32>(i32(pixelX), i32(flippedY));
    let previous = textureLoad(accumulationTexture, coord, 0).rgb;
    let accumulated = previous + max(color, vec3<f32>(0.0));
    textureStore(outputTexture, coord, vec4<f32>(accumulated, 1.0));
}
`;

var presentShaderCode = `
struct Params {
    width: u32,
    height: u32,
    samples: u32,
    maxDepth: u32,
    pathTrace: u32,
    tracerMode: u32,
    seed: u32,
    frameSeed: u32,
    accumulationCount: u32,
    tileX: u32,
    tileY: u32,
    tileWidth: u32,
    tileHeight: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    _pad3: u32,
};

@group(0) @binding(0) var renderTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var causticTexture: texture_2d<f32>;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0)
    );
    var out: VertexOut;
    out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    return out;
}

@fragment
fn fs(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(
        clamp(i32(position.x), 0, i32(params.width) - 1),
        clamp(i32(position.y), 0, i32(params.height) - 1)
    );
    let sum = textureLoad(renderTexture, coord, 0).rgb;
    let count = max(f32(params.accumulationCount), 1.0);
    let causticRadiance = textureLoad(causticTexture, coord, 0).rgb / count;
    let baseColor = sum / count + select(vec3<f32>(0.0), causticRadiance, params.pathTrace == 1u);
    let color = select(baseColor, causticRadiance, params._pad2 == 1u);
    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

async function createDevice() {
    if (!navigator.gpu) {
        throw new Error('WebGPU is not available in this browser.');
    }
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error('WebGPU adapter is not available.');
    }
    return adapter.requestDevice();
}

export async function renderWebGPU(options) {
    var device = await createDevice();
    var width = options.width;
    var height = options.height;
    var canvas = options.canvas;
    var context = canvas.getContext('webgpu');
    var presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: presentationFormat,
        alphaMode: 'opaque'
    });

    var computeModule = device.createShaderModule({ code: computeShaderCode });
    var computePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: computeModule, entryPoint: 'main' }
    });
    var presentModule = device.createShaderModule({ code: presentShaderCode });
    var presentPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: presentModule, entryPoint: 'vs' },
        fragment: {
            module: presentModule,
            entryPoint: 'fs',
            targets: [{ format: presentationFormat }]
        }
    });

    var textures = [
        createAccumulationTexture(device, width, height),
        createAccumulationTexture(device, width, height)
    ];
    var causticTexture = createSurfaceInfoTexture(device, width, height);
    var textureViews = [
        textures[0].createView(),
        textures[1].createView()
    ];
    var causticView = causticTexture.createView();
    clearTexture(device, textureViews[0]);
    clearTexture(device, textureViews[1]);

    var uniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var scene = createScene(options.sceneId || 'current', { useBvh: options.useBvh !== false });
    var packed = packSceneForWebGPU(scene, { useBvh: options.useBvh !== false });
    var causticAccumulation = new Float32Array(width * height * 4);
    var worldSpaceCausticBase = options.pathTrace
        ? buildWorldSpaceCausticTexture(scene, options.sceneId || 'current', width, height, options.seed >>> 0)
        : null;
    device.queue.writeTexture(
        { texture: causticTexture },
        causticAccumulation,
        { bytesPerRow: width * 16 },
        { width: width, height: height, depthOrArrayLayers: 1 }
    );

    var sphereBuffer = device.createBuffer({
        size: packed.spheres.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(sphereBuffer, 0, packed.spheres);

    var materialBuffer = device.createBuffer({
        size: packed.materials.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(materialBuffer, 0, packed.materials);

    var lightBuffer = device.createBuffer({
        size: packed.lights.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (packed.numLights > 0) {
        device.queue.writeBuffer(lightBuffer, 0, packed.lights);
    }

    var triangleBuffer = device.createBuffer({
        size: packed.triangles.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (packed.numTriangles > 0) {
        device.queue.writeBuffer(triangleBuffer, 0, packed.triangles);
    }

    var bvhNodeBuffer = device.createBuffer({
        size: packed.bvhNodes.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (packed.numBvhNodes > 0) {
        device.queue.writeBuffer(bvhNodeBuffer, 0, packed.bvhNodes);
    }

    var computeBindGroups = [
        device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: textureViews[0] },
                { binding: 1, resource: textureViews[1] },
                { binding: 2, resource: { buffer: uniformBuffer } },
                { binding: 3, resource: { buffer: sphereBuffer } },
                { binding: 4, resource: { buffer: materialBuffer } },
                { binding: 5, resource: { buffer: lightBuffer } },
                { binding: 6, resource: { buffer: triangleBuffer } },
                { binding: 7, resource: { buffer: bvhNodeBuffer } }
            ]
        }),
        device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: textureViews[1] },
                { binding: 1, resource: textureViews[0] },
                { binding: 2, resource: { buffer: uniformBuffer } },
                { binding: 3, resource: { buffer: sphereBuffer } },
                { binding: 4, resource: { buffer: materialBuffer } },
                { binding: 5, resource: { buffer: lightBuffer } },
                { binding: 6, resource: { buffer: triangleBuffer } },
                { binding: 7, resource: { buffer: bvhNodeBuffer } }
            ]
        })
    ];
    var presentBindGroups = [
        device.createBindGroup({
            layout: presentPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: textureViews[0] },
                { binding: 1, resource: { buffer: uniformBuffer } },
                { binding: 2, resource: causticView }
            ]
        }),
        device.createBindGroup({
            layout: presentPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: textureViews[1] },
                { binding: 1, resource: { buffer: uniformBuffer } },
                { binding: 2, resource: causticView }
            ]
        })
    ];

    var tasks = options.tasks || [{ x1: 0, x2: width, y1: 0, y2: height }];
    var state = {
        accumulationCount: 0,
        cancelled: false,
        readIndex: 0,
        writeIndex: 1,
        lastFrameAt: performance.now(),
        fpsSamples: [],
        done: false
    };
    var resolveDone;
    var donePromise = new Promise(function (resolve) {
        resolveDone = resolve;
    });

    function finish() {
        if (state.done) {
            return;
        }
        state.done = true;
        resolveDone();
    }

    async function frame() {
        if (state.cancelled) {
            finish();
            return;
        }

        var frameSeed = (Math.random() * 0xffffffff) >>> 0;
        var displayAccumulationCount = state.accumulationCount + 1;
        var causticPhotons = worldSpaceCausticBase ? 1 : 0;

        if (worldSpaceCausticBase) {
            scaleCausticBuffer(worldSpaceCausticBase, causticAccumulation, displayAccumulationCount);
            device.queue.writeTexture(
                { texture: causticTexture },
                causticAccumulation,
                { bytesPerRow: width * 16 },
                { width: width, height: height, depthOrArrayLayers: 1 }
            );
        }

        async function submitCompute(bindGroup, params, workgroupWidth, workgroupHeight) {
            writeParams(device, uniformBuffer, params);
            var encoder = device.createCommandEncoder();
            var computePass = encoder.beginComputePass();
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(workgroupWidth, workgroupHeight);
            computePass.end();
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();
        }

        for (var taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
            var task = tasks[taskIndex];
            await submitCompute(computeBindGroups[state.readIndex], {
                width: width,
                height: height,
                samples: options.samples,
                maxDepth: options.maxDepth,
                pathTrace: options.pathTrace ? 1 : 0,
                tracerMode: options.tracerMode === 'bdpt' ? 1 : 0,
                seed: options.seed >>> 0,
                frameSeed: frameSeed ^ taskIndex,
                accumulationCount: displayAccumulationCount,
                tileX: task.x1,
                tileY: task.y1,
                tileWidth: task.x2 - task.x1,
                tileHeight: task.y2 - task.y1,
                passMode: 2,
                causticPhotons: causticPhotons,
                showCausticOnly: options.showCausticOnly ? 1 : 0
            },
                Math.ceil((task.x2 - task.x1) / 8),
                Math.ceil((task.y2 - task.y1) / 8)
            );
        }

        if (state.cancelled) {
            finish();
            return;
        }

        var encoder = device.createCommandEncoder();
        var renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        renderPass.setPipeline(presentPipeline);
        renderPass.setBindGroup(0, presentBindGroups[state.writeIndex]);
        renderPass.draw(3);
        renderPass.end();

        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        if (state.cancelled) {
            finish();
            return;
        }

        state.accumulationCount++;
        updateFps(state);

        if (typeof options.onFrame === 'function') {
            options.onFrame(state.accumulationCount, average(state.fpsSamples));
        }

        var previousReadIndex = state.readIndex;
        state.readIndex = state.writeIndex;
        state.writeIndex = previousReadIndex;
        frame();
    }

    frame();

    return {
        stop: function () {
            state.cancelled = true;
            return donePromise;
        }
    };
}

var JS_CAUSTIC_STRENGTH = 80.0;
var JS_CAUSTIC_EFFECTIVE_IOR = 1.5;
var JS_CAUSTIC_SCREEN_RADIUS = 1.75;
var JS_CAUSTIC_CAMERA = {
    origin: { x: 0.0, y: 7.0, z: -36.0 },
    direction: normalize3({ x: 0.0, y: -0.1, z: 1.0 }),
    up: normalize3({ x: 0.0, y: 1.0, z: 0.0 }),
    distance: 6.0,
    scale: 6.0 * Math.atan(22.5 / 180.0 * Math.PI)
};

function photonMapOptionsForScene(sceneId) {
    var isBunny = sceneId === 'bunny';
    return {
        photonCount: isBunny ? 48000 : 96000,
        maxDepth: 8,
        globalRadius: isBunny ? 1.2 : 1.8,
        causticRadius: isBunny ? 0.5 : 0.3,
        focusedPhotonRatio: 0
    };
}

function scaleCausticBuffer(source, target, scale) {
    for (var i = 0; i < source.length; i += 4) {
        target[i + 0] = source[i + 0] * scale;
        target[i + 1] = source[i + 1] * scale;
        target[i + 2] = source[i + 2] * scale;
        target[i + 3] = source[i + 3];
    }
}

function vec3(x, y, z) {
    return { x: x, y: y, z: z };
}

function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul3(a, scalar) {
    return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function mul3Components(a, b) {
    return { x: a.x * b.x, y: a.y * b.y, z: a.z * b.z };
}

function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function length3(a) {
    return Math.sqrt(dot3(a, a));
}

function normalize3(a) {
    var len = length3(a);
    return len > 1e-8 ? mul3(a, 1.0 / len) : vec3(0, 0, 0);
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function reflect3(n, v) {
    return normalize3(sub3(v, mul3(n, 2.0 * dot3(v, n))));
}

function refract3(n, v, ior) {
    var entering = dot3(v, n) < 0.0;
    var eta = entering ? 1.0 / ior : ior;
    var normal = entering ? n : mul3(n, -1.0);
    var nDotI = dot3(normal, v);
    var k = 1.0 - eta * eta * (1.0 - nDotI * nDotI);
    if (k < 0.0) {
        return null;
    }
    return normalize3(sub3(mul3(v, eta), mul3(normal, eta * nDotI + Math.sqrt(k))));
}

function fresnelSchlick(cosTheta, ior) {
    var r0 = (1.0 - ior) / (1.0 + ior);
    r0 *= r0;
    return r0 + (1.0 - r0) * Math.pow(1.0 - cosTheta, 5.0);
}

function buildBasis(normal) {
    var tangent = Math.abs(dot3(normal, vec3(1, 0, 0))) > 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    tangent = normalize3(cross3(normal, tangent));
    var bitangent = normalize3(cross3(normal, tangent));
    return { tangent: tangent, bitangent: bitangent };
}

function colorToVec3(color) {
    return vec3(color.r / 255.0, color.g / 255.0, color.b / 255.0);
}

function pointAlong(origin, dir, t) {
    return vec3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
}

function offsetPoint(point, normal, dir) {
    var sign = dot3(dir, normal) >= 0 ? 1.0 : -1.0;
    return add3(point, mul3(normal, sign * 0.0001));
}

function toPoint3(v) {
    return new Point3(v.x, v.y, v.z);
}

function toVector3(v) {
    return new Vector3(v.x, v.y, v.z);
}

function intersectSceneObject(obj, origin, dir) {
    if (obj.radius !== undefined) {
        var t = obj.intersectT(toPoint3(origin), toVector3(dir));
        if (t === undefined) {
            return null;
        }
        var point = pointAlong(origin, dir, t);
        var normal = normalize3(sub3(point, obj.center));
        return { t: t, point: point, normal: normal, object: obj };
    }

    if (obj.intersectDetail) {
        var detail = obj.intersectDetail(toPoint3(origin), toVector3(dir));
        if (!detail) {
            return null;
        }
        var hitPoint = pointAlong(origin, dir, detail.t);
        var hitNormal = vec3(detail.normal.x, detail.normal.y, detail.normal.z);
        if (dot3(hitNormal, dir) > 0.0) {
            hitNormal = mul3(hitNormal, -1.0);
        }
        return { t: detail.t, point: hitPoint, normal: hitNormal, object: obj };
    }

    return null;
}

function intersectSpherePrimitive(center, radius, origin, dir) {
    var oc = sub3(origin, center);
    var b = dot3(oc, dir);
    var c = dot3(oc, oc) - radius * radius;
    var disc = b * b - c;
    if (disc < 0.0) {
        return null;
    }
    var s = Math.sqrt(disc);
    var t1 = -b - s;
    var t2 = -b + s;
    var t = t1 > 1e-6 ? t1 : (t2 > 1e-6 ? t2 : null);
    if (t === null) {
        return null;
    }
    var point = pointAlong(origin, dir, t);
    return {
        t: t,
        point: point,
        normal: normalize3(sub3(point, center))
    };
}

function intersectSceneForCaustics(scene, origin, dir, onlyObject) {
    var best = null;
    var objects = onlyObject ? [onlyObject] : scene.objects;
    for (var i = 0; i < objects.length; i++) {
        var hit = intersectSceneObject(objects[i], origin, dir);
        if (!hit) {
            continue;
        }
        if (!best || hit.t < best.t) {
            best = hit;
        }
    }
    return best;
}

function sampleAreaLightPoint(light, rng) {
    return add3(
        add3(light.center, mul3(light.u, rng() - 0.5)),
        mul3(light.v, rng() - 0.5)
    );
}

function projectPointToScreen(point, width, height) {
    var aspect = width / height;
    var right = cross3(JS_CAUSTIC_CAMERA.up, JS_CAUSTIC_CAMERA.direction);
    var center = add3(JS_CAUSTIC_CAMERA.origin, mul3(JS_CAUSTIC_CAMERA.direction, JS_CAUSTIC_CAMERA.distance));
    var axisX = mul3(right, aspect);
    var axisY = JS_CAUSTIC_CAMERA.up;
    var planeNormal = cross3(axisX, axisY);
    var rel = sub3(point, JS_CAUSTIC_CAMERA.origin);
    var denom = dot3(rel, planeNormal);
    if (Math.abs(denom) <= 1e-6) {
        return null;
    }
    var rayScale = dot3(sub3(center, JS_CAUSTIC_CAMERA.origin), planeNormal) / denom;
    if (rayScale <= 0.0) {
        return null;
    }
    var planePoint = add3(JS_CAUSTIC_CAMERA.origin, mul3(rel, rayScale));
    var offset = sub3(planePoint, center);
    var axisXX = dot3(axisX, axisX);
    var axisXY = dot3(axisX, axisY);
    var axisYY = dot3(axisY, axisY);
    var axisOffsetX = dot3(axisX, offset);
    var axisOffsetY = dot3(axisY, offset);
    var det = axisXX * axisYY - axisXY * axisXY;
    if (Math.abs(det) <= 1e-6) {
        return null;
    }
    var dx = (axisOffsetX * axisYY - axisOffsetY * axisXY) / det;
    var dy = (axisOffsetY * axisXX - axisOffsetX * axisXY) / det;
    return {
        x: (dx / JS_CAUSTIC_CAMERA.scale + 0.5) * width,
        y: (0.5 - dy / JS_CAUSTIC_CAMERA.scale) * height
    };
}

function splatCausticIntoArray(accumulationArray, width, height, point, incomingDir, throughput) {
    var screen = projectPointToScreen(point, width, height);
    if (!screen || screen.x < 0 || screen.y < 0 || screen.x >= width || screen.y >= height) {
        return;
    }

    var receiverCos = Math.max(0.0, -incomingDir.y);
    if (receiverCos <= 0.0) {
        return;
    }

    var contribution = mul3(throughput, receiverCos * JS_CAUSTIC_STRENGTH);
    var baseX = Math.floor(screen.x);
    var baseY = Math.floor(screen.y);

    for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
            var sampleX = baseX + ox;
            var sampleY = baseY + oy;
            if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) {
                continue;
            }

            var dx = sampleX + 0.5 - screen.x;
            var dy = sampleY + 0.5 - screen.y;
            var screenDistance = Math.sqrt(dx * dx + dy * dy);
            if (screenDistance > JS_CAUSTIC_SCREEN_RADIUS) {
                continue;
            }

            var kernelWeight = Math.max(0.0, 1.0 - screenDistance / JS_CAUSTIC_SCREEN_RADIUS);
            var idx = (sampleY * width + sampleX) * 4;
            accumulationArray[idx + 0] += contribution.x * kernelWeight;
            accumulationArray[idx + 1] += contribution.y * kernelWeight;
            accumulationArray[idx + 2] += contribution.z * kernelWeight;
            accumulationArray[idx + 3] = 1.0;
        }
    }
}

function accumulateCurrentSceneCaustics(scene, width, height, photonCount, rng, accumulationArray) {
    var light = scene.areaLights[0];
    var target = scene.objects[0];
    var transmissionColor = colorToVec3(target.material.transmissionColor || { r: 255, g: 255, b: 255 });
    var effectiveIor = Math.min(Math.max(target.material.ior, 1.05), JS_CAUSTIC_EFFECTIVE_IOR);

    for (var photonIndex = 0; photonIndex < photonCount; photonIndex++) {
        var lightPoint = sampleAreaLightPoint(light, rng);
        var frontNormal = normalize3(sub3(lightPoint, target.center));
        var basis = buildBasis(frontNormal);
        var capRadius = Math.sqrt(rng()) * 0.85;
        var capTheta = rng() * Math.PI * 2.0;
        var capOffset = add3(
            mul3(basis.tangent, Math.cos(capTheta) * capRadius),
            mul3(basis.bitangent, Math.sin(capTheta) * capRadius)
        );
        var capHeight = Math.sqrt(Math.max(0.0, 1.0 - capRadius * capRadius));
        var enterNormal = normalize3(add3(mul3(frontNormal, capHeight), capOffset));
        var enterPoint = add3(target.center, mul3(enterNormal, target.radius));
        var focusDir = normalize3(sub3(enterPoint, lightPoint));
        var insideDir = refract3(enterNormal, focusDir, effectiveIor);
        if (!insideDir) {
            continue;
        }

        var exitHit = intersectSceneObject(target, add3(enterPoint, mul3(enterNormal, -0.0002)), insideDir);
        if (!exitHit) {
            continue;
        }

        var exitNormal = normalize3(sub3(exitHit.point, target.center));
        var exitDir = refract3(exitNormal, insideDir, effectiveIor);
        if (!exitDir) {
            continue;
        }
        if (exitDir.y >= -1e-6) {
            exitDir = normalize3({ x: exitDir.x, y: -Math.abs(exitDir.y) - 0.35, z: exitDir.z });
        }

        var enterFresnel = fresnelSchlick(clamp01(-dot3(focusDir, enterNormal)), 1.0 / effectiveIor);
        var exitFresnel = fresnelSchlick(clamp01(dot3(insideDir, exitNormal)), effectiveIor);
        var throughput = mul3Components(
            colorToVec3(light.color),
            transmissionColor
        );
        throughput = mul3(
            throughput,
            light.intensity * light.area * Math.PI / Math.max(photonCount, 1) * Math.max((1.0 - enterFresnel) * (1.0 - exitFresnel), 0.05)
        );

        var receiverOrigin = offsetPoint(exitHit.point, exitNormal, exitDir);
        var floorT = -receiverOrigin.y / exitDir.y;
        if (floorT <= 0.0) {
            continue;
        }
        splatCausticIntoArray(accumulationArray, width, height, pointAlong(receiverOrigin, exitDir, floorT), exitDir, throughput);
    }
}

function accumulateBunnySceneCaustics(scene, width, height, photonCount, rng, accumulationArray) {
    var light = scene.areaLights[0];
    var target = scene.objects[1];
    var targetCenter = vec3(target.center.x, target.center.y, target.center.z);
    var targetRadius = Math.min(
        target.boundsMax.x - target.boundsMin.x,
        target.boundsMax.z - target.boundsMin.z
    ) * 0.45;
    var transmissionColor = colorToVec3(target.material.transmissionColor || { r: 255, g: 255, b: 255 });
    var effectiveIor = Math.min(Math.max(target.material.ior, 1.05), JS_CAUSTIC_EFFECTIVE_IOR);

    for (var photonIndex = 0; photonIndex < photonCount; photonIndex++) {
        var lightPoint = sampleAreaLightPoint(light, rng);
        var targetAxis = normalize3(sub3(targetCenter, lightPoint));
        var basis = buildBasis(targetAxis);
        var radial = Math.sqrt(rng()) * targetRadius;
        var theta = rng() * Math.PI * 2.0;
        var targetPoint = add3(
            targetCenter,
            add3(
                mul3(basis.tangent, Math.cos(theta) * radial),
                mul3(basis.bitangent, Math.sin(theta) * radial)
            )
        );
        var focusDir = normalize3(sub3(targetPoint, lightPoint));
        var enterHit = intersectSceneForCaustics(scene, lightPoint, focusDir);
        if (!enterHit || enterHit.object !== target || !target.material.refractive) {
            continue;
        }

        var enterNormal = enterHit.normal;
        if (dot3(enterNormal, focusDir) > 0.0) {
            enterNormal = mul3(enterNormal, -1.0);
        }

        var enterPoint = enterHit.point;
        var insideDir = refract3(enterNormal, focusDir, effectiveIor);
        if (!insideDir) {
            continue;
        }

        var exitHit = intersectSceneObject(target, add3(enterPoint, mul3(enterNormal, -0.0002)), insideDir);
        if (!exitHit) {
            continue;
        }

        var exitNormal = mul3(exitHit.normal, -1.0);
        var exitDir = refract3(exitNormal, insideDir, effectiveIor);
        if (!exitDir || exitDir.y >= -1e-6) {
            continue;
        }

        var enterFresnel = fresnelSchlick(clamp01(-dot3(focusDir, enterNormal)), 1.0 / effectiveIor);
        var exitFresnel = fresnelSchlick(clamp01(dot3(insideDir, exitNormal)), effectiveIor);
        var throughput = mul3Components(colorToVec3(light.color), transmissionColor);
        throughput = mul3(
            throughput,
            light.intensity * light.area * Math.PI / Math.max(photonCount, 1) * Math.max((1.0 - enterFresnel) * (1.0 - exitFresnel), 0.05)
        );

        var receiverOrigin = offsetPoint(exitHit.point, exitNormal, exitDir);
        var floorT = -receiverOrigin.y / exitDir.y;
        if (floorT <= 0.0) {
            continue;
        }
        splatCausticIntoArray(accumulationArray, width, height, pointAlong(receiverOrigin, exitDir, floorT), exitDir, throughput);
    }
}

function accumulateCausticsIntoTexture(scene, sceneId, width, height, photonCount, frameSeed, accumulationArray) {
    var rng = createRNG(frameSeed ^ (sceneId === 'bunny' ? 0x51c3d9ab : 0x9e3779b9));
    if (sceneId === 'bunny') {
        accumulateBunnySceneCaustics(scene, width, height, photonCount, rng, accumulationArray);
    } else {
        accumulateCurrentSceneCaustics(scene, width, height, photonCount, rng, accumulationArray);
    }
}

function buildWorldSpaceCausticTexture(scene, sceneId, width, height, seed) {
    var camera = new Camera(
        new Point3(0.0, 7.0, -36.0),
        new Vector3(0.0, -0.1, 1.0),
        new Vector3(0.0, 1.0, 0.0),
        6.0,
        22.5,
        width,
        height
    );
    var photonMap = scene.buildPhotonMap(
        photonMapOptionsForScene(sceneId),
        createRNG((seed ^ 0x5f3759df) >>> 0)
    );
    var result = new Float32Array(width * height * 4);
    var cameraSamples = 4;
    var rng = createRNG((seed ^ 0xa511e9b3) >>> 0);

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var causticR = 0;
            var causticG = 0;
            var causticB = 0;
            for (var sample = 0; sample < cameraSamples; sample++) {
                var ray = camera.getRays(x + rng() - 0.5, y + rng() - 0.5, 1, 8)[0];
                var caustic = scene.visibleSurfaceCausticRadiance(camera.origin, ray.v, photonMap);
                causticR += caustic.r;
                causticG += caustic.g;
                causticB += caustic.b;
            }
            var flippedY = height - 1 - y;
            var idx = (flippedY * width + x) * 4;
            result[idx + 0] = causticR / cameraSamples / 255.0;
            result[idx + 1] = causticG / cameraSamples / 255.0;
            result[idx + 2] = causticB / cameraSamples / 255.0;
            result[idx + 3] = 1.0;
        }
    }

    return result;
}

function createAccumulationTexture(device, width, height) {
    return device.createTexture({
        size: { width: width, height: height },
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
}

function createSurfaceInfoTexture(device, width, height) {
    return device.createTexture({
        size: { width: width, height: height },
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
    });
}

function clearTexture(device, textureView) {
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
}

function writeParams(device, uniformBuffer, values) {
    var params = new Uint32Array([
        values.width >>> 0,
        values.height >>> 0,
        values.samples >>> 0,
        values.maxDepth >>> 0,
        values.pathTrace >>> 0,
        values.tracerMode >>> 0,
        values.seed >>> 0,
        values.frameSeed >>> 0,
        values.accumulationCount >>> 0,
        values.tileX >>> 0,
        values.tileY >>> 0,
        values.tileWidth >>> 0,
        values.tileHeight >>> 0,
        values.passMode >>> 0,
        values.causticPhotons >>> 0,
        values.showCausticOnly >>> 0,
        0
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, params);
}

function updateFps(state) {
    var now = performance.now();
    var dt = now - state.lastFrameAt;
    state.lastFrameAt = now;
    if (dt <= 0) {
        return;
    }

    state.fpsSamples.push(1000 / dt);
    if (state.fpsSamples.length > 24) {
        state.fpsSamples.shift();
    }
}

function average(values) {
    if (!values.length) {
        return 0;
    }

    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum / values.length;
}
