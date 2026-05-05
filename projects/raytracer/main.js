import { RGBAImage } from './image.js';
import { renderWebGPU } from './webgpuRenderer.js';
import { SCENE_OPTIONS } from './sceneDef.js';

var RAY_TRACE_DEFAULT_SAMPLES = 8;
var PATH_TRACE_DEFAULT_SAMPLES = 1;

var canvas;
var ctx;
var canvasBackend;
var finishedCount;
var startT, endT;
var progress;
var activeRenderController = null;
var activeWorkers = [];
var autoRenderStarted = false;
var cpuAccumulationBuffer = null;
var cpuImageData = null;
var renderQueue = Promise.resolve();
var latestRenderRequestId = 0;
var DEBUG_CAUSTIC_WORLD_POINT = { x: 1.0, y: 0.0, z: 2.0 };

export function init() {
    canvas = document.getElementById('canvas');
    ensureCanvasBackend('2d');
    finishedCount = 0;
    setProgressBar(0);
    setFpsCounter(null);

    var pathTraceToggle = document.getElementById('pathTraceToggle');
    pathTraceToggle.addEventListener('change', setDefaultSamplesForMode);
    setDefaultSamplesForMode();
    initializeSceneDropdown();
    updateProjectionMarker();
    document.getElementById('bvhToggle').addEventListener('change', render);
    document.getElementById('tracerMode').addEventListener('change', render);
    document.getElementById('causticOnlyToggle').addEventListener('change', render);

    var backend = document.getElementById('backend');
    backend.addEventListener('change', render);
    if (!navigator.gpu) {
        backend.value = 'cpu';
        backend.querySelector('option[value="webgpu"]').disabled = true;
    }

    if (!autoRenderStarted) {
        autoRenderStarted = true;
        render();
    }
}

function initializeSceneDropdown() {
    var sceneSelect = document.getElementById('scene');
    if (!sceneSelect || sceneSelect.options.length) return;

    for (var i = 0; i < SCENE_OPTIONS.length; i++) {
        var option = document.createElement('option');
        option.value = SCENE_OPTIONS[i].value;
        option.textContent = SCENE_OPTIONS[i].label;
        sceneSelect.appendChild(option);
    }

    sceneSelect.value = 'bunny';
    sceneSelect.addEventListener('change', render);
}

function ensureCanvasBackend(nextBackend) {
    if (canvasBackend === nextBackend && canvas) return;

    var currentCanvas = document.getElementById('canvas');
    var replacement = currentCanvas.cloneNode(false);
    replacement.width = currentCanvas.width;
    replacement.height = currentCanvas.height;
    currentCanvas.parentNode.replaceChild(replacement, currentCanvas);

    canvas = replacement;
    canvasBackend = nextBackend;
    ctx = nextBackend === '2d' ? canvas.getContext('2d') : null;
}

function setDefaultSamplesForMode() {
    var samples = document.getElementById('nsamples');
    var pathTraceMode = document.getElementById('pathTraceToggle').checked;
    samples.value = pathTraceMode ? PATH_TRACE_DEFAULT_SAMPLES : RAY_TRACE_DEFAULT_SAMPLES;
}

function setProgressBar(value) {
    var percent = Math.max(0, Math.min(100, value));
    var pbar = document.getElementById('pbar');
    var pbarValue = document.getElementById('pbarvalue');
    pbar.style.width = percent.toFixed(2) + '%';
    pbarValue.textContent = percent.toFixed(2) + '% Complete';
}

function setLiveProgress(label) {
    var pbar = document.getElementById('pbar');
    var pbarValue = document.getElementById('pbarvalue');
    pbar.style.width = '100%';
    pbarValue.textContent = label;
}

function setFpsCounter(fps) {
    var fpsCounter = document.getElementById('fpsCounter');
    if (!fpsCounter) return;
    fpsCounter.textContent = fps && fps > 0 ? 'FPS: ' + fps.toFixed(1) : 'FPS: --';
}

