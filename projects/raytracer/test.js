import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { createDefaultScene, createScene, packSceneForWebGPU } from './sceneDef.js';
import { createRNG, refract } from './utils.js';
import { Color } from './image.js';
import { Camera, Scene, dielectricFresnel, estimateAreaLighting, makeAreaLight, materialLobes } from './raytracer.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertNear(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function assertFiniteVector(vector, message) {
    assert(Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z), message);
}

console.log("=== Running Offline Node.js Tests for Ray Tracer ===\n");

try {
    // 1. Test Scene Creation
    console.log("[Test 1] Creating Default Scene...");
    const scene = createDefaultScene();
    assert(scene.objects.length === 4, `Expected 4 objects, got ${scene.objects.length}`);
    assert(scene.areaLights.length === 1, `Expected 1 area light, got ${scene.areaLights.length}`);
    console.log("✓ Scene created successfully.\n");

    // 2. Test GPU Buffer Packing
    console.log("[Test 2] Packing Scene for WebGPU...");
    const packed = packSceneForWebGPU(scene);
    assert(packed.spheres instanceof Float32Array, "Spheres buffer is not a Float32Array");
    assert(packed.numSpheres === 1, `Expected 1 packed sphere, got ${packed.numSpheres}`);
    assert(packed.spheres.length === 8, `Expected sphere buffer length 8, got ${packed.spheres.length}`);
    assert(packed.numTriangles > 0, "Expected packed bunny triangles");
    console.log("✓ Scene packed successfully.\n");

    // 3. Test Camera Ray Generation
    console.log("[Test 3] Generating Camera Rays...");
    const cam = new Camera(
        new Point3(0, 7.0, -36.0),
        new Vector3(0, -0.1, 1),
        new Vector3(0, 1, 0),
        6.0,
        22.5,
        480,
        320
    );
    for (const sampleCount of [1, 2, 5, 8, 9]) {
        const sampleRays = cam.getRays(240, 160, sampleCount, 8);
        assert(sampleRays.length === sampleCount, `Expected ${sampleCount} rays, got ${sampleRays.length}`);
        for (const ray of sampleRays) {
            assertFiniteVector(ray.v, `Non-finite camera ray for n=${sampleCount}`);
            assertNear(ray.v.norm(), 1, 1e-10, `Camera ray is not normalized for n=${sampleCount}`);
        }
    }
    const rays = cam.getRays(240, 160, 1, 8);
    console.log("✓ Camera generated rays successfully.\n");

    console.log("[Test 4] Testing point, hit, and dielectric contracts...");
    const defaultPoint = new Point3();
    assert(defaultPoint.x === 0 && defaultPoint.y === 0 && defaultPoint.z === 0, "Point3 defaults must be finite zeros");

    const currentScene = createScene('current');
    const outsideHit = currentScene.intersectSingle({
        p: new Point3(1, 2, -4),
        v: new Vector3(0, 0, 1),
        depth: 1
    }, new Point3(1, 2, -4));
    assert(outsideHit.hit && outsideHit.frontFace === true, "Outside sphere hit must be front-facing");
    assert(outsideHit.normal.dot(new Vector3(0, 0, 1)) <= 0, "Shading normal must face the incoming ray");

    const insideDirection = new Vector3(1, 0, 0);
    const insideHit = currentScene.intersectSingle({
        p: new Point3(1, 2, 1),
        v: insideDirection,
        depth: 1
    }, new Point3(1, 2, 1));
    assert(insideHit.hit && insideHit.frontFace === false, "Inside sphere hit must be back-facing");
    assert(insideHit.normal.dot(insideDirection) <= 0, "Back-face shading normal must face the incoming ray");

    const tir = refract(new Vector3(0, 1, 0), new Vector3(0.9, 0.435889894, 0).normalized(), 1.5);
    assert(tir === null, "Dense-to-air TIR must return null");
    assertNear(dielectricFresnel(1, 1 / 1.5), 0.04, 1e-10, "Normal-incidence dielectric Fresnel mismatch");

    const blueBunnyLobes = materialLobes(scene.objects[2].material);
    assert(blueBunnyLobes.total <= 1, "Material lobe energy must not exceed one");
    console.log("✓ Point, hit, and dielectric contracts passed.\n");

    console.log("[Test 5] Testing Lambertian area-light normalization...");
    const lightingScene = new Scene();
    lightingScene.addAreaLight(makeAreaLight(
        new Point3(0, 2, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 0, 1),
        Color.WHITE,
        1
    ));
    const direct = estimateAreaLighting(
        lightingScene,
        { p: new Point3(0, 0, 0), object: { color: Color.WHITE } },
        new Vector3(0, 1, 0),
        { Kd: 1, Ks: 0 },
        new Color(1, 1, 1, 1),
        () => 0.5
    );
    assertNear(direct.r, 255 / (4 * Math.PI), 1e-9, "Lambertian area-light estimate mismatch");
    console.log("✓ Lambertian normalization passed.\n");

    // 6. Test Ray Intersection
    console.log("[Test 6] Testing CPU Ray Intersection...");
    const hit = scene.intersect(rays[0], cam.origin);
    if (!hit || typeof hit.hit !== 'boolean') {
        throw new Error("Intersect returned invalid format");
    }
    console.log(`  Hit result: ${hit.hit}, distance: ${hit.t !== Number.MAX_VALUE ? hit.t.toFixed(2) : 'infinity'}`);
    console.log("✓ Intersection logic passed.\n");

    // 7. Test Path Tracing
    console.log("[Test 7] Testing CPU Path Tracing (1 sample)...");
    const rng = createRNG(42);
    const color = scene.pathTrace(cam.origin, rays[0].v, 8, rng);
    assert(color && Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b), "Path Trace returned non-finite color");
    console.log(`  Path Trace color: R=${color.r.toFixed(2)}, G=${color.g.toFixed(2)}, B=${color.b.toFixed(2)}`);
    console.log("✓ Path tracing logic passed.\n");

    console.log("=== All Tests Passed Successfully! ===");
} catch (e) {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
}
