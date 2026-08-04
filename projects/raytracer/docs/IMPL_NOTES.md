# Ray Tracer Implementation Notes

Current implementation contract for the browser ray tracer. Last verified:
2026-08-04.

## Supported renderers

- **Legacy ray tracing**: recursive on CPU and iterative on WebGPU. It is an
  empirical Phong-style preview, not the physical reference renderer.
- **Forward path tracing**: the supported reference mode on CPU and WebGPU.
- **Photon caustics**: a photon-density estimate added at the first visible
  non-delta receiver. Global photons are built for diagnostics but are not
  added to production renders.
- **BDPT**: retired from the UI. The old experimental helpers remain internal
  until they can be replaced by an estimator with complete PDF and MIS state;
  neither backend dispatches them.

CPU rendering uses Web Workers. WebGPU uses a compute shader and ping-pong
accumulation textures. Both use the same scene definitions and material
parameters.

## File map

| File | Responsibility |
| --- | --- |
| `raytracer.js` | Camera, scene traversal, path transport, direct lighting, photon build/gather |
| `shape.js` | Sphere/triangle intersections, CPU BVH and any-hit shadow traversal |
| `sceneDef.js` | Scene construction and WebGPU packing |
| `renderWorker.js` | CPU tile rendering and per-sample caustic gathering |
| `webgpuRenderer.js` | WGSL transport, GPU traversal, accumulation, CPU-built caustic cache upload |
| `main.js` | UI, worker pool, Hilbert tile scheduling, one-time photon-map distribution |
| `point.js`, `vector.js`, `image.js`, `utils.js` | Math and image primitives |

## Hit and dielectric contract

Every sphere and mesh hit preserves three distinct values:

- `geometricNormal`: outward orientation from the primitive;
- `normal` / WGSL `n`: face-forward shading normal;
- `frontFace`: whether the incoming ray hit the outside surface.

BSDF sampling and ray offsets use the face-forward normal. Refraction chooses
the air/material IOR ratio from `frontFace`. CPU and WGSL use exact unpolarized
dielectric Fresnel, test total internal reflection first, and reflect on TIR.
Recursive and path rays are offset from the hit surface.

## Forward path tracing

At each non-delta hit the renderer:

1. Samples each rectangular area light and tests visibility with an any-hit
   shadow query bounded by the light distance.
2. Evaluates Lambertian direct radiance with `Kd / pi`.
3. Selects diffuse, mirror, or subsurface transport from normalized material
   lobe weights. If their authored sum exceeds one, all lobes are scaled so a
   non-emissive bounce cannot increase expected energy.
4. Samples diffuse transport with a cosine-weighted hemisphere and a stable
   orthonormal basis.

Rectangular area lights are sampling primitives rather than scene geometry.
They are intentionally off-screen-only: camera and bounce rays do not hit an
emissive rectangle.

## Photon mapping

Reference photon options use `focusedPhotonRatio: 0`. The old targeted emitter
is retained only as an explicit biased experiment because it has no mixture-PDF
compensation.

Photon tracing now follows these rules:

- a diffuse deposit goes to either the caustic map (after a delta/specular
  chain) or the global map, never both;
- lobe selection supplies the continuation weighting; there is no second
  absorption roulette factor;
- gathering rejects photons from the wrong hemisphere but does not multiply
  their power by a second incident cosine;
- lookup uses a 3D string-keyed grid and a fixed-radius kernel.

The main thread builds one photon map for a CPU render and structured-clones it
once to each worker. Photon records contain data only, so they are cloneable.
Each jittered CPU camera sample gathers its own first-visible-surface caustic.

WebGPU builds the same photon map once on the CPU, evaluates a four-jitter
first-visible-surface caustic cache, uploads it as a texture, and adds it during
presentation. This avoids the former center-ray edge aliasing, but it remains a
fixed four-sample cache rather than accumulating one new caustic camera sample
per GPU frame.

## BVH and shadows

Triangle meshes use a median-split BVH with leaves of at most eight triangles.
Closest-hit traversal reuses a mesh-owned `Int32Array` stack. Shadow queries
use separate CPU/WGSL any-hit traversal and return as soon as a blocker with
`t < maxDistance` is found. WGSL stacks are fixed at 64 entries.

## Verification

From the repository root:

```bash
npm test
npm run test:raytracer:browser
npm run build
```

The Node suite checks scene packing, exact camera sample counts, finite point
and dielectric behavior, Lambertian normalization, refractive response, and
photon concentration. The browser suite exercises live CPU/WebGPU rendering,
both scenes, BVH on/off, and caustic placement.

## Remaining limitations

- The legacy Phong backends are visually similar but not physically identical.
- WebGPU caustics use the fixed four-sample CPU cache described above.
- Photon lookup still allocates string cell keys; replace it only with measured
  evidence and an explicit collision/range design.
- The CPU vector API still allocates temporary objects heavily.
- Old internal BDPT and `Scene.photonMapTrace` helpers should be removed in a
  dedicated dead-code pass, or replaced together with tests if those modes are
  revived.