function normalize(v) {
    var length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function projectDebugPoint(point, width, height) {
    var origin = { x: 0.0, y: 7.0, z: -36.0 };
    var direction = normalize({ x: 0.0, y: -0.1, z: 1.0 });
    var up = normalize({ x: 0.0, y: 1.0, z: 0.0 });
    var right = cross(up, direction);
    var scale = 6.0 * Math.atan(22.5 / 180.0 * Math.PI);
    var aspect = width / height;
    var center = {
        x: origin.x + direction.x * 6.0,
        y: origin.y + direction.y * 6.0,
        z: origin.z + direction.z * 6.0
    };
    var axisX = { x: right.x * aspect, y: right.y * aspect, z: right.z * aspect };
    var axisY = up;
    var planeNormal = cross(axisX, axisY);
    var rel = subtract(point, origin);
    var denom = dot(rel, planeNormal);
    if (Math.abs(denom) <= 0.000001) {
        return null;
    }
    var rayScale = dot(subtract(center, origin), planeNormal) / denom;
    if (rayScale <= 0.0) {
        return null;
    }
    var planePoint = {
        x: origin.x + rel.x * rayScale,
        y: origin.y + rel.y * rayScale,
        z: origin.z + rel.z * rayScale
    };
    var offset = subtract(planePoint, center);
    var aa = dot(axisX, axisX);
    var ab = dot(axisX, axisY);
    var bb = dot(axisY, axisY);
    var as = dot(axisX, offset);
    var bs = dot(axisY, offset);
    var det = aa * bb - ab * ab;
    if (Math.abs(det) <= 0.000001) {
        return null;
    }
    var dx = (as * bb - bs * ab) / det;
    var dy = (bs * aa - as * ab) / det;
    return {
        x: (dx / scale + 0.5) * width,
        y: (0.5 - dy / scale) * height
    };
}

function updateProjectionMarker() {
    var marker = document.getElementById('projectionMarker');
    if (!marker || !canvas) return;
    marker.hidden = false;
    marker.style.display = 'none';
}

function mean(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i] || 0;
    }
    return sum / values.length;
}

export function resize() {
    var w = parseInt(document.getElementById('width').value, 10) || 480;
    var h = parseInt(document.getElementById('height').value, 10) || 320;
    canvas.setAttribute('width', w);
    canvas.setAttribute('height', h);
    updateProjectionMarker();
    render();
}

function nextPowerOfTwo(value) {
    var size = 1;
    while (size < value) size *= 2;
    return size;
}

function rotateHilbertQuadrant(size, point, rx, ry) {
    if (ry === 0) {
        if (rx === 1) {
            point.x = size - 1 - point.x;
            point.y = size - 1 - point.y;
        }
        var t = point.x;
        point.x = point.y;
        point.y = t;
    }
}

function hilbertIndexToPoint(sideLength, index) {
    var point = { x: 0, y: 0 };
    for (var size = 1, t = index; size < sideLength; size *= 2) {
        var rx = 1 & Math.floor(t / 2);
        var ry = 1 & (t ^ rx);
        rotateHilbertQuadrant(size, point, rx, ry);
        point.x += size * rx;
        point.y += size * ry;
        t = Math.floor(t / 4);
    }
    return point;
}

function createHilbertTasks(width, height, blockSizeX, blockSizeY) {
    var taskCountX = Math.ceil(width / blockSizeX);
    var taskCountY = Math.ceil(height / blockSizeY);
    var hilbertSide = nextPowerOfTwo(Math.max(taskCountX, taskCountY));
    var tasks = [];

    for (var d = 0; d < hilbertSide * hilbertSide; d++) {
        var point = hilbertIndexToPoint(hilbertSide, d);
        if (point.x >= taskCountX || point.y >= taskCountY) continue;

        var x1 = point.x * blockSizeX;
        var y1 = point.y * blockSizeY;
        tasks.push({
            x1: x1,
            x2: Math.min(x1 + blockSizeX, width),
            y1: y1,
            y2: Math.min(y1 + blockSizeY, height)
        });
    }

    return tasks;
}

export async function render() {
    var requestId = ++latestRenderRequestId;
    renderQueue = renderQueue
        .catch(function () {})
        .then(function () {
            return performRender(requestId);
        });
    return renderQueue;
}

