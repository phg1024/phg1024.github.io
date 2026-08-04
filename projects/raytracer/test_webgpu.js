const puppeteer = require('puppeteer');

(async () => {
    console.log("=== Running Offline WebGPU Tests using Headless Chrome ===");
    
    // Launch headless Chromium with WebGPU enabled
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--enable-unsafe-webgpu',
            '--disable-gpu-shader-disk-cache',
            '--use-angle=metal' // Useful for Mac WebGPU support in some Chromium builds
        ]
    });
    
    const page = await browser.newPage();
    
    // Catch console logs from the page
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error(`[Browser Error]: ${msg.text()}`);
        } else if (msg.type() === 'warning') {
            console.warn(`[Browser Warning]: ${msg.text()}`);
        } else {
            console.log(`[Browser Log]: ${msg.text()}`);
        }
    });
    
    page.on('pageerror', err => {
        console.error(`[Page Error]: ${err.message}`);
    });
    
    try {
        console.log("Navigating to local Ray Tracer deployment...");
        const baseUrl = process.env.RAYTRACER_BASE_URL || 'http://localhost:8080';
        await page.goto(`${baseUrl}/projects/raytracer/`, { waitUntil: 'networkidle2' });

        const webgpuState = await verifyLiveBackend(page, 'webgpu', 'WebGPU', 'current');
        console.log(`✓ WebGPU Rendering Succeeded: ${webgpuState.progress} (${webgpuState.fps})`);

        const currentCaustics = await measureCausticsFromCurrentState(page);
        console.log(`✓ Current Scene Caustic Stats: ${JSON.stringify(currentCaustics)}`);

        const cpuState = await verifyLiveBackend(page, 'cpu', 'CPU', 'current');
        console.log(`✓ CPU Rendering Succeeded: ${cpuState.progress} (${cpuState.fps})`);

        const bunnyWebgpuState = await verifyLiveBackend(page, 'webgpu', 'WebGPU Bunny', 'bunny');
        console.log(`✓ Bunny WebGPU Rendering Succeeded: ${bunnyWebgpuState.progress} (${bunnyWebgpuState.fps})`);

        const bunnyCaustics = await measureCausticsFromCurrentState(page);
        console.log(`✓ Bunny Scene Caustic Stats: ${JSON.stringify(bunnyCaustics)}`);

        const bunnyCpuState = await verifyLiveBackend(page, 'cpu', 'CPU Bunny', 'bunny');
        console.log(`✓ Bunny CPU Rendering Succeeded: ${bunnyCpuState.progress} (${bunnyCpuState.fps})`);

        const bunnyNoBvhState = await verifyLiveBackend(page, 'webgpu', 'WebGPU Bunny No BVH', 'bunny', false);
        console.log(`✓ Bunny WebGPU No BVH Rendering Succeeded: ${bunnyNoBvhState.progress} (${bunnyNoBvhState.fps})`);

        if (currentCaustics.maxLuma < 4) {
            throw new Error(`Current-scene caustic max luminance too low: ${currentCaustics.maxLuma.toFixed(2)}`);
        }
        if (currentCaustics.nonBlackPixels < 64) {
            throw new Error(`Current-scene caustic pixel count too low: ${currentCaustics.nonBlackPixels}`);
        }
        if (currentCaustics.lowerHalfEnergy <= currentCaustics.upperHalfEnergy) {
            throw new Error(`Current-scene caustic energy is not concentrated on lower receivers: ${JSON.stringify(currentCaustics)}`);
        }
        if (bunnyCaustics.maxLuma < 1) {
            throw new Error(`Bunny-scene caustic max luminance too low: ${bunnyCaustics.maxLuma.toFixed(2)}`);
        }
        if (bunnyCaustics.nonBlackPixels < 16) {
            throw new Error(`Bunny-scene caustic pixel count too low: ${bunnyCaustics.nonBlackPixels}`);
        }
        if (bunnyCaustics.lowerHalfEnergy <= bunnyCaustics.upperHalfEnergy) {
            throw new Error(`Bunny-scene caustic energy is not concentrated on lower receivers: ${JSON.stringify(bunnyCaustics)}`);
        }
        
    } catch (e) {
        console.error("❌ Test failed to execute:", e);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();

async function verifyLiveBackend(page, backend, label, scene, useBvh = true, tracerMode = 'path') {
    console.log(`Setting scene to ${scene}...`);
    await page.select('#scene', scene);
    console.log(`Setting BVH to ${useBvh ? 'on' : 'off'}...`);
    await page.evaluate((nextUseBvh) => {
        const toggle = document.getElementById('bvhToggle');
        if (toggle.checked !== nextUseBvh) {
            toggle.click();
        }
    }, useBvh);
    console.log(`Setting tracer to ${tracerMode}...`);
    await page.select('#tracerMode', tracerMode);
    console.log(`Setting backend to ${label}...`);
    await page.select('#backend', backend);
    console.log(`Waiting for live ${label} rendering to start...`);
    await triggerAndWaitForRender(page, backend, scene, useBvh, tracerMode);

    const state = await page.evaluate(() => ({
        progress: document.getElementById('progress').innerText,
        fps: document.getElementById('fpsCounter').innerText,
        backend: document.getElementById('backend').value,
        scene: document.getElementById('scene').value,
        useBvh: document.getElementById('bvhToggle').checked,
        tracerMode: document.getElementById('tracerMode').value,
        pbar: document.getElementById('pbarvalue').innerText
    }));

    if (!(state.progress.includes('accumulated frames') && state.backend === backend && state.scene === scene && state.useBvh === useBvh && state.tracerMode === tracerMode)) {
        throw new Error(`${label} validation failed: ${JSON.stringify(state)}`);
    }

    return state;
}

async function measureCausticsFromCurrentState(page) {
    await page.evaluate(() => {
        const pathTraceToggle = document.getElementById('pathTraceToggle');
        pathTraceToggle.checked = true;
        const causticOnlyToggle = document.getElementById('causticOnlyToggle');
        causticOnlyToggle.checked = true;
    });
    const scene = await page.$eval('#scene', el => el.value);
    await triggerAndWaitForRender(page, 'webgpu', scene, true, 'path');
    await new Promise(resolve => setTimeout(resolve, 1200));

    return await page.evaluate(() => {
        const src = document.getElementById('canvas');
        const probe = document.createElement('canvas');
        probe.width = src.width;
        probe.height = src.height;
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, probe.width, probe.height).data;

        let sumLuma = 0;
        let maxLuma = 0;
        let nonBlackPixels = 0;
        let upperHalfEnergy = 0;
        let lowerHalfEnergy = 0;
        let weightedX = 0;
        let weightedY = 0;

        for (let y = 0; y < probe.height; y++) {
            for (let x = 0; x < probe.width; x++) {
                const idx = (y * probe.width + x) * 4;
                const luma = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
                sumLuma += luma;
                maxLuma = Math.max(maxLuma, luma);
                if (luma > 2) {
                    nonBlackPixels++;
                    weightedX += x * luma;
                    weightedY += y * luma;
                }
                if (y < probe.height / 2) {
                    upperHalfEnergy += luma;
                } else {
                    lowerHalfEnergy += luma;
                }
            }
        }

        const expectedReceiver = (() => {
            const width = probe.width;
            const height = probe.height;
            const origin = { x: 0.0, y: 7.0, z: -36.0 };
            const direction = normalize({ x: 0.0, y: -0.1, z: 1.0 });
            const up = normalize({ x: 0.0, y: 1.0, z: 0.0 });
            const right = cross(up, direction);
            const center = add(origin, scale(direction, 6.0));
            const scaleFactor = 6.0 * Math.atan(22.5 / 180.0 * Math.PI);
            const aspect = width / height;
            const axisX = scale(right, aspect);
            const axisY = up;
            const planeNormal = cross(axisX, axisY);
            const point = { x: 1.0, y: 0.0, z: 1.0 };
            const rel = subtract(point, origin);
            const denom = dot(rel, planeNormal);
            const rayScale = dot(subtract(center, origin), planeNormal) / denom;
            const planePoint = add(origin, scale(rel, rayScale));
            const offset = subtract(planePoint, center);
            const axisXX = dot(axisX, axisX);
            const axisXY = dot(axisX, axisY);
            const axisYY = dot(axisY, axisY);
            const axisOffsetX = dot(axisX, offset);
            const axisOffsetY = dot(axisY, offset);
            const det = axisXX * axisYY - axisXY * axisXY;
            const dx = (axisOffsetX * axisYY - axisOffsetY * axisXY) / det;
            const dy = (axisOffsetY * axisXX - axisOffsetX * axisXY) / det;
            return {
                x: (dx / scaleFactor + 0.5) * width,
                y: (0.5 - dy / scaleFactor) * height
            };
        })();

        return {
            meanLuma: sumLuma / (probe.width * probe.height),
            maxLuma,
            nonBlackPixels,
            upperHalfEnergy,
            lowerHalfEnergy,
            centroidX: weightedX / Math.max(sumLuma, 1e-6),
            centroidY: weightedY / Math.max(sumLuma, 1e-6),
            expectedReceiver
        };

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

        function scale(v, s) {
            return { x: v.x * s, y: v.y * s, z: v.z * s };
        }

        function add(a, b) {
            return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
        }

        function normalize(v) {
            const len = Math.hypot(v.x, v.y, v.z);
            return { x: v.x / len, y: v.y / len, z: v.z / len };
        }
    });
}

