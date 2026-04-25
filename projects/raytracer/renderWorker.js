import { RGBAImage, Color } from './image.js';
import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { createRNG } from './utils.js';
import { Camera } from './raytracer.js';
import { createDefaultScene } from './sceneDef.js';

var rayTracingInfo;
self.addEventListener('message', function(e) {
    var data = e.data;
    switch (data.cmd) {
        case 'start':
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
                seed: data.seed || 42
            };

            run();

            self.postMessage({msg:'done'});
            break;
        default:
            self.postMessage('Unknown command: ' + data);
    };
}, false);

function run()
{
    // load scene from centralized definition
    var scene = createDefaultScene();

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

    var img = new RGBAImage(w, h);

    var nsamples = rayTracingInfo.nsamples;
    var maxDepth = rayTracingInfo.maxDepth;
    var pathTraceMode = rayTracingInfo.pathTrace;
    var baseSeed = rayTracingInfo.seed || 42;
    var progress = 0;
    var progressStep = 1.0 / h;

    for(var i=y1;i<y2;i++)
    {
        for(var j=x1;j<x2;j++)
        {
            var rng = createRNG(baseSeed + i * 1000 + j + rayTracingInfo.tidx);
            var pixel;

            if (pathTraceMode) {
                // ── Path Tracing Mode ──
                pixel = new Color(0, 0, 0, 0);
                for (var s = 0; s < nsamples; s++) {
                    var jitterX = rng() - 0.5;
                    var jitterY = rng() - 0.5;
                    var rayDir = cam.getRays(j + jitterX, i + jitterY, 1, maxDepth)[0].v;
                    var color = scene.pathTrace(cam.origin, rayDir, maxDepth, rng);
                    pixel = pixel.add(color);
                }
                img.setPixel(j-x1, y2-1-i, pixel.mul(1.0 / nsamples));
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
                img.setPixel(j-x1, y2-1-i, pixel.mul(1.0 / nsamples));
            }
         }
        progress += progressStep;
    }

    // post the image data to the main thread
    self.postMessage({msg:'image', x1:x1, x2:x2, y1: y1, y2: y2, value:img.data.buffer}, [img.data.buffer]);
}
