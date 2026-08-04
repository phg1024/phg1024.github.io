import { Color } from './image.js';
import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { createRNG } from './utils.js';
import { Camera } from './raytracer.js';
import { createScene } from './sceneDef.js';

var rayTracingInfo;
var cachedSceneKey = null;
var cachedScene = null;
var cachedPhotonMapKey = null;
var cachedPhotonMap = null;
var suppliedPhotonMap = null;
self.addEventListener('message', function(e) {
    var data = e.data;
    switch (data.cmd) {
        case 'start':
            if (data.photonMap) suppliedPhotonMap = data.photonMap;
            rayTracingInfo = {
                w: data.w,
                h: data.h,
                x1: data.x1,
                x2: data.x2,
                y1: data.y1,
                y2: data.y2,
                nsamples : data.nsamples,
                maxDepth : data.maxDepth,
                tidx: data.tidx,
                pathTrace: data.pathTrace || false,
                seed: data.seed || 42,
                frameId: data.frameId || 0,
                sceneId: data.sceneId || 'current',
                useBvh: data.useBvh !== false,
                tracerMode: 'path'
            };

            run();
            break;
        default:
            self.postMessage('Unknown command: ' + data);
    };
}, false);

function run()
{
    var scene = getOrCreateScene(rayTracingInfo.sceneId, rayTracingInfo.useBvh);
    var photonMap = null;
    if (rayTracingInfo.pathTrace) {
        photonMap = suppliedPhotonMap || getOrCreatePhotonMap(scene);
    }

    // setup camera
    var cam = new Camera(
        new Point3(0, 7.0, -36.0),    // origin
        new Vector3(0, -0.1, 1),               // dir
        new Vector3(0, 1, 0),         // up,
        6.0,                          // f,
        22.5,                         // fovy
        rayTracingInfo.w,
        rayTracingInfo.h
    );

    var x1 = rayTracingInfo.x1;
    var x2 = rayTracingInfo.x2;
    var y1 = rayTracingInfo.y1;
    var y2 = rayTracingInfo.y2;

    var w = x2 - x1;
    var h = y2 - y1;

    var tile = new Float32Array(w * h * 4);

    var nsamples = rayTracingInfo.nsamples;
    var maxDepth = rayTracingInfo.maxDepth;
    var pathTraceMode = rayTracingInfo.pathTrace;
    var baseSeed = rayTracingInfo.seed || 42;
    var frameSeedOffset = rayTracingInfo.frameId * 131071;

    for(var i=y1;i<y2;i++)
    {
        for(var j=x1;j<x2;j++)
        {
            var rng = createRNG(baseSeed + frameSeedOffset + i * 1000 + j + rayTracingInfo.tidx);
            var pixel;

            if (pathTraceMode) {
                // ── Path Tracing Mode ──
                pixel = new Color(0, 0, 0, 0);
                for (var s = 0; s < nsamples; s++) {
                    var jitterX = rng() - 0.5;
                    var jitterY = rng() - 0.5;
                    var rayDir = cam.getRays(j + jitterX, i + jitterY, 1, maxDepth)[0].v;
                    var color = scene.pathTrace(cam.origin, rayDir, maxDepth, rng);
                    if (photonMap) {
                        color = color.add(scene.visibleSurfaceCausticRadiance(cam.origin, rayDir, photonMap));
                    }
                    pixel = pixel.add(color);
                }
                pixel = pixel.mul(1.0 / nsamples);
            } else {
                 // ── Traditional Ray Tracing Mode ──
                pixel = new Color(0, 0, 0, 0);
                for(var k=0;k<nsamples;k++) {
                    var jitterX = rng() - 0.5;
                    var jitterY = rng() - 0.5;
                    var rays = cam.getRays(j + jitterX,
                                           i + jitterY,
                                           1, maxDepth);
                    var hit = scene.intersect(rays[0], cam.origin);
                    pixel = pixel.add(hit.color);
                }
                pixel = pixel.mul(1.0 / nsamples);
            }

            var localX = j - x1;
            var localY = y2 - 1 - i;
            var idx = (localY * w + localX) * 4;
            tile[idx] = pixel.r;
            tile[idx + 1] = pixel.g;
            tile[idx + 2] = pixel.b;
            tile[idx + 3] = 255;
        }
    }

    self.postMessage({
        msg: 'tile',
        frameId: rayTracingInfo.frameId,
        x1: x1,
        x2: x2,
        y1: y1,
        y2: y2,
        value: tile.buffer
    }, [tile.buffer]);
}

function getOrCreateScene(sceneId, useBvh) {
    var sceneKey = sceneId + '|' + (useBvh !== false ? 'bvh' : 'flat');
    if (sceneKey !== cachedSceneKey) {
        cachedScene = createScene(sceneId, { useBvh: useBvh !== false });
        cachedSceneKey = sceneKey;
        cachedPhotonMapKey = null;
        cachedPhotonMap = null;
    }
    return cachedScene;
}

function getOrCreatePhotonMap(scene) {
    var isBunny = rayTracingInfo.sceneId === 'bunny';
    var photonOptions = {
        photonCount: isBunny ? 48000 : 96000,
        maxDepth: Math.max(rayTracingInfo.maxDepth, 8),
        globalRadius: isBunny ? 1.2 : 1.8,
        causticRadius: isBunny ? 0.5 : 0.3,
        focusedPhotonRatio: 0
    };
    var photonKey = [
        cachedSceneKey,
        photonOptions.photonCount,
        photonOptions.maxDepth,
        photonOptions.globalRadius,
        photonOptions.causticRadius,
        rayTracingInfo.seed
    ].join('|');

    if (photonKey !== cachedPhotonMapKey) {
        cachedPhotonMap = scene.buildPhotonMap(
            photonOptions,
            createRNG((rayTracingInfo.seed || 42) ^ 0x5f3759df)
        );
        cachedPhotonMapKey = photonKey;
    }

    return cachedPhotonMap;
}
