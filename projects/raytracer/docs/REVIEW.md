# Ray Tracer Code Review

Review of the CPU + WebGPU ray tracer under `src/projects/raytracer/`.
Findings are grouped by severity, each with file:line references and a
concrete fix. The dependency-aware implementation order is in
[PLAN.md](./PLAN.md).

> **Status (2026-08-04):** C1-C9 and C11 are fixed for the supported forward
> path tracer. C10 is resolved by explicitly defining area lights as off-screen
> sampling primitives. The invalid BDPT mode in C3 has been retired from the UI
> and backend dispatch rather than presented as fixed. P2, P3, P6, and the
> zero-reflectivity portion of P7 are fixed; P4's traversal stack allocation is
> fixed while leaf-result allocation remains. P1 and P5 are intentionally
> deferred pending profiles. Unreachable BDPT, legacy photon-trace, and old
> JavaScript caustic helpers remain cleanup work. Historical snippets and line
> numbers below describe the pre-fix audit; see [IMPL_NOTES.md](./IMPL_NOTES.md)
> for the current contracts and [PLAN.md](./PLAN.md) for remaining work.

---

## Correctness — high impact

### C1. Direct lighting missing the Lambertian `1/π` factor (~3.14× too bright)

`estimateAreaLighting` computes the direct-illumination factor without the
Lambertian `/π`:

```js
// raytracer.js:401
var factor = Kd * light.intensity * light.area * surfaceCos * lightCos
           / Math.max(distanceSquared, 1e-6);
```

The correct rendering-equation term is `(Kd/π) · L · A · cosθ_s · cosθ_l / r²`.
The photon-map path right next to it *does* include it
(`brdfScale = Kd / Math.PI`, raytracer.js:1214, 1235), so direct and indirect
estimates are **inconsistent by a factor of π** — direct light will be washed
out relative to indirect.

The same omission exists in the WGSL `evaluateAreaLight`
(`webgpuRenderer.js:428-434`, `factor = light.intensity * area * lightCos /
max(dist2, ...)`).

**Fix:** apply `1/Math.PI` to the CPU path-tracing diffuse term. In WGSL,
apply `1/π` only to the Lambertian diffuse contribution; do not divide the
shared factor because `evaluateAreaLight` also serves the legacy specular
shader. If the legacy renderer is to become physically normalized, update its
CPU and GPU implementations together.

---

### C2. Photon tracer double-applies absorption Russian roulette

In `tracePhoton`:

```js
// raytracer.js:1131
if (rng() > total) { return; }        // absorption RR, survival prob = total (= Kd+Ks)
...
throughput = scaleThroughput(
    attenuateColor(throughput, surfaceColor),
    surfaceKd / Math.max(diffuseProbability, 1e-4)   // == total  (lobe-selection comp)
);
```

The lobe-selection scale `surfaceKd / diffuseProbability` already equals
`total` (the diffuse-probability compensation), which is correct **only when
the ray always scatters**. Layering the absorption RR on top double-applies:
expected throughput becomes `total · (Kd·albedo + Ks)` instead of
`(Kd·albedo + Ks)`. `Scene.pathTrace` does **not** have this bug (it omits the
absorption RR).

The continuation energy after a diffuse/specular bounce is too dark by the
survival probability. Photons are stored before this roulette test, so the
first caustic deposit is not attenuated by this bug; the main impact is on
later global/indirect deposits. Relevant continuation probabilities include:
- red bunny: `Kd+Ks = 0.55`
- subsurface bunny: `~0.496`
- ground: `0.4`

**Fix:** drop the `if (rng() > total) return;` line (matching `pathTrace`), or
compensate with an extra `1/total` scale on survival. Test continuation energy
separately from first-hit caustic energy.

### C2b. Focused photon emission is not PDF-compensated

`buildPhotonMap` mixes cosine-weighted emission with rays aimed at sampled
points on refractive objects. Both branches receive the same photon power even
though their directional PDFs differ. The focused branch is therefore a biased
visual heuristic, not an importance-sampled unbiased estimator.

