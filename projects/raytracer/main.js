import { RGBAImage } from './image.js';
import { renderWebGPU } from './webgpuRenderer.js';

var RAY_TRACE_DEFAULT_SAMPLES = 8;
var PATH_TRACE_DEFAULT_SAMPLES = 512;

var canvas;
var ctx;
var canvasBackend;
var finishedCount;
var startT, endT;
var progress;

export function init() {
    canvas = document.getElementById('canvas');
    ensureCanvasBackend('2d');
    finishedCount = 0;
    setProgressBar(0);

    var pathTraceToggle = document.getElementById('pathTraceToggle');
    pathTraceToggle.addEventListener('change', setDefaultSamplesForMode);

    var backend = document.getElementById('backend');
    if (!navigator.gpu) {
        backend.value = 'cpu';
        backend.querySelector('option[value="webgpu"]').disabled = true;
    }
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
    if (!canvas) init();
    setProgressBar(0);
    finishedCount = 0;
    startT = new Date();

    var backend = document.getElementById('backend').value;
    ensureCanvasBackend(backend === 'webgpu' ? 'webgpu' : '2d');

    var w = canvas.width;
    var h = canvas.height;
    if (ctx) ctx.clearRect(0, 0, w, h);

    var pathTraceMode = document.getElementById('pathTraceToggle').checked;
    var defaultSamples = pathTraceMode ? PATH_TRACE_DEFAULT_SAMPLES : RAY_TRACE_DEFAULT_SAMPLES;
    var nsamples = parseInt(document.getElementById('nsamples').value, 10) || defaultSamples;
    var maxDepth = parseInt(document.getElementById('maxdepth').value, 10) || 8;
    var nthreads = parseInt(document.getElementById('threads').value, 10) || 8;
    var seed = Math.random() * 999999 | 0;

    if (backend === 'webgpu') {
        await renderWithWebGPU(w, h, nsamples, maxDepth, pathTraceMode, seed);
        return;
    }

    var nextTask = 0;
    var blockSizeX = 32, blockSizeY = 32;
    var ntasksX = Math.ceil(w / blockSizeX);
    var ntasksY = Math.ceil(h / blockSizeY);
    var ntasks = ntasksX * ntasksY;
    nthreads = Math.max(1, Math.min(nthreads, ntasks));

    var tasks = createHilbertTasks(w, h, blockSizeX, blockSizeY);

    progress = [];
    var workers = [];
    for (var tid = 0; tid < nthreads; tid++) {
        var worker = new Worker('renderWorker.js', { type: 'module' });
        worker.idx = tid;
        worker.onmessage = function (e) {
            var data = e.data;
            switch (data.msg) {
                case 'progress':
                    progress[data.tidx] = data.value;
                    document.getElementById("progress").textContent = 'Rendering in progress: ' + mean(progress).toFixed(2) + '%';
                    break;
                case 'image':
                    updateCanvas(data.x1, data.x2, data.y1, data.y2, data.value);
                    finishedCount++;

                    setProgressBar(finishedCount / ntasks * 100.0);

                    if (nextTask < ntasks) {
                        var task = tasks[nextTask];
                        nextTask = nextTask + 1;

                        this.postMessage({
                            cmd: 'start', tidx: this.idx, w: w, h: h,
                            x1: task.x1, x2: task.x2, y1: task.y1, y2: task.y2,
                            nsamples: nsamples, maxDepth: maxDepth,
                            pathTrace: pathTraceMode, seed: seed
                        });
                    } else if (finishedCount === ntasks) {
                        endT = new Date();
                        var diff = endT - startT;
                        document.getElementById("progress").textContent = 'Finished in ' + diff + ' ms.';
                    }

                    break;
            }
        };
        workers.push(worker);
        progress.push(0);
    }

    for (var index = 0; index < nthreads; index++) {
        var seedTask = tasks[nextTask];
        nextTask = nextTask + 1;
        workers[index].postMessage({
            cmd: 'start', tidx: index, w: w, h: h,
            x1: seedTask.x1, x2: seedTask.x2, y1: seedTask.y1, y2: seedTask.y2,
            nsamples: nsamples, maxDepth: maxDepth,
            pathTrace: pathTraceMode, seed: seed
        });
    }
}

async function renderWithWebGPU(width, height, samples, maxDepth, pathTraceMode, seed) {
    document.getElementById("progress").textContent = 'Rendering with WebGPU...';
    try {
        var blockSizeX = 32;
        var blockSizeY = 32;
        var tasks = createHilbertTasks(width, height, blockSizeX, blockSizeY);
        await renderWebGPU({
            canvas: canvas,
            width: width,
            height: height,
            samples: samples,
            maxDepth: maxDepth,
            pathTrace: pathTraceMode,
            seed: seed,
            tasks: tasks,
            onProgress: function (done, total) {
                setProgressBar(done / total * 100);
                document.getElementById("progress").textContent = 'Rendering with WebGPU: ' + done + ' / ' + total + ' patches';
            }
        });
        setProgressBar(100);
        endT = new Date();
        document.getElementById("progress").textContent = 'Finished in ' + (endT - startT) + ' ms.';
    } catch (error) {
        document.getElementById('backend').value = 'cpu';
        document.getElementById("progress").textContent = error.message + ' Falling back to CPU workers.';
        await new Promise(function (resolve) { setTimeout(resolve, 50); });
        return render();
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