async function performRender(requestId) {
    if (requestId !== latestRenderRequestId) {
        return;
    }
    if (!canvas) init();
    await stopActiveRender();
    if (requestId !== latestRenderRequestId) {
        return;
    }
    setProgressBar(0);
    setFpsCounter(null);
    finishedCount = 0;
    startT = new Date();

    var backend = document.getElementById('backend').value;
    ensureCanvasBackend(backend === 'webgpu' ? 'webgpu' : '2d');

    var w = canvas.width;
    var h = canvas.height;
    if (ctx) ctx.clearRect(0, 0, w, h);

    var pathTraceMode = document.getElementById('pathTraceToggle').checked;
    var sceneId = document.getElementById('scene').value;
    var useBvh = document.getElementById('bvhToggle').checked;
    var tracerMode = document.getElementById('tracerMode').value;
    var showCausticOnly = document.getElementById('causticOnlyToggle').checked;
    var defaultSamples = pathTraceMode ? PATH_TRACE_DEFAULT_SAMPLES : RAY_TRACE_DEFAULT_SAMPLES;
    var nsamples = parseInt(document.getElementById('nsamples').value, 10) || defaultSamples;
    var maxDepth = parseInt(document.getElementById('maxdepth').value, 10) || 8;
    var nthreads = parseInt(document.getElementById('threads').value, 10) || 8;
    var seed = Math.random() * 999999 | 0;
    updateProjectionMarker();

    if (backend === 'webgpu') {
        await renderWithWebGPU(w, h, nsamples, maxDepth, pathTraceMode, seed, sceneId, useBvh, tracerMode, showCausticOnly);
        return;
    }

    startCpuRenderLoop(w, h, nsamples, maxDepth, nthreads, pathTraceMode, seed, sceneId, useBvh, tracerMode);
}

async function renderWithWebGPU(width, height, samples, maxDepth, pathTraceMode, seed, sceneId, useBvh, tracerMode, showCausticOnly) {
    document.getElementById("progress").textContent = 'Rendering with WebGPU...';
    try {
        activeRenderController = await renderWebGPU({
            canvas: canvas,
            width: width,
            height: height,
            samples: samples,
            maxDepth: maxDepth,
            pathTrace: pathTraceMode,
            seed: seed,
            sceneId: sceneId,
            useBvh: useBvh,
            tracerMode: tracerMode,
            showCausticOnly: showCausticOnly,
            onFrame: function (frameCount, fps) {
                setFpsCounter(fps);
                setLiveProgress('Live');
                var label = pathTraceMode
                    ? (tracerMode === 'bdpt' ? 'WebGPU bidirectional path tracing' : 'WebGPU path tracing')
                    : 'WebGPU rendering';
                document.getElementById("progress").textContent = label + ': ' + frameCount + ' accumulated frames';
            }
        });
    } catch (error) {
        setFpsCounter(null);
        document.getElementById('backend').value = 'cpu';
        document.getElementById("progress").textContent = error.message + ' Falling back to CPU workers.';
        await new Promise(function (resolve) { setTimeout(resolve, 50); });
        return render();
    }
}

async function stopActiveRender() {
    if (activeRenderController && typeof activeRenderController.stop === 'function') {
        await activeRenderController.stop();
    }
    activeRenderController = null;
    cpuAccumulationBuffer = null;
    cpuImageData = null;

    while (activeWorkers.length) {
        activeWorkers.pop().terminate();
    }
}

