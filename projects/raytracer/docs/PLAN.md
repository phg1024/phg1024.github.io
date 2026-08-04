# Ray Tracer Remediation Plan

Implementation status after the 2026-08-04 review. The correctness work needed
for the supported forward path tracer is complete; remaining work is isolated
below instead of being mixed with resolved findings.

## Completed in this pass

- Added root-level Node and live-browser test commands and repaired stale scene
  packing expectations.
- Made browser tests target the configured local server and declared Puppeteer
  as a development dependency.
- Fixed `Point3()` defaults and made `Camera.getRays` return exactly the
  requested number of finite, normalized rays.
- Added outward geometric normals, face-forward shading normals, and explicit
  front-face state for CPU and WGSL sphere/mesh hits.
- Unified IOR selection, exact dielectric Fresnel, total-internal-reflection
  fallback, and ray-origin offsets across supported backends.
- Applied the Lambertian `Kd / pi` factor to physical direct lighting and
  normalized diffuse/specular/subsurface lobe weights to at most one.
- Removed duplicate photon survival weighting, partitioned global/caustic
  deposits, removed the extra gather cosine, and disabled biased focused
  emission in production settings.
- Integrated CPU caustics per jittered sample and changed the WebGPU cache from
  one center ray to four jittered camera samples.
- Built the CPU photon map once per render and distributed cloneable data-only
  records to workers.
- Removed the unused WebGPU receiver prepass and no-op caustic compute pass.
- Retired the incomplete BDPT option from the UI and forced both backends onto
  the supported forward path implementation.
- Added early-exit, distance-bounded shadow traversal on CPU and WGSL, reused
  CPU BVH stacks, adopted a stable basis construction, and skipped legacy
  recursion for zero-reflectivity surfaces.
- Removed unused/broken hemisphere samplers and unused roulette utility.
- Documented rectangular area lights as off-screen sampling primitives.

## Verification gate

The change is ready when all of these pass from the repository root:

```bash
npm test
npm run test:raytracer:browser
npm run build
```

Manual acceptance should also confirm that changing scene, backend, BVH state,
sample count, and depth restarts accumulation and updates the status label.

## Follow-up 1 — GPU caustic parity

The supported WebGPU path currently uploads a CPU-evaluated four-jitter
first-visible-surface caustic cache. It fixes the former center-ray aliasing and
uses the corrected photon estimator, but it does not accumulate a new caustic
camera sample with every GPU frame.

1. Pack photon positions, normals, incoming directions, powers, and lookup
   ranges into GPU-readable buffers.
2. Gather at the first visible non-delta WGSL path vertex for each camera
   sample.
3. Remove the uploaded caustic texture and CPU cache builder.
4. Compare CPU/WebGPU fixed-seed means and edge convergence.

Exit gate: both backends use the same per-camera-sample estimator and converge
within a documented Monte Carlo tolerance.

## Follow-up 2 — Dead estimator removal

The old CPU/WGSL BDPT helpers and `Scene.photonMapTrace` are unreachable but
still make the renderer harder to audit.

1. Remove unreachable BDPT structs, connection helpers, and shader functions.
2. Remove `Scene.photonMapTrace` and the obsolete standalone screen-splat
   caustic helpers.
3. Remove now-unused `tracerMode` plumbing and replace the one-option selector
   with a static label.
4. Re-run shader creation tests after each WGSL deletion.

Reviving BDPT is a separate project: it requires light/BSDF PDFs in consistent
measures, valid non-delta connection strategies, and multiple-importance
sampling. The old filter must not be exposed as BDPT again.

## Follow-up 3 — Profile-guided CPU optimization

1. Record wall-clock baselines for both scenes, separating map construction
   from rendering.
2. Measure allocation and photon-grid lookup costs.
3. If justified, mutate leaf-hit state instead of allocating result objects.
4. Replace string photon-cell keys with a collision-safe numeric bucket layout.
5. Consider flat/SoA vectors and mesh data only if profiles show that temporary
   math objects dominate.

Every performance patch must preserve the deterministic Node suite and live
browser regressions and include before/after timings with scene, resolution,
samples, depth, worker count, seed, and photon settings.

## Follow-up 4 — Legacy renderer decision

Choose one explicit direction:

- keep it as an empirical preview and document acceptable CPU/WGSL visual
  differences; or
- remove it and simplify the application around forward path tracing.

Do not partially normalize only one backend. If emissive area-light geometry
is desired later, add intersection and packing support on CPU and WGSL together;
current area lights are intentionally off-screen-only.
