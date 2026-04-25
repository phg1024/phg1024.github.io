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
        // Assuming the local server is running on localhost:57142 as spun up earlier
        await page.goto('http://localhost:57142/projects/raytracer/', { waitUntil: 'networkidle2' });
        
        console.log("Setting backend to WebGPU...");
        await page.select('#backend', 'webgpu');
        
        console.log("Triggering Render...");
        await page.click('#renderButton');
        
        // Wait up to 10 seconds for the progress text to indicate it's finished
        console.log("Waiting for rendering to complete...");
        await page.waitForFunction(
            () => {
                const text = document.getElementById('progress').innerText;
                return text.includes('Finished in') || text.includes('Falling back to CPU');
            },
            { timeout: 10000 }
        );
        
        const finalStatus = await page.$eval('#progress', el => el.innerText);
        if (finalStatus.includes('Finished in')) {
            console.log(`✓ WebGPU Rendering Succeeded: ${finalStatus}`);
        } else {
            console.error(`❌ WebGPU Rendering Failed: ${finalStatus}`);
            process.exit(1);
        }
        
    } catch (e) {
        console.error("❌ Test failed to execute:", e);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
