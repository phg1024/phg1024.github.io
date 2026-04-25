import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { createDefaultScene, packSceneForWebGPU } from './sceneDef.js';
import { createRNG } from './utils.js';
import { Camera } from './raytracer.js';

console.log("=== Running Offline Node.js Tests for Ray Tracer ===\n");

try {
    // 1. Test Scene Creation
    console.log("[Test 1] Creating Default Scene...");
    const scene = createDefaultScene();
    if (scene.objects.length !== 5) {
        throw new Error(`Expected 5 objects, got ${scene.objects.length}`);
    }
    if (scene.areaLights.length !== 1) {
        throw new Error(`Expected 1 area light, got ${scene.areaLights.length}`);
    }
    console.log("✓ Scene created successfully.\n");

    // 2. Test GPU Buffer Packing
    console.log("[Test 2] Packing Scene for WebGPU...");
    const packed = packSceneForWebGPU(scene);
    if (!(packed.spheres instanceof Float32Array)) {
        throw new Error("Spheres buffer is not a Float32Array");
    }
    if (packed.spheres.length !== 5 * 8) {
        throw new Error(`Expected sphere buffer length 40, got ${packed.spheres.length}`);
    }
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
    const rays = cam.getRays(240, 160, 1, 8); // center pixel
    if (rays.length !== 1 || !rays[0].v) {
        throw new Error("Failed to generate valid ray from camera");
    }
    console.log("✓ Camera generated rays successfully.\n");

    // 4. Test Ray Intersection
    console.log("[Test 4] Testing CPU Ray Intersection...");
    const hit = scene.intersect(rays[0], cam.origin);
    if (!hit || typeof hit.hit !== 'boolean') {
        throw new Error("Intersect returned invalid format");
    }
    console.log(`  Hit result: ${hit.hit}, distance: ${hit.t !== Number.MAX_VALUE ? hit.t.toFixed(2) : 'infinity'}`);
    console.log("✓ Intersection logic passed.\n");

    // 5. Test Path Tracing
    console.log("[Test 5] Testing CPU Path Tracing (1 sample)...");
    const rng = createRNG(42);
    const color = scene.pathTrace(cam.origin, rays[0].v, 8, rng);
    if (!color || typeof color.r !== 'number') {
        throw new Error("Path Trace returned invalid color format");
    }
    console.log(`  Path Trace color: R=${color.r.toFixed(2)}, G=${color.g.toFixed(2)}, B=${color.b.toFixed(2)}`);
    console.log("✓ Path tracing logic passed.\n");

    console.log("=== All Tests Passed Successfully! ===");
} catch (e) {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
}