**Fix:** either remove focused emission, explicitly document it as biased, or
derive the target-to-solid-angle PDF and weight the full mixture correctly.

### C2c. Combined photon estimate double-counts caustic photons

`tracePhoton` stores every diffuse deposit in `globalPhotons` and additionally
stores specular-path deposits in `causticPhotons`. `estimatePhotonMapLighting`
then adds the global and caustic gathers, so caustic photons are counted twice
through that helper. Production currently calls the caustic-only helper, making
this latent outside tests and unused `photonMapTrace` paths.

**Fix:** make global and caustic maps mutually exclusive, or gather only one
map for any transport class. Add a test that a caustic deposit contributes once
when estimates are combined.

### C2d. Photon gathering applies an extra incident-cosine factor

Photon power is initialized as flux per emitted photon. The surface density of
photon hits already carries the projected-area cosine. `gatherPhotonIrradiance`
multiplies each stored power by `max(0, -normal·photon.direction)` again, which
suppresses grazing-energy deposits twice.

**Fix:** use the direction only to reject photons arriving from the wrong side,
then sum photon power over the kernel area without another cosine. Verify the
estimate on a diffuse plane under a known emitter.

---

### C3. BDPT connection logic is inverted and has no MIS

```js
// raytracer.js:638
if (lightVertex.deltaType !== 'refractive') continue;   // only connects to refractive/delta light verts!
```