function startCpuRenderLoop(w, h, nsamples, maxDepth, nthreads, pathTraceMode, seed, sceneId, useBvh, tracerMode) {
    var blockSizeX = 32;
    var blockSizeY = 32;
    var tasks = createHilbertTasks(w, h, blockSizeX, blockSizeY);
    var ntasks = tasks.length;
    var workerCount = Math.max(1, Math.min(nthreads, ntasks));
    var workers = [];
    var state = {
        cancelled: false,
        frameCount: 0,
        frameId: 0,
        nextTask: 0,
        finishedTasks: 0,
        lastFrameAt: performance.now(),
        fpsSamples: []
    };

    cpuAccumulationBuffer = new Float32Array(w * h * 4);
    cpuImageData = ctx.createImageData(w, h);
    activeWorkers = workers;
    activeRenderController = {
        stop: function () {
            state.cancelled = true;
        }
    };

    function dispatchTask(worker) {
        if (state.cancelled || state.nextTask >= ntasks) {
            return;
        }

        var task = tasks[state.nextTask++];
        worker.postMessage({
            cmd: 'start',
            tidx: worker.idx,
            frameId: state.frameId,
            w: w,
            h: h,
            x1: task.x1,
            x2: task.x2,
            y1: task.y1,
            y2: task.y2,
            nsamples: nsamples,
            maxDepth: maxDepth,
            pathTrace: pathTraceMode,
            seed: seed,
            sceneId: sceneId,
            useBvh: useBvh,
            tracerMode: tracerMode
        });
    }

    function startNextFrame() {
        if (state.cancelled) {
            return;
        }

        state.nextTask = 0;
        state.finishedTasks = 0;
        for (var i = 0; i < workers.length; i++) {
            dispatchTask(workers[i]);
        }
    }

    function finishFrame() {
        state.frameCount++;
        state.frameId++;
        updateCpuFps(state);
        setFpsCounter(mean(state.fpsSamples));
        setLiveProgress('Live');
        var label = pathTraceMode
            ? (tracerMode === 'bdpt' ? 'CPU bidirectional path tracing' : 'CPU photon mapping')
            : 'CPU rendering';
        document.getElementById("progress").textContent = label + ': ' + state.frameCount + ' accumulated frames';
        requestAnimationFrame(startNextFrame);
    }

    for (var tid = 0; tid < workerCount; tid++) {
        var worker = new Worker('renderWorker.js', { type: 'module' });
        worker.idx = tid;
        worker.onmessage = function (e) {
            var data = e.data;
            if (state.cancelled || data.msg !== 'tile' || data.frameId !== state.frameId) {
                return;
            }

            updateAccumulatedCanvasTile(w, data.x1, data.x2, data.y1, data.y2, data.value, state.frameCount);
            state.finishedTasks++;

            if (state.nextTask < ntasks) {
                dispatchTask(this);
            } else if (state.finishedTasks === ntasks) {
                finishFrame();
            }
        };
        workers.push(worker);
    }

    startNextFrame();
}

function updateAccumulatedCanvasTile(canvasWidth, x1, x2, y1, y2, buffer, frameCount) {
    var tileWidth = x2 - x1;
    var tileHeight = y2 - y1;
    var tile = new Float32Array(buffer);
    var imageBytes = cpuImageData.data;

    for (var localY = 0; localY < tileHeight; localY++) {
        for (var localX = 0; localX < tileWidth; localX++) {
            var tileIdx = (localY * tileWidth + localX) * 4;
            var canvasX = x1 + localX;
            var canvasY = canvas.height - y2 + localY;
            var canvasIdx = (canvasY * canvasWidth + canvasX) * 4;

            cpuAccumulationBuffer[canvasIdx] = (cpuAccumulationBuffer[canvasIdx] * frameCount + tile[tileIdx]) / (frameCount + 1);
            cpuAccumulationBuffer[canvasIdx + 1] = (cpuAccumulationBuffer[canvasIdx + 1] * frameCount + tile[tileIdx + 1]) / (frameCount + 1);
            cpuAccumulationBuffer[canvasIdx + 2] = (cpuAccumulationBuffer[canvasIdx + 2] * frameCount + tile[tileIdx + 2]) / (frameCount + 1);
            cpuAccumulationBuffer[canvasIdx + 3] = 255;

            imageBytes[canvasIdx] = cpuAccumulationBuffer[canvasIdx];
            imageBytes[canvasIdx + 1] = cpuAccumulationBuffer[canvasIdx + 1];
            imageBytes[canvasIdx + 2] = cpuAccumulationBuffer[canvasIdx + 2];
            imageBytes[canvasIdx + 3] = 255;
        }
    }

    ctx.putImageData(cpuImageData, 0, 0, x1, canvas.height - y2, tileWidth, tileHeight);
}

function updateCpuFps(state) {
    var now = performance.now();
    var dt = now - state.lastFrameAt;
    state.lastFrameAt = now;
    if (dt <= 0) return;

    state.fpsSamples.push(1000 / dt);
    if (state.fpsSamples.length > 24) {
        state.fpsSamples.shift();
    }
}

function updateCanvas(x1, x2, y1, y2, buffer) {
    var w = canvas.width;
    var h = canvas.height;

    var img = new RGBAImage(0, 0);
    img.w = x2 - x1;
    img.h = y2 - y1;
    img.data = new Uint8Array(buffer);
    ctx.putImageData(img.toImageData(ctx), x1, h - y2, 0, 0, img.w, img.h);
}

export function saveImage() {
    canvas.toBlob(function (blob) {
        saveAs(blob, "renderedImage.png");
    });
}

// Bind to window for inline HTML onclick handlers
window.render = render;
window.resize = resize;
window.saveImage = saveImage;

window.addEventListener('DOMContentLoaded', init);
