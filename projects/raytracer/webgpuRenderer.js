(function () {
    'use strict';

    var computeShaderCode = `
struct Params {
    width: u32,
    height: u32,
    samples: u32,
    maxDepth: u32,
    pathTrace: u32,
    seed: u32,
    frameSeed: u32,
    tileX: u32,
    tileY: u32,
    tileWidth: u32,
    tileHeight: u32,
    _pad: u32,
};

@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> params: Params;

struct Material {
    color: vec3<f32>,
    kd: f32,
    ks: f32,
    ior: f32,
    refractive: f32,
    _pad: f32,
};

struct Hit {
    hit: bool,
    t: f32,
    p: vec3<f32>,
    n: vec3<f32>,
    material: Material,
};

fn clamp01(v: vec3<f32>) -> vec3<f32> {
    return clamp(v, vec3<f32>(0.0), vec3<f32>(1.0));
}

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
    if (t1 > 0.0001) {
        return t1;
    }
    if (t2 > 0.0001) {
        return t2;
    }
    return -1.0;
}

fn makeMaterial(color: vec3<f32>, kd: f32, ks: f32, ior: f32, refractive: f32) -> Material {
    return Material(color, kd, ks, ior, refractive, 0.0);
}

fn intersectScene(ro: vec3<f32>, rd: vec3<f32>) -> Hit {
    var hit = Hit(false, 1.0e20, vec3<f32>(0.0), vec3<f32>(0.0, 1.0, 0.0), makeMaterial(vec3<f32>(1.0), 0.6, 0.3, 1.5, 0.0));

    let centers = array<vec3<f32>, 5>(
        vec3<f32>(1.0, 2.0, 2.0),
        vec3<f32>(-2.0, 2.0, 3.0),
        vec3<f32>(2.0, 4.0, 8.0),
        vec3<f32>(-4.0, 4.0, 6.0),
        vec3<f32>(0.0, -1000.0, 0.0)
    );
    let radii = array<f32, 5>(2.0, 1.5, 4.0, 2.0, 1000.0);
    let materials = array<Material, 5>(
        makeMaterial(vec3<f32>(48.0, 200.0, 48.0) / 255.0, 0.6, 0.3, 3.5, 1.0),
        makeMaterial(vec3<f32>(200.0, 200.0, 0.0) / 255.0, 0.6, 0.3, 1.15, 0.0),
        makeMaterial(vec3<f32>(200.0, 48.0, 48.0) / 255.0, 0.6, 0.3, 1.1, 0.0),
        makeMaterial(vec3<f32>(48.0, 48.0, 200.0) / 255.0, 0.9, 0.0, 1.5, 0.0),
        makeMaterial(vec3<f32>(128.0, 128.0, 128.0) / 255.0, 0.3, 0.1, 1.25, 0.0)
    );

    for (var i = 0u; i < 5u; i++) {
        let t = sphereIntersect(centers[i], radii[i], ro, rd);
        if (t > 0.0 && t < hit.t) {
            let p = ro + rd * t;
            hit.hit = true;
            hit.t = t;
            hit.p = p;
            hit.n = normalize(p - centers[i]);
            hit.material = materials[i];
        }
    }

    return hit;
}

fn visibleToLight(origin: vec3<f32>, dir: vec3<f32>, maxDistance: f32) -> bool {
    let h = intersectScene(origin, dir);
    return !h.hit || h.t > maxDistance - 0.0001;
}

fn reflectDir(n: vec3<f32>, v: vec3<f32>) -> vec3<f32> {
    return normalize(v - n * 2.0 * dot(v, n));
}

fn refractDir(n: vec3<f32>, v: vec3<f32>, ior: f32) -> vec3<f32> {
    let entering = dot(v, n) < 0.0;
    let eta = select(ior, 1.0 / ior, entering);
    let normal = select(-n, n, entering);
    let cosTheta = -dot(v, normal);
    let k = 1.0 - eta * eta * (1.0 - cosTheta * cosTheta);
    if (k < 0.0) {
        return reflectDir(normal, v);
    }
    return normalize(v * eta - normal * (eta * cosTheta + sqrt(k)));
}

fn fresnel(cosTheta: f32, ior: f32) -> f32 {
    var r0 = (1.0 - ior) / (1.0 + ior);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
}

fn sampleDiffuse(n: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    var tangent = vec3<f32>(1.0, 0.0, 0.0);
    if (abs(dot(n, tangent)) > 0.9) {
        tangent = vec3<f32>(0.0, 1.0, 0.0);
    }
    tangent = normalize(cross(n, tangent));
    let bitangent = normalize(cross(n, tangent));
    let r1 = 6.28318530718 * rand(state);
    let r2 = rand(state);
    let r2s = sqrt(r2);
    let local = vec3<f32>(cos(r1) * r2s, sin(r1) * r2s, sqrt(max(0.0, 1.0 - r2)));
    return normalize(local.x * tangent + local.y * bitangent + local.z * n);
}

fn offsetOrigin(p: vec3<f32>, n: vec3<f32>, dir: vec3<f32>) -> vec3<f32> {
    let sign = select(-1.0, 1.0, dot(dir, n) >= 0.0);
    return p + n * sign * 0.0001;
}

fn sampleAreaLight(p: vec3<f32>, n: vec3<f32>, albedo: vec3<f32>, throughput: vec3<f32>, kd: f32, state: ptr<function, u32>) -> vec3<f32> {
    let center = vec3<f32>(-6.0, 14.0, -8.0);
    let u = vec3<f32>(10.0, 0.0, 0.0);
    let v = vec3<f32>(0.0, 0.0, 10.0);
    let lightNormal = normalize(cross(u, v));
    let area = length(cross(u, v));
    let lightPoint = center + u * (rand(state) - 0.5) + v * (rand(state) - 0.5);
    let toLight = lightPoint - p;
    let dist2 = dot(toLight, toLight);
    let dist = sqrt(dist2);
    let l = toLight / dist;
    let surfaceCos = max(0.0, dot(n, l));
    let lightCos = max(0.0, dot(-lightNormal, l));
    if (surfaceCos <= 0.0 || lightCos <= 0.0) {
        return vec3<f32>(0.0);
    }
    if (!visibleToLight(offsetOrigin(p, n, l), l, dist)) {
        return vec3<f32>(0.0);
    }
    let intensity = 3.0;
    let factor = kd * intensity * area * surfaceCos * lightCos / max(dist2, 0.000001);
    return throughput * albedo * factor;
}

fn sampleAreaLightPhong(p: vec3<f32>, n: vec3<f32>, viewDir: vec3<f32>, mat: Material, state: ptr<function, u32>) -> vec3<f32> {
    let center = vec3<f32>(-6.0, 14.0, -8.0);
    let u = vec3<f32>(10.0, 0.0, 0.0);
    let v = vec3<f32>(0.0, 0.0, 10.0);
    let lightNormal = normalize(cross(u, v));
    let area = length(cross(u, v));
    var shade = vec3<f32>(0.0);
    let sampleCount = 8u;

    for (var sample = 0u; sample < sampleCount; sample++) {
        let lightPoint = center + u * (rand(state) - 0.5) + v * (rand(state) - 0.5);
        let toLight = lightPoint - p;
        let dist2 = dot(toLight, toLight);
        let dist = sqrt(dist2);
        let l = toLight / dist;
        let surfaceCos = max(0.0, dot(n, l));
        let lightCos = max(0.0, dot(-lightNormal, l));

        if (surfaceCos > 0.0 && lightCos > 0.0 && visibleToLight(offsetOrigin(p, n, l), l, dist)) {
            let areaFactor = 3.0 * area * lightCos / max(dist2, 0.000001);
            let r = normalize(n * (2.0 * surfaceCos) - l);
            let spec = pow(max(0.0, dot(r, viewDir)), 40.0);
            shade += vec3<f32>(areaFactor * (surfaceCos * mat.kd + spec * mat.ks));
        }
    }

    return max(mat.color + shade / f32(sampleCount), vec3<f32>(0.0));
}

fn pathTrace(ro0: vec3<f32>, rd0: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
    var ro = ro0;
    var rd = rd0;
    var throughput = vec3<f32>(1.0);
    var radiance = vec3<f32>(0.0);
    let bg = vec3<f32>(200.0 / 255.0);
    var lastColor = vec3<f32>(1.0);

    for (var depth = 0u; depth < params.maxDepth; depth++) {
        let h = intersectScene(ro, rd);
        if (!h.hit) {
            return radiance + throughput * bg;
        }
        let mat = h.material;
        lastColor = mat.color;

        if (mat.refractive > 0.5) {
            let entering = dot(h.n, rd) < 0.0;
            let eta = select(mat.ior, 1.0 / mat.ior, entering);
            let n = select(-h.n, h.n, entering);
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
                    throughput *= mat.color;
                }
            }
        } else {
            radiance += sampleAreaLight(h.p, h.n, mat.color, throughput, mat.kd, state);
            let total = mat.kd + mat.ks;
            if (total <= 0.0) {
                return radiance + throughput * bg;
            }
            let diffuseProbability = mat.kd / total;
            if (rand(state) < diffuseProbability) {
                rd = sampleDiffuse(h.n, state);
                ro = offsetOrigin(h.p, h.n, rd);
                throughput *= mat.color * (mat.kd / max(diffuseProbability, 0.0001));
            } else {
                let specularProbability = 1.0 - diffuseProbability;
                rd = reflectDir(h.n, rd);
                ro = offsetOrigin(h.p, h.n, rd);
                throughput *= mat.ks / max(specularProbability, 0.0001);
            }
        }
    }

    return radiance + throughput * lastColor;
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
        let localColor = sampleAreaLightPhong(h.p, h.n, viewDir, mat, state);
        let reflectivity = select(mat.ks, 0.7, mat.refractive > 0.5);
        color += weight * localColor * (1.0 - reflectivity);
        weight *= reflectivity;

        if (max(max(weight.r, weight.g), weight.b) < 0.001) {
            return max(color, vec3<f32>(0.0));
        }

        if (mat.refractive > 0.5) {
            rd = refractDir(h.n, rd, mat.ior);
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
    let scale = 6.0 * tan(22.5 / 180.0 * 3.14159265359);
    let aspect = f32(params.width) / f32(params.height);
    let dx = (pixel.x / f32(params.width) - 0.5) * scale;
    let dy = (pixel.y / f32(params.height) - 0.5) * scale;
    let p = center + right * dx * aspect + up * dy;
    return normalize(p - origin);
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
    textureStore(outputTexture, vec2<i32>(i32(pixelX), i32(flippedY)), vec4<f32>(max(color, vec3<f32>(0.0)), 1.0));
}
`;

    var presentShaderCode = `
struct Params {
    width: u32,
    height: u32,
    samples: u32,
    maxDepth: u32,
    pathTrace: u32,
    seed: u32,
    frameSeed: u32,
    tileX: u32,
    tileY: u32,
    tileWidth: u32,
    tileHeight: u32,
    _pad: u32,
};

@group(0) @binding(0) var renderTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn hash(value: u32) -> u32 {
    var x = value;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

fn dither(coord: vec2<u32>) -> vec3<f32> {
    let base = hash((coord.x * 1973u) ^ (coord.y * 9277u) ^ params.frameSeed);
    return vec3<f32>(
        f32(hash(base + 1u) & 255u) / 255.0 - 0.5,
        f32(hash(base + 2u) & 255u) / 255.0 - 0.5,
        f32(hash(base + 3u) & 255u) / 255.0 - 0.5
    ) / 255.0;
}

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
    let color = textureLoad(renderTexture, coord, 0).rgb + dither(vec2<u32>(coord));
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

    async function renderWebGPU(options) {
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

        var renderTexture = device.createTexture({
            size: { width: width, height: height },
            format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
        });
        var uniformBuffer = device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        var renderTextureView = renderTexture.createView();
        var computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: renderTextureView },
                { binding: 1, resource: { buffer: uniformBuffer } }
            ]
        });
        var presentBindGroup = device.createBindGroup({
            layout: presentPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: renderTextureView },
                { binding: 1, resource: { buffer: uniformBuffer } }
            ]
        });

        var tasks = options.tasks || [{ x1: 0, x2: width, y1: 0, y2: height }];
        var frameSeed = (Math.random() * 0xffffffff) >>> 0;
        var clearEncoder = device.createCommandEncoder();
        var clearPass = clearEncoder.beginRenderPass({
            colorAttachments: [{
                view: renderTextureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        clearPass.end();
        device.queue.submit([clearEncoder.finish()]);

        for (var taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
            var task = tasks[taskIndex];
            var tileWidth = task.x2 - task.x1;
            var tileHeight = task.y2 - task.y1;
            var params = new Uint32Array([
                width,
                height,
                options.samples,
                options.maxDepth,
                options.pathTrace ? 1 : 0,
                options.seed >>> 0,
                frameSeed,
                task.x1,
                task.y1,
                tileWidth,
                tileHeight,
                0
            ]);
            device.queue.writeBuffer(uniformBuffer, 0, params);

            var encoder = device.createCommandEncoder();
            var computePass = encoder.beginComputePass();
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, computeBindGroup);
            computePass.dispatchWorkgroups(Math.ceil(tileWidth / 8), Math.ceil(tileHeight / 8));
            computePass.end();

            var renderPass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }]
            });
            renderPass.setPipeline(presentPipeline);
            renderPass.setBindGroup(0, presentBindGroup);
            renderPass.draw(3);
            renderPass.end();

            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();

            if (typeof options.onProgress === 'function') {
                options.onProgress(taskIndex + 1, tasks.length);
            }
        }
    }

    window.renderWebGPU = renderWebGPU;
})();
