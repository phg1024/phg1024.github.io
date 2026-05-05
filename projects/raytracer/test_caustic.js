const puppeteer = require('puppeteer');

(async () => {
    console.log('=== Running WebGPU Caustic Regression Test ===');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--enable-unsafe-webgpu',
            '--disable-gpu-shader-disk-cache',
            '--use-angle=metal'
        ]
    });

    const page = await browser.newPage();
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error(`[Browser Error]: ${msg.text()}`);
        } else if (msg.type() === 'warning') {
            console.warn(`[Browser Warning]: ${msg.text()}`);
        }
    });
    page.on('pageerror', err => {
        console.error(`[Page Error]: ${err.message}`);
    });

    try {
        await page.goto('http://localhost:57142/projects/raytracer/', { waitUntil: 'networkidle2' });

        const currentStats = await renderAndMeasureCaustics(page, {
            scene: 'current',
            backend: 'webgpu',
            tracerMode: 'path',
            useBvh: true,
            label: 'Current Scene Caustics'
        });
        console.log(`Current caustic stats: ${JSON.stringify(currentStats)}`);

        const bunnyStats = await renderAndMeasureCaustics(page, {
            scene: 'bunny',
            backend: 'webgpu',
            tracerMode: 'path',
            useBvh: true,
            label: 'Bunny Scene Caustics'
        });
        console.log(`Bunny caustic stats: ${JSON.stringify(bunnyStats)}`);

        const failures = [];
        if (currentStats.maxLuma < 12) {
            failures.push(`current-scene max luminance too low (${currentStats.maxLuma.toFixed(2)})`);
        }
        if (currentStats.nonBlackPixels < 120) {
            failures.push(`current-scene non-black caustic pixels too low (${currentStats.nonBlackPixels})`);
        }
        if (currentStats.lowerHalfEnergy <= currentStats.upperHalfEnergy * 1.2) {
            failures.push(
                `current-scene caustic energy is not concentrated on lower receivers (upper=${currentStats.upperHalfEnergy.toFixed(2)}, lower=${currentStats.lowerHalfEnergy.toFixed(2)})`
            );
        }
        if (currentStats.centroidY < currentStats.height * 0.45) {
            failures.push(`current-scene bright-pixel centroid too high in frame (${currentStats.centroidY.toFixed(1)})`);
        }
        if (currentStats.meanLuma <= bunnyStats.meanLuma * 2.0) {
            failures.push(
                `current-scene caustic signal is not meaningfully stronger than bunny scene (${currentStats.meanLuma.toFixed(4)} vs ${bunnyStats.meanLuma.toFixed(4)})`
            );
        }

        if (failures.length) {
            throw new Error(failures.join('; '));
        }

        console.log('✓ Caustic regression checks passed.');
    } catch (error) {
        console.error('❌ Caustic regression failed:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();

async function renderAndMeasureCaustics(page, options) {
    console.log(`Rendering ${options.label}...`);
    await page.select('#scene', options.scene);
    await page.select('#backend', options.backend);
    await page.select('#tracerMode', options.tracerMode);
    await page.evaluate((useBvh) => {
        const toggle = document.getElementById('bvhToggle');
        if (toggle.checked !== useBvh) {
            toggle.click();
        }
    }, options.useBvh);
    await page.evaluate(() => {
        const pathTraceToggle = document.getElementById('pathTraceToggle');
        if (!pathTraceToggle.checked) {
            pathTraceToggle.click();
        }
        const causticToggle = document.getElementById('causticOnlyToggle');
        if (!causticToggle.checked) {
            causticToggle.click();
        }
    });
    await page.click('#renderButton');

    await page.waitForFunction(
        () => {
            const text = document.getElementById('progress').innerText;
            const fpsText = document.getElementById('fpsCounter').innerText;
            return text.startsWith('WebGPU') && text.includes('accumulated frames') && !fpsText.includes('--');
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
        const src = document.getElementById('canvas');
        const probe = document.createElement('canvas');
        probe.width = src.width;
        probe.height = src.height;
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, 0, 0);
        const image = ctx.getImageData(0, 0, probe.width, probe.height);
        const data = image.data;

        let sumLuma = 0;
        let maxLuma = 0;
        let nonBlackPixels = 0;
        let brightWeightedX = 0;
        let brightWeightedY = 0;
        let brightWeight = 0;
        let upperHalfEnergy = 0;
        let lowerHalfEnergy = 0;

        for (let y = 0; y < probe.height; y++) {
            for (let x = 0; x < probe.width; x++) {
                const idx = (y * probe.width + x) * 4;
                const r = data[idx + 0];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                sumLuma += luma;
                maxLuma = Math.max(maxLuma, luma);
                if (luma > 2) {
                    nonBlackPixels++;
                }
                if (luma > 8) {
                    brightWeightedX += x * luma;
                    brightWeightedY += y * luma;
                    brightWeight += luma;
                }
                if (y < probe.height / 2) {
                    upperHalfEnergy += luma;
                } else {
                    lowerHalfEnergy += luma;
                }
            }
        }

        return {
            width: probe.width,
            height: probe.height,
            meanLuma: sumLuma / (probe.width * probe.height),
            maxLuma,
            nonBlackPixels,
            upperHalfEnergy,
            lowerHalfEnergy,
            centroidX: brightWeight > 0 ? brightWeightedX / brightWeight : -1,
            centroidY: brightWeight > 0 ? brightWeightedY / brightWeight : -1
        };
    });
}
