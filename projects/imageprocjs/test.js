const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectDir = __dirname;
const html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
const scriptPattern = /<script(?:\s+src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/gi;
const scripts = [];
let match;

while ((match = scriptPattern.exec(html)) !== null) {
    scripts.push({ src: match[1], source: match[2] });
}

const localScripts = scripts
    .filter(function(script) { return script.src && script.src.indexOf('./') === 0; })
    .map(function(script) { return script.src.slice(2); });

localScripts.forEach(function(relativePath) {
    const filename = path.join(projectDir, relativePath);
    assert(fs.existsSync(filename), 'Missing local script: ' + relativePath);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename: filename });
});

scripts
    .filter(function(script) { return !script.src && script.source.trim(); })
    .forEach(function(script, index) {
        new vm.Script(script.source, { filename: 'index.html:inline-' + index });
    });

const algorithmDependencies = [
    'algorithms/mediancut.js',
    'algorithms/kmeans.js',
    'algorithms/neuralnetwork.js',
    'algorithms/filterfactory.js'
];
const registryIndex = localScripts.indexOf('algorithms.js');

assert(registryIndex !== -1, 'Missing algorithms.js registry');
algorithmDependencies.forEach(function(relativePath) {
    const dependencyIndex = localScripts.indexOf(relativePath);
    assert(dependencyIndex !== -1, 'Missing algorithm implementation: ' + relativePath);
    assert(dependencyIndex < registryIndex, relativePath + ' must load before algorithms.js');
});

const context = vm.createContext({ console: console, Float32Array: Float32Array });
algorithmDependencies.concat('algorithms.js').forEach(function(relativePath) {
    const filename = path.join(projectDir, relativePath);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename: filename }).runInContext(context);
});

assert.strictEqual(typeof context.algorithms.mediancut, 'function');
assert.strictEqual(typeof context.algorithms.kmeans, 'function');
assert.strictEqual(typeof context.algorithms.neuralnetwork, 'function');
assert.strictEqual(typeof context.algorithms.createfilter, 'function');

let dispatchedEvent;
function MockImage() {
    this.width = 2;
    this.height = 2;
}
Object.defineProperty(MockImage.prototype, 'src', {
    set: function() {
        this.onload();
    }
});

const loaderContext = vm.createContext({
    console: console,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Image: MockImage,
    Event: function(type) { this.type = type; },
    document: {
        dispatchEvent: function(event) { dispatchedEvent = event.type; }
    }
});

['color.js', 'image.js', 'imageloader.js'].forEach(function(relativePath) {
    const filename = path.join(projectDir, relativePath);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename: filename }).runInContext(loaderContext);
});

const imageData = new Uint8ClampedArray(2 * 2 * 4);
const canvasContext = {
    drawImage: function() {},
    getImageData: function() { return { data: imageData }; },
    clearRect: function() {},
    createImageData: function() { return { data: new Uint8ClampedArray(imageData.length) }; },
    putImageData: function() {}
};
const canvas = { getContext: function() { return canvasContext; } };
const loader = new loaderContext.ImageLoader(800);
loader.loadImage('./seal.jpg', canvas);

assert(loader.result, 'Default image did not load');
assert.strictEqual(dispatchedEvent, 'imageloaded');

const canvasListeners = {};
const documentListeners = {};
const curveCanvasContext = {
    clearRect: function() {},
    beginPath: function() {},
    moveTo: function() {},
    lineTo: function() {},
    stroke: function() {},
    arc: function() {},
    fill: function() {}
};
const curveCanvas = {
    id: '',
    setAttribute: function(name, value) { this[name] = value; },
    addEventListener: function(type, handler) { canvasListeners[type] = handler; },
    getBoundingClientRect: function() { return { left: 0, top: 0, width: 510, height: 510 }; },
    getContext: function() { return curveCanvasContext; },
    focus: function() {}
};
const curveContainer = {
    appendChild: function(child) { this.child = child; }
};
const curveContext = vm.createContext({
    console: console,
    Math: Math,
    Event: function(type) { this.type = type; },
    document: {
        querySelector: function() { return curveContainer; },
        createElement: function() { return curveCanvas; },
        addEventListener: function(type, handler) { documentListeners[type] = handler; },
        dispatchEvent: function() {}
    }
});

['colorutils.js', 'curve.js', 'tools/curvetool.js'].forEach(function(relativePath) {
    const filename = path.join(projectDir, relativePath);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename: filename }).runInContext(curveContext);
});

const curveTool = new curveContext.CurveTool();
curveTool.init('#div_curveplot');
const initialLut = curveTool.getLUT();

assert.strictEqual(curveCanvas.id, 'curvetool', 'Tone curve canvas must be the interactive top layer');
canvasListeners.mousedown({ clientX: 255, clientY: 255, preventDefault: function() {} });
documentListeners.mousemove({ clientX: 255, clientY: 100 });
documentListeners.mouseup({ clientX: 255, clientY: 100 });

assert.notStrictEqual(curveTool.getLUT()[127], initialLut[127], 'Dragging must update the tone curve');

console.log('ImageProcJS page integrity checks passed');