async function triggerAndWaitForRender(page, backend, scene, useBvh, tracerMode) {
    for (let attempt = 0; attempt < 2; attempt++) {
        await page.evaluate(async (expectedBackend, expectedScene, expectedUseBvh, expectedTracerMode) => {
            document.getElementById('backend').value = expectedBackend;
            document.getElementById('scene').value = expectedScene;
            document.getElementById('bvhToggle').checked = expectedUseBvh;
            document.getElementById('tracerMode').value = expectedTracerMode;
            document.getElementById('progress').textContent = 'Starting test render...';
            document.getElementById('fpsCounter').textContent = 'FPS: --';
            await window.render();
        }, backend, scene, useBvh, tracerMode);
        try {
            await page.waitForFunction(
                (expectedBackend, expectedScene, expectedUseBvh, expectedTracerMode) => {
                    const text = document.getElementById('progress').innerText;
                    const fpsText = document.getElementById('fpsCounter').innerText;
                    const backendValue = document.getElementById('backend').value;
                    const sceneValue = document.getElementById('scene').value;
                    const useBvh = document.getElementById('bvhToggle').checked;
                    const tracerMode = document.getElementById('tracerMode').value;
                    return backendValue === expectedBackend && sceneValue === expectedScene && useBvh === expectedUseBvh && tracerMode === expectedTracerMode &&
                        ((expectedBackend === 'webgpu' && text.startsWith('WebGPU') && text.includes('accumulated frames') && !fpsText.includes('--')) ||
                         (expectedBackend === 'cpu' && text.startsWith('CPU') && text.includes('accumulated frames') && !fpsText.includes('--')) ||
                         text.includes('Falling back to CPU'));
                },
                { timeout: 20000 },
                backend,
                scene,
                useBvh,
                tracerMode
            );
            return;
        } catch (error) {
            if (attempt === 1) {
                throw error;
            }
        }
    }
}
