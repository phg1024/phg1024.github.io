import { createScene } from './sceneDef.js';
import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { Color } from './image.js';
import { createRNG } from './utils.js';

function luma(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function findGroundObject(scene) {
    var best = null;
    for (var i = 0; i < scene.objects.length; i++) {
        var obj = scene.objects[i];
        if (obj.radius !== undefined && (!best || obj.radius > best.radius)) {
            best = obj;
        }
    }
    return best;
}

function floorNormal(ground, point) {
    return Vector3.fromPoint3(ground.center, point).normalized();
}

function logSample(label, point, radiance) {
    console.log(
        '  ' + label +
        ' @ (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ', ' + point.z.toFixed(2) + ')' +
        ' -> rgb(' + radiance.r.toFixed(3) + ', ' + radiance.g.toFixed(3) + ', ' + radiance.b.toFixed(3) + ')' +
        ' luma=' + luma(radiance).toFixed(3)
    );
}

console.log('=== CPU Photon Mapping Regression ===');

var scene = createScene('current', { useBvh: true });
var ground = findGroundObject(scene);
var photonMap = scene.buildPhotonMap({
    photonCount: 96000,
    maxDepth: 8,
    globalRadius: 1.8,
    causticRadius: 0.3,
    focusedPhotonRatio: 0.7
}, createRNG(1337));

console.log('  global photons:', photonMap.global.photons.length);
console.log('  caustic photons:', photonMap.caustic.photons.length);

if (photonMap.caustic.photons.length < 100) {
    throw new Error('Expected a nontrivial caustic photon count, got ' + photonMap.caustic.photons.length);
}

var throughput = new Color(1, 1, 1, 1);
var underSphere = new Point3(1.0, 0.0, 2.0);
var nearSphere = new Point3(1.8, 0.0, 2.2);
var farAway = new Point3(-7.0, 0.0, 2.0);

var underRadiance = scene.estimatePhotonMapAtHit(
    { p: underSphere, object: ground },
    floorNormal(ground, underSphere),
    throughput,
    photonMap
);
var nearRadiance = scene.estimatePhotonMapAtHit(
    { p: nearSphere, object: ground },
    floorNormal(ground, nearSphere),
    throughput,
    photonMap
);
var farRadiance = scene.estimatePhotonMapAtHit(
    { p: farAway, object: ground },
    floorNormal(ground, farAway),
    throughput,
    photonMap
);

logSample('under sphere', underSphere, underRadiance);
logSample('near sphere', nearSphere, nearRadiance);
logSample('far away', farAway, farRadiance);

if (luma(underRadiance) <= luma(farRadiance) * 3.5 || luma(underRadiance) < 30.0) {
    throw new Error('Photon concentration under the refractive sphere is too weak.');
}

if (luma(nearRadiance) <= luma(farRadiance) * 4.0 || luma(nearRadiance) < 40.0) {
    throw new Error('Photon concentration near the refractive sphere is too weak.');
}

console.log('✓ Photon mapping concentrates energy near the refractive sphere.');
