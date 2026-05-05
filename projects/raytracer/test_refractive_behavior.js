import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { createScene } from './sceneDef.js';
import { createRNG } from './utils.js';
import { Camera } from './raytracer.js';

function cloneColor(color) {
    return { r: color.r, g: color.g, b: color.b };
}

function cloneMaterial(material) {
    return Object.assign({}, material);
}

function luminance(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function averageSamples(scene, cam, pixelX, pixelY, sampleCount, maxDepth, baseSeed) {
    var total = { r: 0, g: 0, b: 0 };
    for (var i = 0; i < sampleCount; i++) {
        var rng = createRNG(baseSeed + i * 17);
        var color = scene.pathTracePixel(cam, pixelX, pixelY, maxDepth, rng);
        total.r += color.r;
        total.g += color.g;
        total.b += color.b;
    }
    return {
        r: total.r / sampleCount,
        g: total.g / sampleCount,
        b: total.b / sampleCount
    };
}

function makeCurrentSceneWithIor(ior) {
    var scene = createScene('current');
    scene.objects[0].material = cloneMaterial(scene.objects[0].material);
    scene.objects[0].color = cloneColor(scene.objects[0].color);
    scene.objects[0].material.ior = ior;
    return scene;
}

console.log('=== Refractive Behavior Regression ===');

var cam = new Camera(
    new Point3(0, 7.0, -36.0),
    new Vector3(0, -0.1, 1),
    new Vector3(0, 1, 0),
    6.0,
    22.5,
    480,
    320
);

var testPixel = { x: 262, y: 187 };
var sampleCount = 128;
var maxDepth = 8;

var lowIorScene = makeCurrentSceneWithIor(1.05);
var mediumIorScene = makeCurrentSceneWithIor(1.25);
var highIorScene = makeCurrentSceneWithIor(3.5);

var low = averageSamples(lowIorScene, cam, testPixel.x, testPixel.y, sampleCount, maxDepth, 1001);
var medium = averageSamples(mediumIorScene, cam, testPixel.x, testPixel.y, sampleCount, maxDepth, 2001);
var high = averageSamples(highIorScene, cam, testPixel.x, testPixel.y, sampleCount, maxDepth, 3001);

var lowLuma = luminance(low);
var mediumLuma = luminance(medium);
var highLuma = luminance(high);

console.log(`Pixel (${testPixel.x}, ${testPixel.y}) average over ${sampleCount} samples`);
console.log(`  IOR 1.05 -> rgb(${low.r.toFixed(2)}, ${low.g.toFixed(2)}, ${low.b.toFixed(2)}) luma=${lowLuma.toFixed(2)}`);
console.log(`  IOR 1.25 -> rgb(${medium.r.toFixed(2)}, ${medium.g.toFixed(2)}, ${medium.b.toFixed(2)}) luma=${mediumLuma.toFixed(2)}`);
console.log(`  IOR 3.50 -> rgb(${high.r.toFixed(2)}, ${high.g.toFixed(2)}, ${high.b.toFixed(2)}) luma=${highLuma.toFixed(2)}`);

if (lowLuma < 25) {
    throw new Error(`Low-IOR refractive sphere is too dark: luma=${lowLuma.toFixed(2)}`);
}

if (lowLuma < highLuma * 0.4) {
    throw new Error(`Low-IOR refractive sphere is disproportionately darker than high-IOR case: low=${lowLuma.toFixed(2)}, high=${highLuma.toFixed(2)}`);
}

if (mediumLuma < 25) {
    throw new Error(`Medium-IOR refractive sphere is too dark: luma=${mediumLuma.toFixed(2)}`);
}

console.log('✓ Refractive behavior looks sane.');