This skips **diffuse** light vertices — exactly the ones BDPT should connect
to — and only connects through refractive (delta) light-path vertices, which is
physically wrong (delta surfaces aren't directly connectable in standard BDPT).
`connectPathVertices` then routes those through `connectViaRefractiveVertex`.

The light subpath also emits along `-light.normal`, while photon mapping and
direct lighting treat `light.normal` as the emitting side. For the current
scenes this points the BDPT light path upward, away from the geometry. The same
filter and emission-direction bugs exist in WGSL.

Additionally there are **no MIS (multiple importance sampling) weights**, the
vertices do not retain forward/reverse PDFs, and the connection term is missing
complete BRDF and light-selection normalization. The current routine is not a
complete BDPT estimator.

**Fix:**
1. Establish the same emitting-normal convention in CPU, WGSL, direct lighting,
   and photon emission.
2. Record per-vertex BSDF type and forward/reverse area-measure PDFs.
3. Evaluate valid non-delta connections with correct geometry and BRDF terms.
4. Add MIS weights over supported `(s,t)` strategies.
5. Implement CPU and WebGPU together; do not ship a filter-only change.

---

### C4. `Point3()` default constructor leaves `z` undefined

```js
// point.js:29
if ( arguments.length != 3 ){ this.x = this.y = 0; }   // z never set
```

`new Point3()` → `{x:0, y:0, z:undefined}`, and `Vector3.fromPoint3` then
produces `NaN`. Returned in non-hit branches
(`{hit:false, p:new Point3(), …}`) so mostly latent, but any future code
touching `p` on a miss gets `NaN`.

**Fix:** set `this.x = this.y = this.z = 0;` in the `Point3` default
constructor. `Point2` correctly has no `z` component.

---

### C5. Old recursive tracer: `refract()` returns a zero vector on TIR

```js
// utils.js:42
if (k < 0.0) return new Vector3(0, 0, 0);   // not null
```

`Sphere.intersect`/`TriangleMesh.intersect` (shape.js) assign
`rv = refract(...)` into `newRay.v` without checking, so a TIR hit spawns a
recursive ray with a zero direction. Sphere intersection hard-codes the
quadratic coefficient `a = 1`, so this commonly turns into an incorrect miss
and background contribution rather than the `quadraticSolve(0,0,c)` failure
mode. It is live in the CPU non-path-tracing mode (`renderWorker.js:110`).

**Fix:** return `null` on TIR and fall back to `reflect`, or handle TIR
explicitly as `pathTrace` does.

---

## Correctness — moderate

### C6. Intersection normals do not preserve front-face information

```js
// raytracer.js:442
normal: obj.center ? Vector3.fromPoint3(obj.center, hitPos).normalized()
                   : new Vector3(0, 1, 0),
```

The mesh path flips normals to face the incoming ray, while the sphere path
keeps its outward normal. Refraction then infers entry/exit from
`normal.dot(rayDir)`. Mesh exit hits therefore appear to be entering hits. If
the sphere normal were also face-forwarded, sphere refraction would acquire the
same bug. WGSL has the same mesh/sphere inconsistency.

**Fix:** return an outward/geometric normal, a face-forward shading normal, and
an explicit `frontFace` flag. Use `frontFace` for IOR selection, the shading
normal for hemisphere sampling, and a documented normal for ray offsets. Apply
the contract consistently in CPU and WGSL before changing Fresnel behavior.

---

### C7. `Camera.getRays` silently drops samples for non-square `n`

```js
// raytracer.js:97
var nx = Math.floor(Math.sqrt(n)), ny = nx;     // n=8 → only 4 rays
```

Returns `floor(√n)²` rays, so `getRays(x,y,8,…)` yields 4 samples, not 8.
Latent in production (workers pass `n=1`), but `pathTracePixel` and any
supersampling caller would be affected.

**Fix:** loop exactly `n` times over a near-square grid, stopping when the
linear sample index reaches `n`. Merely rounding `n / nx` can overproduce
samples for values such as `n = 5`.

---

### C8. Dielectric Fresnel/interface handling is inconsistent

`fresnelSchiek` is applied without a reliable front-face/interface contract.
Mesh normals have already been face-forwarded, so dense-to-air exits can use
the wrong IOR ratio before the cosine approximation is considered.

(Also: the name is a typo for "Schlick" — cosmetic, used consistently.)

**Fix:** first complete C6. Then use a shared exact dielectric Fresnel helper or
a clearly documented Schlick variant, with TIR tested before probabilistic
branch selection. Mirror the implementation in WGSL.

---

### C9. Caustics added from a single center ray, not integrated with jitter

```js
// renderWorker.js:98-99
var centerRayDir = cam.getRays(j + 0.5, i + 0.5, 1, maxDepth)[0].v;
pixel = pixel.add(scene.visibleSurfaceCausticRadiance(cam.origin, centerRayDir, photonMap));
```

The jittered CPU path samples do **not** include the photon-map caustic term;
instead one deterministic center-ray caustic is added per pixel. WebGPU has the
same behavior through `buildWorldSpaceCausticTexture`, which constructs a
CPU-side center-ray texture and adds it during presentation. Caustics therefore
do not anti-alias with the accumulating samples and can be misaligned at edges.

**Fix:** choose one estimator contract and implement it in both backends. The
smallest correction is to gather the visible-surface caustic with each jittered
camera sample. If gathering at later path vertices, define how double counting
with BSDF-sampled transport is prevented.

---

### C10. Area lights are not geometric

`scene.areaLights` are sampled for shading but never added to `scene.objects`,
so rays pass straight through them — looking directly at a light shows the
background.

**Fix:** either add emissive light geometry or add explicit area-light
intersection. Include scene packing and WGSL, not only the CPU intersection
path. It is also acceptable to document the lights as off-screen-only.

### C11. Material lobe weights can exceed unit energy

The forward tracer samples diffuse, mirror, and subsurface lobes in proportion
to their weights, but preserves their unnormalized sum in throughput. The blue
bunny uses `Kd * (1 - subsurface) + Ks + subsurface ≈ 1.246`, so its expected
bounce throughput can increase.

**Fix:** define whether these fields are physical energy weights or artistic
controls. For the reference integrators, validate or normalize the lobe sum to
at most one and test that a white environment cannot gain energy after a
non-emissive bounce.

---

## Performance

### P1. `Vector3`/`Point3`/`Color` allocate on every operation

Every `.add/.sub/.mul/.cross/.normalized()` returns a brand-new object. In
`intersectTriangleRange`, `sampleDiffuseDirection`, `pathTrace`, etc., this is
hundreds of allocations per ray-segment. These allocations are a plausible
major CPU cost.
This has not yet been established as the dominant cost by profiling.

**Fix:** switch to flat `Float32Array` (or plain `{x,y,z}` with in-place
scratch math) and SoA layouts for mesh data. This is invasive; stage it behind
the existing API where possible.

---

### P2. Every worker builds its own identical photon map

```js
// renderWorker.js:47, 167
photonMap = getOrCreatePhotonMap(scene);   // each of N workers builds 96k-photon map
...
cachedPhotonMap = scene.buildPhotonMap(
    photonOptions, createRNG((rayTracingInfo.seed || 42) ^ 0x5f3759df));
```

All workers use the same seed → identical maps. With 8 workers you pay 8× the
photon-tracing cost at startup.

**Fix:** build once and serialize positions/normals/directions/powers as typed
arrays. Choose explicitly between structured-clone copies, one cloned
transferable per worker, or `SharedArrayBuffer` with the required isolation
headers; the same `ArrayBuffer` cannot be transferred to multiple workers.

---

### P3. Shadow rays do a full closest-hit traversal

`isPathToLightClear` → `obj.intersectT` → `intersectDetail` finds the
*closest* intersection and then compares to `maxDistance`. For occluded
shadow rays you traverse the whole BVH even after the first blocker. This fires
at every path vertex × every light.

**Fix:** add an any-hit `shadowIntersect(p, dir, maxT)` that returns `true` on
the first `t ∈ (ε, maxT)` and aborts early. Provide it on `Sphere` and
`TriangleMesh` (BVH-aware).

---

### P4. `intersectDetail` allocates per ray and per leaf

`var stack = [0]` per BVH traversal and `intersectTriangleRange` returns a
fresh `{bestT, bestNormal}` object per leaf visited.

**Fix:** use a preallocated `Int32Array` stack (thread-local / module-level)
and have the leaf routine mutate `bestT`/`bestNormal` in place (or return a
scalar `t` and recompute the normal once at the end).

---

### P5. `buildPhotonLookup` uses string grid keys

`photonCellKey(ix,iy,iz)` → `ix + '|' + iy + '|' + iz` (raytracer.js) allocates
~96k strings and does string-hash lookups during every
`gatherPhotonIrradiance` (3³ neighbor cells × N photons).

**Fix:** replace with a numeric hash into a flat `Int32Array` bucket structure
(or a `Map<number, number[]>` with a packed 32-bit key).

---

### P6. `sampleDiffuseDirection` rebuilds an orthonormal basis every bounce

Two crosses + two normalizations per diffuse sample.

**Fix:** use a stable branchless basis (for example Frisvad's method). Cache
bases only where normals are constant; curved and smooth-shaded objects require
per-hit bases.

---

### P7. Old recursive tracer recurses on every hit (incl. diffuse)

`Scene.intersect` (raytracer.js:65) spawns `hit.newRay` for *every* surface,
including diffuse ones that shouldn't trace a reflection ray, and `shading`
fires 32 shadow rays × `numObjects` per light (raytracer.js). Live in
non-path-tracing mode (`renderWorker.js:110`).

**Fix:** restrict reflection rays to specular/reflective materials, and cut
the shadow-ray count for the legacy mode (or deprecate it in favor of
`pathTrace`).

---

## Dead / buggy dead code

- **`cosineHemisphere` / `hemisphereSample`** (`utils.js:139, 164`) reconstruct
  the result as `N.x + x*A.x + y*B.x + z*N.x` (the leading `N.` term is
  spurious, biasing the distribution toward N). No callers — delete or fix.
- **`russianRoulette`** (`utils.js:189`) is exported but never used.
- **`Scene.photonMapTrace`** (`raytracer.js:1332`) is defined but not called by
  `renderWorker` (which uses `pathTrace` + the additive caustic). Either wire
  it up or remove it.

---

# Implementation Plan

The audited, dependency-aware plan and its verification gates live in
**[PLAN.md](./PLAN.md)**. Tasks in that plan are intentionally not all
independently shippable: normal/interface handling, photon estimator changes,
and BDPT each have correctness dependencies that must land together.
