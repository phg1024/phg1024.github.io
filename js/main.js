(function () {
    'use strict';

    const root = document.documentElement;
    const backdrop = document.querySelector('.theme-backdrop');
    const overlay = document.querySelector('.pointer-reactive-overlay');
    const themeToggle = document.getElementById('theme-toggle');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Cyberpunk is switched off for now (2026-10-29): its styles and backdrop stay, but it is
    // not offered and a saved choice of it falls back to minimalist. To bring it back, add it
    // here, to the theme <select>s and to the restore scripts (base.njk, the four demos).
    const themeNames = ['minimalist', 'matrix', 'industrial', 'win31'];
    const matrixGlyphs = '01<>[]{}/*+-=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&';
    const MAX_PARTICLES = 80;
    const MAX_OVERLAY_FPS = 36;
    const MAX_BACKDROP_FPS = 24;
    const HEADER_SHRINK_SCROLL = 180;
    const IDLE_TIMEOUT = 5000; // pause animations after 5s of no pointer movement

    let rafId = null;
    let overlayFrame = null;
    let backdropFrame = null;
    let lastOverlayTimestamp = 0;
    let lastBackdropTimestamp = 0;
    let lastPointerMove = 0;
    let idleTimeout = null;
    let isIdle = false;

    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.22;
    let currentX = targetX;
    let currentY = targetY;

    let particles = [];
    let overlayContext = null;
    let overlayWidth = 0;
    let overlayHeight = 0;
    let overlayRatio = 1;

    let backdropContext = null;
    let backdropWidth = 0;
    let backdropHeight = 0;
    let backdropRatio = 1;
    let matrixColumns = [];
    let industrialPaths = [];
    let industrialSegments = [];
    let industrialPulses = [];
    let industrialChips = [];
    let industrialRipples = [];
    let pointerActive = false;
    let lastAmbientPulse = 0;
    let cyberSkyline = [];
    let cyberGridOffset = 0;
    let cyberFar = [];
    let cyberArcology = null;
    let cyberRain = [];
    let cyberSpinners = [];
    let cyberFlares = [];
    let cyberBillboards = [];
    let cyberGlass = null;
    let cyberHud = null;
    let cyberHudTimer = null;
    let cyberGlitchTimer = null;
    let cyberRings = [];

    // ── Idle detection ──

    const resetIdleTimer = function () {
        lastPointerMove = Date.now();
        if (idleTimeout) {
            clearTimeout(idleTimeout);
        }
        if (isIdle) {
            isIdle = false;
            queueAnimation();
            if (hasReactiveOverlay()) queueOverlay();
            if (hasDynamicBackdrop()) queueBackdrop();
        }
        idleTimeout = setTimeout(function () {
            isIdle = true;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (overlayFrame) {
                cancelAnimationFrame(overlayFrame);
                overlayFrame = null;
            }
            // The circuit board winds down by itself (drawIndustrialBackdrop stops once its
            // pulses have run out), so a pulse is never frozen halfway along a trace.
            if (backdropFrame && getTheme() !== 'industrial') {
                cancelAnimationFrame(backdropFrame);
                backdropFrame = null;
            }
        }, IDLE_TIMEOUT);
    };

    // ── Canvas helpers ──

    const getTheme = function () {
        return root.getAttribute('data-theme') || 'minimalist';
    };

    const hasReactiveOverlay = function () {
        return getTheme() !== 'win31' && getTheme() !== 'minimalist';
    };

    const hasDynamicBackdrop = function () {
        const theme = getTheme();
        return theme === 'matrix' || theme === 'industrial' || theme === 'cyberpunk';
    };

    const getThemeParticlePalette = function () {
        const theme = getTheme();
        if (theme === 'minimalist') {
            return { core: ['170, 178, 188', '223, 227, 232'], sparks: ['170, 178, 188', '223, 227, 232'] };
        }
        if (theme === 'matrix') {
            return { core: ['64, 255, 120', '200, 255, 210'], sparks: ['64, 255, 120', '210, 255, 210'] };
        }
        if (theme === 'industrial') {
            return { core: ['250, 146, 60', '255, 236, 214'], sparks: ['250, 146, 60', '214, 82, 16'] };
        }
        if (theme === 'win31') {
            return { core: ['255, 255, 255', '0, 0, 128'], sparks: ['255, 255, 255', '0, 0, 0'] };
        }
        return { core: ['46, 242, 255', '255, 174, 66'], sparks: ['255, 174, 66', '255, 42, 109'] };
    };

    const randomGlyph = function () {
        return matrixGlyphs.charAt(Math.floor(Math.random() * matrixGlyphs.length));
    };

    const setTheme = function (themeName) {
        const nextTheme = themeNames.indexOf(themeName) >= 0 ? themeName : 'minimalist';
        root.setAttribute('data-theme', nextTheme);
        localStorage.setItem('site-theme', nextTheme);
        if (themeToggle) themeToggle.value = nextTheme;

        if (!hasReactiveOverlay() && overlayContext) {
            overlayContext.clearRect(0, 0, overlayWidth, overlayHeight);
            particles = [];
        }
        if (!hasDynamicBackdrop() && backdropContext) {
            backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
        }
        if (getTheme() === 'matrix') {
            initializeMatrixColumns();
            queueBackdrop();
        } else if (getTheme() === 'industrial') {
            initializeIndustrialCircuits();
            queueBackdrop();
        } else if (getTheme() === 'cyberpunk') {
            initializeCyberSkyline();
            queueBackdrop();
        }
        syncCyberpunkChrome();
    };

    const applyPointerState = function () {
        var width = Math.max(window.innerWidth, 1);
        var height = Math.max(window.innerHeight, 1);
        var normalizedX = currentX / width;
        var normalizedY = currentY / height;
        var tiltY = ((normalizedX - 0.5) * 2.2).toFixed(2);
        var tiltX = ((0.5 - normalizedY) * 1.6).toFixed(2);
        var glow = Math.min(1, Math.max(0, 0.35 + Math.abs(normalizedX - 0.5) * 0.5 + Math.abs(normalizedY - 0.35) * 0.3));

        root.style.setProperty('--pointer-x', (normalizedX * 100).toFixed(2) + '%');
        root.style.setProperty('--pointer-y', (normalizedY * 100).toFixed(2) + '%');
        root.style.setProperty('--pointer-glow', glow.toFixed(3));
        root.style.setProperty('--pointer-tilt-x', tiltX + 'deg');
        root.style.setProperty('--pointer-tilt-y', tiltY + 'deg');
    };

    const applyHeaderScrollState = function () {
        var progress = Math.min(1, Math.max(0, window.scrollY / HEADER_SHRINK_SCROLL));
        root.style.setProperty('--header-scroll-progress', progress.toFixed(3));
    };

    const resizeOverlay = function () {
        if (!overlay) return;
        overlayRatio = Math.min(window.devicePixelRatio || 1, 1.25);
        overlayWidth = window.innerWidth;
        overlayHeight = window.innerHeight;
        overlay.width = Math.floor(overlayWidth * overlayRatio);
        overlay.height = Math.floor(overlayHeight * overlayRatio);
        overlay.style.width = overlayWidth + 'px';
        overlay.style.height = overlayHeight + 'px';
        overlayContext = overlay.getContext('2d');
        overlayContext.setTransform(overlayRatio, 0, 0, overlayRatio, 0, 0);
    };

    const resizeBackdrop = function () {
        if (!backdrop) return;
        backdropRatio = Math.min(window.devicePixelRatio || 1, 1.1);
        backdropWidth = window.innerWidth;
        backdropHeight = window.innerHeight;
        backdrop.width = Math.floor(backdropWidth * backdropRatio);
        backdrop.height = Math.floor(backdropHeight * backdropRatio);
        backdrop.style.width = backdropWidth + 'px';
        backdrop.style.height = backdropHeight + 'px';
        backdropContext = backdrop.getContext('2d');
        backdropContext.setTransform(backdropRatio, 0, 0, backdropRatio, 0, 0);
        initializeMatrixColumns();
        initializeIndustrialCircuits();
        initializeCyberSkyline();
    };

    // Matrix rain with depth. Streams come in three layers: far ones are small, faint and
    // slow, near ones large, bright and quick, so the glyph sizes vary from 10px to 34px and
    // the field reads as having depth. Each stream randomly falls or rises.
    // Streams are not tied to a grid; each picks its layer, direction and position again
    // whenever it leaves the screen. Every stream is two glyph sequences printed over each
    // other, cycling at different rates and slightly offset, so the text cannot be read.
    const MATRIX_LAYERS = [
        // Kept deliberately low-key: it is a backdrop behind text, not the show.
        { share: 0.6, size: [10, 13], speed: [0.35, 0.7], alpha: 0.18 },  // far
        { share: 0.32, size: [15, 20], speed: [0.7, 1.4], alpha: 0.32 },  // middle
        { share: 0.08, size: [24, 34], speed: [1.3, 2.2], alpha: 0.45 }   // near
    ];
    const MATRIX_RISING_SHARE = 0.5;    // chance a stream rises; drawn again each time it re-enters
    const MATRIX_STREAMS_PER_PX = 1 / 18;

    const pickBetween = function (range) {
        return range[0] + Math.random() * (range[1] - range[0]);
    };

    const spawnMatrixStream = function (stream, anywhere) {
        var roll = Math.random();
        var layer = MATRIX_LAYERS[MATRIX_LAYERS.length - 1];
        for (var li = 0, total = 0; li < MATRIX_LAYERS.length; li += 1) {
            total += MATRIX_LAYERS[li].share;
            if (roll < total) { layer = MATRIX_LAYERS[li]; break; }
        }
        stream.size = Math.round(pickBetween(layer.size));
        stream.step = Math.round(stream.size * 0.95);
        stream.speed = pickBetween(layer.speed);
        stream.alpha = layer.alpha;
        stream.rising = Math.random() < MATRIX_RISING_SHARE;
        stream.length = 6 + Math.floor(Math.random() * 14);
        stream.x = Math.random() * backdropWidth;
        stream.glyphs = Array.from({ length: 24 }, randomGlyph);
        stream.overlay = Array.from({ length: 17 }, randomGlyph);   // a different period from glyphs
        stream.shiftX = (Math.random() - 0.5) * stream.size * 0.36;
        stream.shiftY = (Math.random() - 0.5) * stream.size * 0.36;
        var span = stream.length * stream.step;
        if (anywhere) {
            // First fill: scatter heads over the whole screen so it does not start empty.
            stream.y = Math.random() * (backdropHeight + span) - (stream.rising ? span : 0);
        } else {
            // Re-entry: just off the edge the stream is moving away from.
            stream.y = stream.rising ? backdropHeight + Math.random() * 160 : -Math.random() * 160;
        }
        return stream;
    };

    const sortMatrixByDepth = function () {
        matrixColumns.sort(function (a, b) { return a.size - b.size; });   // far layers first
    };

    const initializeMatrixColumns = function () {
        if (!backdropContext || getTheme() !== 'matrix') {
            matrixColumns = [];
            return;
        }
        var count = Math.max(24, Math.min(220, Math.round(backdropWidth * MATRIX_STREAMS_PER_PX)));
        matrixColumns = Array.from({ length: count }, function () {
            return spawnMatrixStream({}, true);
        });
        sortMatrixByDepth();
    };

    const distanceToSegment = function (pointX, pointY, startX, startY, endX, endY) {
        var segmentX = endX - startX;
        var segmentY = endY - startY;
        var segmentLengthSquared = (segmentX * segmentX) + (segmentY * segmentY);
        if (segmentLengthSquared === 0) {
            return { distance: Math.hypot(pointX - startX, pointY - startY), t: 0, x: startX, y: startY };
        }
        var projected = ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSquared;
        var t = Math.max(0, Math.min(1, projected));
        var closestX = startX + (segmentX * t);
        var closestY = startY + (segmentY * t);
        return { distance: Math.hypot(pointX - closestX, pointY - closestY), t: t, x: closestX, y: closestY };
    };

    const pointAlongPath = function (path, distance) {
        var clampedDistance = Math.max(0, Math.min(path.totalLength, distance));
        var traversed = 0;
        for (var index = 0; index < path.segmentData.length; index += 1) {
            var segment = path.segmentData[index];
            if (traversed + segment.length >= clampedDistance) {
                var localDistance = clampedDistance - traversed;
                var ratio = segment.length > 0 ? (localDistance / segment.length) : 0;
                return {
                    x: segment.start.x + ((segment.end.x - segment.start.x) * ratio),
                    y: segment.start.y + ((segment.end.y - segment.start.y) * ratio)
                };
            }
            traversed += segment.length;
        }
        return path.points[path.points.length - 1];
    };

    const initializeIndustrialCircuits = function () {
        if (!backdropContext || getTheme() !== 'industrial') {
            industrialPaths = [];
            industrialSegments = [];
            industrialPulses = [];
            industrialChips = [];
            return;
        }
        // Chips go only in the empty margins beside the page (.site-shell). At fixed fractions
        // of the window they landed under the rail, a dark block behind the navigation.
        var shell = document.querySelector('.site-shell');
        var shellBox = shell ? shell.getBoundingClientRect() : { left: 0, right: backdropWidth };
        var leftRoom = shellBox.left;
        var rightRoom = backdropWidth - shellBox.right;
        industrialChips = [];
        if (leftRoom >= 160) {
            industrialChips.push({ x: (leftRoom / 2) - 55, y: backdropHeight * 0.62, w: 110, h: 64 });
        }
        if (rightRoom >= 180) {
            industrialChips.push({ x: shellBox.right + (rightRoom / 2) - 68, y: backdropHeight * 0.24, w: 136, h: 72 });
            industrialChips.push({ x: shellBox.right + (rightRoom / 2) - 60, y: backdropHeight * 0.66, w: 120, h: 68 });
        }
        var grid = Math.max(42, Math.round(Math.min(backdropWidth, backdropHeight) / 18));
        var columns = Math.max(8, Math.floor(backdropWidth / grid));
        var rows = Math.max(6, Math.floor(backdropHeight / grid));
        var marginX = Math.max(28, (backdropWidth - (columns * grid)) / 2);
        var marginY = Math.max(28, (backdropHeight - (rows * grid)) / 2);
        var node = function (column, row) {
            return { x: marginX + (column * grid), y: marginY + (row * grid) };
        };

        var pathSpecs = [
            [[0, 1], [2, 1], [2, 3], [5, 3], [5, 5], [8, 5], [8, 2], [columns - 1, 2]],
            [[1, rows - 2], [1, rows - 4], [4, rows - 4], [4, rows - 1], [7, rows - 1], [7, rows - 3], [columns - 2, rows - 3]],
            [[0, Math.floor(rows * 0.35)], [3, Math.floor(rows * 0.35)], [3, Math.floor(rows * 0.6)], [6, Math.floor(rows * 0.6)], [6, 1], [columns - 3, 1], [columns - 3, 4]],
            [[2, 0], [2, 2], [5, 2], [5, 4], [9, 4], [9, rows - 2]],
            [[Math.floor(columns * 0.45), 0], [Math.floor(columns * 0.45), 2], [Math.floor(columns * 0.7), 2], [Math.floor(columns * 0.7), rows - 2]],
            [[columns - 2, 0], [columns - 2, 3], [columns - 5, 3], [columns - 5, 5], [columns - 8, 5], [columns - 8, rows - 1]],
            [[0, rows - 5], [3, rows - 5], [3, rows - 2], [Math.floor(columns * 0.5), rows - 2], [Math.floor(columns * 0.5), rows - 4], [columns - 1, rows - 4]],
            [[Math.floor(columns * 0.2), 0], [Math.floor(columns * 0.2), 1], [Math.floor(columns * 0.3), 1], [Math.floor(columns * 0.3), rows - 3], [Math.floor(columns * 0.85), rows - 3]]
        ];

        industrialPaths = pathSpecs.map(function (spec, pathIndex) {
            var points = spec.map(function (pair) {
                return node(Math.max(0, Math.min(columns, pair[0])), Math.max(0, Math.min(rows, pair[1])));
            });
            var segmentData = [];
            var totalLength = 0;
            for (var idx = 0; idx < points.length - 1; idx += 1) {
                var start = points[idx];
                var end = points[idx + 1];
                var length = Math.hypot(end.x - start.x, end.y - start.y);
                segmentData.push({ start: start, end: end, length: length, accumulated: totalLength });
                totalLength += length;
            }
            var pointDistances = [0].concat(segmentData.map(function (segment) { return segment.accumulated + segment.length; }));
            return {
                id: pathIndex, points: points, segmentData: segmentData, totalLength: totalLength,
                pointDistances: pointDistances, flash: points.map(function () { return 0; })
            };
        });

        industrialSegments = [];
        industrialPaths.forEach(function (path) {
            path.segmentData.forEach(function (segment, segmentIndex) {
                industrialSegments.push({
                    pathId: path.id, segmentIndex: segmentIndex,
                    start: segment.start, end: segment.end,
                    accumulated: segment.accumulated, length: segment.length
                });
            });
        });
        industrialPulses = [];
        industrialRipples = [];
    };

    // Matrix: a few glyphs fall from where the pointer moves, like code leaking out of the
    // rain, rather than bursting outward.
    const spawnMatrixDrip = function (x, y, strength) {
        var count = Math.random() < (0.35 + strength * 0.5) ? (strength > 0.6 ? 2 : 1) : 0;
        for (var i = 0; i < count; i += 1) {
            var life = 26 + Math.random() * 18;
            particles.push({
                x: x + ((Math.random() - 0.5) * 10), y: y,
                vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.8,
                life: life, maxLife: life,
                size: 1.4 + Math.random() * 1.2,
                hue: '124, 255, 157',
                glyph: randomGlyph(), isGlyph: true, drip: true
            });
        }
        if (particles.length > MAX_PARTICLES) {
            particles = particles.slice(particles.length - MAX_PARTICLES);
        }
    };

    const spawnBurst = function (x, y, strength) {
        var count = Math.max(3, Math.min(8, Math.round(3 + strength * 6)));
        var palette = getThemeParticlePalette();
        var theme = getTheme();
        for (var i = 0; i < count; i += 1) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 0.6 + Math.random() * (1.5 + strength * 2.2);
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 12 + Math.random() * 16, maxLife: 12 + Math.random() * 16,
                size: 1.25 + Math.random() * 2.1,
                hue: i % 2 === 0 ? palette.sparks[0] : palette.sparks[1],
                glyph: theme === 'matrix' ? randomGlyph() : '',
                isGlyph: theme === 'matrix',
                isPixel: theme === 'win31'
            });
        }
        if (particles.length > MAX_PARTICLES) {
            particles = particles.slice(particles.length - MAX_PARTICLES);
        }
    };

    // Frames for a pulse starting at `origin` to carry its head to both ends of the trace and
    // its tail in after it, plus a short fade.
    const pulseLifetime = function (path, origin, speed, tail) {
        var farthest = Math.max(origin, path.totalLength - origin);
        return Math.ceil((farthest + tail) / speed) + 12;
    };

    // The pointer sits over the article panel or the footer bar: the traces there are covered,
    // so a pulse would run unseen and then appear at the panel's edge out of nowhere.
    const overCoveredArea = function (target) {
        return !!(target && target.closest && target.closest('.site-main, .site-footer'));
    };

    const triggerIndustrialCircuit = function (x, y, strength) {
        if (getTheme() !== 'industrial' || industrialSegments.length === 0) return;
        var bestHit = null;
        industrialSegments.forEach(function (segment) {
            var hit = distanceToSegment(x, y, segment.start.x, segment.start.y, segment.end.x, segment.end.y);
            if (!bestHit || hit.distance < bestHit.distance) {
                bestHit = { distance: hit.distance, segment: segment, localT: hit.t, x: hit.x, y: hit.y };
            }
        });
        if (!bestHit || bestHit.distance > 40) return;
        var path = industrialPaths.find(function (entry) { return entry.id === bestHit.segment.pathId; });
        if (!path) return;
        // One pulse per trace per sweep: running the pointer along a trace used to start a new
        // pulse every 15px (the check compared against where earlier pulses had started).
        var now = performance.now();
        if (path.lastHoverPulse && now - path.lastHoverPulse < 450) return;
        path.lastHoverPulse = now;
        var origin = bestHit.segment.accumulated + (bestHit.segment.length * bestHit.localT);
        var speed = 4.5 + (strength * 4);
        var life = pulseLifetime(path, origin, speed, 64);
        industrialPulses.push({
            pathId: path.id, originDistance: origin,
            progress: 0, speed: speed, life: life, maxLife: life,
            glowX: bestHit.x, glowY: bestHit.y,
            energy: 1, leak: 0.006, dropChance: 0.02
        });
        if (industrialPulses.length > 12) {
            industrialPulses = industrialPulses.slice(industrialPulses.length - 12);
        }
    };

    // A click sends a ring out from the pointer and strong pulses along the (up to) three
    // nearest traces, each starting from the point on it closest to the click.
    const burstIndustrialCircuit = function (x, y) {
        if (getTheme() !== 'industrial' || industrialSegments.length === 0) return;
        industrialRipples.push({ x: x, y: y, life: 40, maxLife: 40 });
        var nearestPerPath = {};
        industrialSegments.forEach(function (segment) {
            var hit = distanceToSegment(x, y, segment.start.x, segment.start.y, segment.end.x, segment.end.y);
            var best = nearestPerPath[segment.pathId];
            if (!best || hit.distance < best.distance) {
                nearestPerPath[segment.pathId] = { distance: hit.distance, segment: segment, localT: hit.t, x: hit.x, y: hit.y };
            }
        });
        Object.keys(nearestPerPath)
            .map(function (key) { return nearestPerPath[key]; })
            .filter(function (hit) { return hit.distance < 220; })
            .sort(function (a, b) { return a.distance - b.distance; })
            .slice(0, 3)
            .forEach(function (hit) {
                var path = industrialPaths.find(function (entry) { return entry.id === hit.segment.pathId; });
                if (!path) return;
                var origin = hit.segment.accumulated + (hit.segment.length * hit.localT);
                var life = pulseLifetime(path, origin, 9, 90);
                industrialPulses.push({
                    pathId: path.id, originDistance: origin,
                    progress: 0, speed: 9, life: life, maxLife: life,
                    glowX: hit.x, glowY: hit.y, strong: true,
                    energy: 1, leak: 0.003, dropChance: 0.01
                });
            });
        if (industrialPulses.length > 14) {
            industrialPulses = industrialPulses.slice(industrialPulses.length - 14);
        }
    };

    // A pulse that has run out of energy goes out with a small spark at each head.
    const fizzleIndustrialPulse = function (path, pulse) {
        [pulse.originDistance + pulse.progress, pulse.ambient ? null : pulse.originDistance - pulse.progress]
            .forEach(function (distance) {
                if (distance === null || distance < 0 || distance > path.totalLength) return;
                var point = pointAlongPath(path, distance);
                industrialRipples.push({ x: point.x, y: point.y, life: 14, maxLife: 14, spark: true });
            });
    };

    // Every few seconds while someone is around, a faint pulse runs the length of a random
    // trace, so the board reads as live before it is touched.
    const spawnAmbientPulse = function (timestamp) {
        if (isIdle || industrialPaths.length === 0 || timestamp - lastAmbientPulse < 2600) return;
        lastAmbientPulse = timestamp;
        var path = industrialPaths[Math.floor(Math.random() * industrialPaths.length)];
        var life = pulseLifetime(path, 0, 4, 64);
        industrialPulses.push({
            pathId: path.id, originDistance: 0, progress: 0, speed: 4,
            life: life, maxLife: life,
            glowX: path.points[0].x, glowY: path.points[0].y, ambient: true,
            energy: 1, leak: 0.008, dropChance: 0.03
        });
    };

    const drawMatrixBackdrop = function (timestamp) {
        if (!backdropContext || media.matches || getTheme() !== 'matrix') {
            if (backdropContext) backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            backdropFrame = null;
            return;
        }
        if (timestamp && (timestamp - lastBackdropTimestamp) < (1000 / MAX_BACKDROP_FPS)) {
            backdropFrame = window.requestAnimationFrame(drawMatrixBackdrop);
            return;
        }
        lastBackdropTimestamp = timestamp || 0;
        backdropContext.fillStyle = 'rgba(2, 7, 3, 0.28)';
        backdropContext.fillRect(0, 0, backdropWidth, backdropHeight);
        backdropContext.textBaseline = 'top';
        var respawned = false;
        matrixColumns.forEach(function (stream) {
            var pointerDistance = Math.abs(stream.x - currentX);
            var pointerBoost = pointerDistance < 120 ? 1.22 : 1;
            stream.y += (stream.rising ? -1 : 1) * stream.speed * pointerBoost;
            backdropContext.font = stream.size + 'px "Courier New", monospace';
            // The head leads in the direction of travel and the trail fades out behind it:
            // above the head when falling, below it when rising.
            var trail = stream.rising ? 1 : -1;
            var offset = Math.floor(Math.abs(stream.y) / stream.step);
            for (var gi = 0; gi < stream.length; gi += 1) {
                var glyphY = stream.y + (trail * gi * stream.step);
                if (glyphY < -stream.size * 2 || glyphY > backdropHeight + stream.size) continue;
                var glyph = stream.glyphs[(offset + gi) % stream.glyphs.length];
                var fade = Math.max(0.06, 1 - (gi / (stream.length + 2)));
                var isHead = gi === 0;
                // Heads are a lighter green rather than near-white, and nothing glows; near the
                // pointer the rain lights up, as if that stretch of code were being read.
                var lit = 0;
                if (pointerActive) {
                    var reach = Math.hypot(stream.x - currentX, glyphY - currentY);
                    if (reach < 120) lit = 1 - (reach / 120);
                }
                var baseAlpha = isHead ? 0.85 * stream.alpha : fade * 0.75 * stream.alpha;
                var litAlpha = baseAlpha + ((0.95 - baseAlpha) * lit);
                backdropContext.fillStyle = lit > 0
                    ? 'rgba(' + Math.round(100 + (130 * lit)) + ', 255, ' + Math.round(140 + (95 * lit)) + ', ' + litAlpha.toFixed(3) + ')'
                    : isHead
                        ? 'rgba(160, 255, 180, ' + baseAlpha.toFixed(3) + ')'
                        : 'rgba(100, 255, 140, ' + baseAlpha.toFixed(3) + ')';
                backdropContext.fillText(glyph, stream.x, glyphY);
                // Second layer: another glyph on the same spot, nudged a little and a bit dimmer.
                var overlay = stream.overlay[(offset * 2 + gi * 3) % stream.overlay.length];
                backdropContext.fillStyle = isHead
                    ? 'rgba(150, 245, 170, ' + (0.65 * stream.alpha).toFixed(3) + ')'
                    : 'rgba(90, 240, 130, ' + (fade * 0.56 * stream.alpha).toFixed(3) + ')';
                backdropContext.fillText(overlay, stream.x + stream.shiftX, glyphY + stream.shiftY);
            }
            if (Math.random() > 0.96) {
                stream.glyphs[Math.floor(Math.random() * stream.glyphs.length)] = randomGlyph();
            }
            if (Math.random() > 0.94) {
                stream.overlay[Math.floor(Math.random() * stream.overlay.length)] = randomGlyph();
            }
            var span = stream.length * stream.step;
            var gone = stream.rising ? (stream.y + span < 0) : (stream.y - span > backdropHeight);
            if (gone) {
                spawnMatrixStream(stream, false);
                respawned = true;
            }
        });
        if (respawned) sortMatrixByDepth();
        backdropContext.shadowBlur = 0;
        backdropFrame = window.requestAnimationFrame(drawMatrixBackdrop);
    };

    // The industrial backdrop is a circuit board: traces with vias at the bends and pads at
    // the ends, chips in the side margins, and blue pulses. Traces near the pointer light up,
    // moving across one sends a pulse along it, a click sends a ring and pulses down the
    // nearest three, and vias flash as a pulse passes. With reduced motion it is drawn once,
    // still.
    // Safety orange, the theme's one signal colour (--accent).
    const PULSE_RGB = '214, 82, 16';
    const GLOW_RGB = '250, 146, 60';

    const drawIndustrialBoard = function () {
        backdropContext.lineCap = 'round';
        backdropContext.lineJoin = 'round';
        industrialPaths.forEach(function (path) {
            backdropContext.beginPath();
            path.points.forEach(function (point, pi) {
                if (pi === 0) backdropContext.moveTo(point.x, point.y);
                else backdropContext.lineTo(point.x, point.y);
            });
            backdropContext.strokeStyle = 'rgba(120, 138, 156, 0.22)';
            backdropContext.lineWidth = 9;
            backdropContext.stroke();
            backdropContext.strokeStyle = 'rgba(86, 104, 122, 0.62)';
            backdropContext.lineWidth = 2.4;
            backdropContext.stroke();
        });
        // Proximity: the stretch of each trace within reach of the pointer brightens.
        if (pointerActive) {
            var reach = 110;
            industrialSegments.forEach(function (segment) {
                var hit = distanceToSegment(currentX, currentY, segment.start.x, segment.start.y, segment.end.x, segment.end.y);
                if (hit.distance > reach) return;
                var strength = 1 - (hit.distance / reach);
                var half = reach * 0.9;
                var along = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) || 1;
                var t0 = Math.max(0, hit.t - (half / along));
                var t1 = Math.min(1, hit.t + (half / along));
                var fromX = segment.start.x + ((segment.end.x - segment.start.x) * t0);
                var fromY = segment.start.y + ((segment.end.y - segment.start.y) * t0);
                var toX = segment.start.x + ((segment.end.x - segment.start.x) * t1);
                var toY = segment.start.y + ((segment.end.y - segment.start.y) * t1);
                var gradient = backdropContext.createLinearGradient(fromX, fromY, toX, toY);
                var mid = (hit.t - t0) / Math.max(0.0001, t1 - t0);
                gradient.addColorStop(0, 'rgba(' + GLOW_RGB + ', 0)');
                gradient.addColorStop(Math.min(1, Math.max(0, mid)), 'rgba(' + PULSE_RGB + ', ' + (0.75 * strength).toFixed(3) + ')');
                gradient.addColorStop(1, 'rgba(' + GLOW_RGB + ', 0)');
                backdropContext.strokeStyle = gradient;
                backdropContext.lineWidth = 3.2;
                backdropContext.beginPath();
                backdropContext.moveTo(fromX, fromY);
                backdropContext.lineTo(toX, toY);
                backdropContext.stroke();
            });
        }
        // Vias at the bends, square pads at the two ends; a via that a pulse just passed
        // glows and fades.
        industrialPaths.forEach(function (path) {
            path.points.forEach(function (point, pi) {
                var flash = path.flash[pi];
                var isEnd = pi === 0 || pi === path.points.length - 1;
                if (flash > 0.02) {
                    backdropContext.fillStyle = 'rgba(' + GLOW_RGB + ', ' + (0.45 * flash).toFixed(3) + ')';
                    backdropContext.beginPath();
                    backdropContext.arc(point.x, point.y, 7 + (flash * 7), 0, Math.PI * 2);
                    backdropContext.fill();
                    path.flash[pi] = flash * 0.9;
                }
                var tone = flash > 0.02 ? PULSE_RGB : '86, 104, 122';
                if (isEnd) {
                    backdropContext.fillStyle = 'rgba(' + tone + ', 0.7)';
                    backdropContext.fillRect(point.x - 5, point.y - 5, 10, 10);
                    backdropContext.fillStyle = 'rgba(214, 222, 230, 0.9)';
                    backdropContext.fillRect(point.x - 2, point.y - 2, 4, 4);
                } else {
                    backdropContext.strokeStyle = 'rgba(' + tone + ', 0.75)';
                    backdropContext.lineWidth = 2;
                    backdropContext.beginPath();
                    backdropContext.arc(point.x, point.y, 4.2, 0, Math.PI * 2);
                    backdropContext.stroke();
                    backdropContext.fillStyle = 'rgba(214, 222, 230, 0.95)';
                    backdropContext.beginPath();
                    backdropContext.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
                    backdropContext.fill();
                }
            });
        });
        industrialChips.forEach(function (chip, index) {
            backdropContext.fillStyle = 'rgba(38, 46, 56, 0.92)';
            backdropContext.fillRect(chip.x, chip.y, chip.w, chip.h);
            backdropContext.strokeStyle = 'rgba(150, 166, 182, 0.5)';
            backdropContext.lineWidth = 1;
            backdropContext.strokeRect(chip.x + 0.5, chip.y + 0.5, chip.w - 1, chip.h - 1);
            backdropContext.fillStyle = 'rgba(160, 174, 188, 0.75)';
            for (var pin = 0; pin * 14 + 10 < chip.h - 4; pin += 1) {
                var pinOffset = 10 + (pin * 14);
                backdropContext.fillRect(chip.x - 7, chip.y + pinOffset, 7, 2);
                backdropContext.fillRect(chip.x + chip.w, chip.y + pinOffset, 7, 2);
            }
            backdropContext.beginPath();
            backdropContext.arc(chip.x + 9, chip.y + 9, 2.5, 0, Math.PI * 2);
            backdropContext.fill();
            backdropContext.font = '10px "Courier New", monospace';
            backdropContext.fillText('U' + (index + 1), chip.x + chip.w - 22, chip.y + chip.h - 9);
        });
    };

    const drawIndustrialBackdrop = function (timestamp) {
        if (!backdropContext || getTheme() !== 'industrial') {
            if (backdropContext) backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            backdropFrame = null;
            return;
        }
        if (media.matches) {
            backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            drawIndustrialBoard();
            backdropFrame = null;
            return;
        }
        if (timestamp && (timestamp - lastBackdropTimestamp) < (1000 / MAX_BACKDROP_FPS)) {
            backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
            return;
        }
        lastBackdropTimestamp = timestamp || 0;
        spawnAmbientPulse(timestamp || 0);
        backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
        drawIndustrialBoard();

        industrialRipples = industrialRipples.filter(function (ripple) {
            ripple.life -= 1;
            var progress = 1 - (ripple.life / ripple.maxLife);
            if (ripple.spark) {
                backdropContext.strokeStyle = 'rgba(' + GLOW_RGB + ', ' + (0.8 * (1 - progress)).toFixed(3) + ')';
                backdropContext.lineWidth = 1;
                for (var ray = 0; ray < 4; ray += 1) {
                    var angle = Math.random() * Math.PI * 2;
                    var reach = 3 + (progress * 9) + (Math.random() * 4);
                    backdropContext.beginPath();
                    backdropContext.moveTo(ripple.x, ripple.y);
                    backdropContext.lineTo(ripple.x + (Math.cos(angle) * reach), ripple.y + (Math.sin(angle) * reach));
                    backdropContext.stroke();
                }
                return ripple.life > 0;
            }
            backdropContext.strokeStyle = 'rgba(' + PULSE_RGB + ', ' + (0.6 * (1 - progress)).toFixed(3) + ')';
            backdropContext.lineWidth = 2;
            backdropContext.beginPath();
            backdropContext.arc(ripple.x, ripple.y, 8 + (progress * 90), 0, Math.PI * 2);
            backdropContext.stroke();
            return ripple.life > 0;
        });

        industrialPulses = industrialPulses.filter(function (pulse) {
            var path = industrialPaths.find(function (entry) { return entry.id === pulse.pathId; });
            if (!path) return false;
            var previous = pulse.progress;
            pulse.progress += pulse.speed;
            pulse.life -= 1;
            // The current leaks as it travels, and now and then loses a chunk at once, so some
            // pulses reach the pads and some die out on the way (strong ones least often).
            pulse.energy *= 1 - (pulse.leak * (0.5 + Math.random()));
            if (Math.random() < pulse.dropChance) pulse.energy *= 0.45 + (Math.random() * 0.35);
            if (pulse.energy < 0.12) {
                fizzleIndustrialPulse(path, pulse);
                return false;
            }
            var alpha = Math.max(0, Math.min(1, pulse.life / 12)) * Math.min(1, pulse.energy * 1.25);
            var weight = pulse.ambient ? 0.45 : 1;
            var headDistanceA = pulse.originDistance + pulse.progress;
            var tailDistanceA = Math.max(pulse.originDistance, headDistanceA - (pulse.strong ? 90 : 64));
            var headDistanceB = pulse.originDistance - pulse.progress;
            var tailDistanceB = Math.min(pulse.originDistance, headDistanceB + (pulse.strong ? 90 : 64));
            // Light the vias the heads crossed this frame.
            path.pointDistances.forEach(function (distance, pi) {
                var crossedA = distance > pulse.originDistance + previous && distance <= headDistanceA;
                var crossedB = !pulse.ambient && distance < pulse.originDistance - previous && distance >= headDistanceB;
                if (crossedA || crossedB) path.flash[pi] = Math.max(path.flash[pi], weight * pulse.energy);
            });
            // Current crackles: every frame the inner points of the pulse are knocked a little
            // off the trace (more toward the head), its brightness flickers, and a few short
            // sparks jump off the head.
            var flicker = 0.78 + (Math.random() * 0.22);
            var shake = (pulse.strong ? 2.6 : 1.8) * (pulse.ambient ? 0.6 : 1) * (0.4 + (0.6 * pulse.energy));
            var drawPulseSegment = function (fromDistance, toDistance, headDistance) {
                var clampedStart = Math.max(0, Math.min(path.totalLength, fromDistance));
                var clampedEnd = Math.max(0, Math.min(path.totalLength, toDistance));
                if (Math.abs(clampedEnd - clampedStart) < 2) return;
                var segmentCount = Math.max(3, Math.ceil(Math.abs(clampedEnd - clampedStart) / 7));
                var head = null;
                backdropContext.beginPath();
                for (var step = 0; step <= segmentCount; step += 1) {
                    var distance = clampedStart + ((clampedEnd - clampedStart) * (step / segmentCount));
                    var point = pointAlongPath(path, distance);
                    var nearHead = 1 - Math.min(1, Math.abs(headDistance - distance) / 70);
                    var amount = (step === 0 || step === segmentCount) ? 0 : shake * (0.35 + nearHead);
                    var x = point.x + ((Math.random() - 0.5) * 2 * amount);
                    var y = point.y + ((Math.random() - 0.5) * 2 * amount);
                    if (step === 0) backdropContext.moveTo(x, y);
                    else backdropContext.lineTo(x, y);
                    if (Math.abs(distance - Math.max(0, Math.min(path.totalLength, headDistance))) < 0.5) head = point;
                }
                var strength = alpha * weight * flicker;
                backdropContext.shadowBlur = 14;
                backdropContext.shadowColor = 'rgba(' + GLOW_RGB + ', ' + strength.toFixed(3) + ')';
                backdropContext.strokeStyle = 'rgba(' + PULSE_RGB + ', ' + strength.toFixed(3) + ')';
                // Thinner as well as dimmer as the energy runs down, until it goes out.
                var thickness = 0.45 + (0.55 * pulse.energy);
                backdropContext.lineWidth = (pulse.strong ? 4 : 3) * thickness;
                backdropContext.stroke();
                backdropContext.shadowBlur = 0;
                backdropContext.strokeStyle = 'rgba(255, 238, 214, ' + (strength * 0.9).toFixed(3) + ')';
                backdropContext.lineWidth = 1.2 * thickness;
                backdropContext.stroke();
                if (head && headDistance > 0 && headDistance < path.totalLength && Math.random() < 0.7) {
                    backdropContext.strokeStyle = 'rgba(' + GLOW_RGB + ', ' + (strength * 0.85).toFixed(3) + ')';
                    backdropContext.lineWidth = 1;
                    for (var spark = 0; spark < (pulse.strong ? 3 : 2); spark += 1) {
                        var angle = Math.random() * Math.PI * 2;
                        var reach = 4 + (Math.random() * (pulse.strong ? 10 : 7));
                        var bendX = head.x + (Math.cos(angle) * reach * 0.5) + ((Math.random() - 0.5) * 3);
                        var bendY = head.y + (Math.sin(angle) * reach * 0.5) + ((Math.random() - 0.5) * 3);
                        backdropContext.beginPath();
                        backdropContext.moveTo(head.x, head.y);
                        backdropContext.lineTo(bendX, bendY);
                        backdropContext.lineTo(head.x + (Math.cos(angle) * reach), head.y + (Math.sin(angle) * reach));
                        backdropContext.stroke();
                    }
                }
            };
            drawPulseSegment(tailDistanceA, headDistanceA, headDistanceA);
            if (!pulse.ambient) drawPulseSegment(headDistanceB, tailDistanceB, headDistanceB);
            var spark = Math.max(0, 1 - ((pulse.maxLife - pulse.life) / 24));
            if (!pulse.ambient && spark > 0) {
                backdropContext.beginPath();
                backdropContext.fillStyle = 'rgba(' + PULSE_RGB + ', ' + (spark * 0.8).toFixed(3) + ')';
                backdropContext.arc(pulse.glowX, pulse.glowY, 3.5 + ((1 - spark) * 8), 0, Math.PI * 2);
                backdropContext.fill();
            }
            return pulse.life > 0;
        });
        backdropContext.shadowBlur = 0;

        // Idle: keep going only until the last pulse, ring and via flash have died out.
        var settling = industrialPulses.length > 0 || industrialRipples.length > 0 ||
            industrialPaths.some(function (path) { return path.flash.some(function (f) { return f > 0.02; }); });
        if (isIdle && !settling) {
            backdropFrame = null;
            return;
        }
        backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
    };

    // Cyberpunk backdrop: a rain-soaked megacity at night, Blade Runner by way of 2077.
    // Sodium smog over the horizon; a far layer of megastructures and a stepped arcology in
    // the haze; searchlights sweeping the cloud and flare stacks bursting now and then. The
    // near towers rise highest beside the content column, so the page stands in a canyon of
    // them, hung with neon (vertical plates, lightboxes, rooftop characters), each sign with
    // a halo in the fog, a reflection in the wet floor and now and then a failing tube. In
    // each clear margin a holographic billboard cycles its ads with a glitch. Spinners cross
    // the sky; rain catches the light near the pointer; the view drifts with the pointer.
    // With reduced motion it is drawn once, still.
    const CYBER_SIGNS = ['ホテル', '酒場', 'ラーメン', '強力', '夢', '電気', '未来', '薬局', 'バー', '寿司', '東京', '愛', '質屋', '電脳'];
    const CYBER_LIGHTBOXES = ['BAR', 'HOTEL', '24H', 'OPEN', 'NOODLE', 'CLINIC', 'カラオケ', '酒', '麺', 'PACHINKO', 'ラブ'];
    const CYBER_ROOFS = ['電脳', '東亜', '新星', '龍宮', '大夢', '光'];
    const CYBER_NEON = ['255, 42, 109', '46, 242, 255', '255, 174, 66', '255, 120, 210', '255, 90, 60'];
    const CYBER_SIGN_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';

    const cyberRgba = function (rgb, alpha) {
        return 'rgba(' + rgb + ', ' + alpha + ')';
    };

    // Where the page's text sits, in viewport pixels: the rail's contents and the content
    // column (full height, it scrolls). Signs and billboards stay out of the rail, rain too.
    const cyberKeepOut = function () {
        var rail = document.querySelector('.site-header__inner');
        var column = document.querySelector('.site-main');
        var r = rail && rail.getBoundingClientRect();
        var c = column && column.getBoundingClientRect();
        return {
            rail: r && r.width ? { l: r.left - 14, r: r.right + 14, t: r.top - 14, b: r.bottom + 14 } : null,
            column: c && c.width ? { l: c.left - 10, r: c.right + 10 } : null
        };
    };

    // A sign is drawn once, lit and dark, onto canvases of its own; the lit one carries its
    // halo, so a frame only copies images.
    const renderCyberSign = function (sign) {
        var pad = Math.round(sign.size * 2.2);
        var make = function (on) {
            var canvas = document.createElement('canvas');
            canvas.width = Math.ceil(sign.w + pad * 2);
            canvas.height = Math.ceil(sign.h + pad * 2);
            var g = canvas.getContext('2d');
            if (on) {
                var reach = Math.max(canvas.width, canvas.height) / 2;
                var halo = g.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, reach);
                halo.addColorStop(0, cyberRgba(sign.rgb, 0.3));
                halo.addColorStop(1, cyberRgba(sign.rgb, 0));
                g.fillStyle = halo;
                g.fillRect(0, 0, canvas.width, canvas.height);
            }
            if (sign.kind !== 'roof') {
                g.fillStyle = 'rgba(10, 8, 14, 0.95)';
                g.fillRect(pad, pad, sign.w, sign.h);
                g.strokeStyle = cyberRgba(sign.rgb, on ? 0.6 : 0.12);
                g.lineWidth = 1;
                g.strokeRect(pad + 0.5, pad + 0.5, sign.w - 1, sign.h - 1);
            }
            g.font = '600 ' + sign.size + 'px ' + CYBER_SIGN_FONT;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            var write = function () {
                if (sign.kind === 'v') {
                    for (var c = 0; c < sign.text.length; c += 1) {
                        g.fillText(sign.text.charAt(c), pad + sign.w / 2, pad + sign.size * 0.9 + c * sign.size * 1.15);
                    }
                } else {
                    g.fillText(sign.text, pad + sign.w / 2, pad + sign.h / 2);
                }
            };
            g.shadowBlur = on ? sign.size * 0.8 : 0;
            g.shadowColor = cyberRgba(sign.rgb, 0.95);
            g.fillStyle = cyberRgba(sign.rgb, on ? 0.97 : 0.16);
            write();
            if (on) {
                // A white-hot core down the middle of the tube.
                g.shadowBlur = 0;
                g.fillStyle = 'rgba(255, 246, 240, 0.35)';
                write();
            }
            return canvas;
        };
        sign.pad = pad;
        sign.lit = make(true);
        sign.dark = make(false);
    };

    const makeCyberSign = function (kind, rgb) {
        var sign = { kind: kind, rgb: rgb || CYBER_NEON[Math.floor(Math.random() * CYBER_NEON.length)], offUntil: 0 };
        var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
        if (kind === 'v') {
            sign.text = pick(CYBER_SIGNS);
            sign.size = 13 + Math.round(Math.random() * 7);
            sign.w = sign.size * 1.5;
            sign.h = sign.text.length * sign.size * 1.15 + sign.size * 0.6;
        } else {
            sign.text = pick(kind === 'roof' ? CYBER_ROOFS : CYBER_LIGHTBOXES);
            sign.size = kind === 'roof' ? 18 + Math.round(Math.random() * 10) : 10 + Math.round(Math.random() * 3);
            backdropContext.font = '600 ' + sign.size + 'px ' + CYBER_SIGN_FONT;
            var textWidth = backdropContext.measureText(sign.text).width;
            sign.w = textWidth + (kind === 'roof' ? 6 : sign.size * 1.2);
            sign.h = sign.size * (kind === 'roof' ? 1.3 : 1.8);
        }
        return sign;
    };

    // Billboard ads, each drawn once onto its own canvas.
    const renderCyberAds = function (w, h) {
        var ads = [];
        var make = function (paint) {
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(w);
            canvas.height = Math.round(h);
            paint(canvas.getContext('2d'), canvas.width, canvas.height);
            return canvas;
        };
        // Dream: a big character on magenta going to sodium orange.
        ads.push({ rgb: '255, 60, 140', image: make(function (g, cw, ch) {
            var bg = g.createLinearGradient(0, 0, 0, ch);
            bg.addColorStop(0, 'rgb(70, 6, 52)');
            bg.addColorStop(0.6, 'rgb(170, 20, 90)');
            bg.addColorStop(1, 'rgb(255, 120, 50)');
            g.fillStyle = bg;
            g.fillRect(0, 0, cw, ch);
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.shadowBlur = cw * 0.08;
            g.shadowColor = 'rgba(255, 200, 230, 0.9)';
            g.fillStyle = 'rgba(255, 236, 246, 0.95)';
            g.font = '700 ' + Math.round(cw * 0.6) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('夢', cw / 2, ch * 0.42);
            g.shadowBlur = 0;
            g.font = '600 ' + Math.round(cw * 0.11) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('ユメ・ドリーム', cw / 2, ch * 0.76);
            g.fillStyle = 'rgba(46, 242, 255, 0.95)';
            g.fillRect(cw * 0.12, ch * 0.08, cw * 0.28, ch * 0.05);
            g.fillStyle = 'rgb(20, 4, 20)';
            g.font = '700 ' + Math.round(cw * 0.07) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('NEW', cw * 0.26, ch * 0.105);
        }) });
        // An eye that watches the street.
        ads.push({ rgb: '46, 242, 255', image: make(function (g, cw, ch) {
            var bg = g.createLinearGradient(0, 0, 0, ch);
            bg.addColorStop(0, 'rgb(0, 30, 44)');
            bg.addColorStop(1, 'rgb(2, 8, 16)');
            g.fillStyle = bg;
            g.fillRect(0, 0, cw, ch);
            var cx = cw / 2;
            var cy = ch * 0.4;
            var ew = cw * 0.4;
            g.strokeStyle = 'rgba(46, 242, 255, 0.95)';
            g.lineWidth = Math.max(2, cw * 0.02);
            g.shadowBlur = cw * 0.06;
            g.shadowColor = 'rgba(46, 242, 255, 0.9)';
            g.beginPath();
            g.moveTo(cx - ew, cy);
            g.quadraticCurveTo(cx, cy - ew * 0.9, cx + ew, cy);
            g.quadraticCurveTo(cx, cy + ew * 0.9, cx - ew, cy);
            g.stroke();
            var iris = g.createRadialGradient(cx, cy, 0, cx, cy, ew * 0.42);
            iris.addColorStop(0, 'rgba(255, 174, 66, 1)');
            iris.addColorStop(0.55, 'rgba(255, 42, 109, 0.9)');
            iris.addColorStop(1, 'rgba(46, 242, 255, 0.4)');
            g.fillStyle = iris;
            g.beginPath();
            g.arc(cx, cy, ew * 0.42, 0, Math.PI * 2);
            g.fill();
            g.shadowBlur = 0;
            g.fillStyle = 'rgb(4, 6, 10)';
            g.beginPath();
            g.arc(cx, cy, ew * 0.16, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255, 255, 255, 0.9)';
            g.beginPath();
            g.arc(cx - ew * 0.14, cy - ew * 0.14, ew * 0.06, 0, Math.PI * 2);
            g.fill();
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = 'rgba(220, 252, 255, 0.95)';
            g.font = '700 ' + Math.round(cw * 0.15) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('見ている', cx, ch * 0.74);
            g.fillStyle = 'rgba(46, 242, 255, 0.8)';
            g.font = '600 ' + Math.round(cw * 0.07) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('WE SEE YOU', cx, ch * 0.86);
        }) });
        // A drink, with stripes, a barcode and a price.
        ads.push({ rgb: '255, 174, 66', image: make(function (g, cw, ch) {
            g.fillStyle = 'rgb(16, 8, 24)';
            g.fillRect(0, 0, cw, ch);
            g.fillStyle = 'rgba(255, 174, 66, 0.16)';
            for (var s = -ch; s < cw; s += cw * 0.16) {
                g.beginPath();
                g.moveTo(s, 0);
                g.lineTo(s + cw * 0.07, 0);
                g.lineTo(s + cw * 0.07 + ch, ch);
                g.lineTo(s + ch, ch);
                g.fill();
            }
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.shadowBlur = cw * 0.06;
            g.shadowColor = 'rgba(255, 174, 66, 0.9)';
            g.fillStyle = 'rgba(255, 196, 110, 1)';
            g.font = '800 ' + Math.round(cw * 0.3) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('強化', cw / 2, ch * 0.25);
            g.fillText('酒', cw / 2, ch * 0.47);
            g.shadowBlur = 0;
            g.fillStyle = 'rgba(255, 42, 109, 1)';
            g.font = '700 ' + Math.round(cw * 0.12) + 'px ' + CYBER_SIGN_FONT;
            g.fillText('¥2,077', cw / 2, ch * 0.66);
            g.fillStyle = 'rgba(240, 236, 230, 0.9)';
            var x = cw * 0.2;
            while (x < cw * 0.8) {
                var bar = 1 + Math.floor(Math.random() * 3);
                g.fillRect(x, ch * 0.76, bar, ch * 0.12);
                x += bar + 1 + Math.floor(Math.random() * 3);
            }
        }) });
        return ads;
    };

    const initializeCyberSkyline = function () {
        cyberSkyline = [];
        cyberFar = [];
        cyberRain = [];
        cyberSpinners = [];
        cyberFlares = [];
        cyberBillboards = [];
        cyberArcology = null;
        if (!backdropContext || getTheme() !== 'cyberpunk') return;
        var horizon = backdropHeight * 0.62;
        var keepOut = cyberKeepOut();
        var column = keepOut.column;
        var x = -60;
        while (x < backdropWidth + 60) {
            var farWidth = 40 + Math.random() * 90;
            var farHeight = 70 + Math.random() * (Math.random() < 0.2 ? horizon * 0.55 : 160);
            var farLights = [];
            for (var fy = 10; fy < farHeight - 6; fy += 14) {
                for (var fx = 6; fx < farWidth - 6; fx += 11) {
                    if (Math.random() < 0.07) farLights.push({ x: fx, y: fy });
                }
            }
            cyberFar.push({ x: x, w: farWidth, h: farHeight, lights: farLights, beacon: farHeight > 200 });
            x += farWidth + Math.random() * 30;
        }
        // One stepped pyramid in the haze, in the wider of the two clear margins (left of the
        // rail, right of the column).
        cyberArcology = { x: backdropWidth * 0.82, w: Math.min(360, backdropWidth * 0.3), h: Math.min(190, horizon * 0.42) };
        var leftRoom = column ? (keepOut.rail && keepOut.rail.r <= column.l + 20 ? keepOut.rail.l : column.l) : 0;
        var rightRoom = column ? backdropWidth - column.r : 0;
        if (column) cyberArcology.x = rightRoom >= leftRoom ? column.r + rightRoom * 0.55 : leftRoom * 0.45;

        // Near towers: tall beside the column (up to nine tenths of the way to the top of the
        // screen), lower behind it, where the glass panel blurs them.
        x = -20;
        while (x < backdropWidth + 20) {
            var width = 26 + Math.random() * 70;
            var centre = x + width / 2;
            var beside = column && (centre < column.l || centre > column.r);
            var height = beside
                ? horizon * (0.35 + Math.random() * 0.55)
                : 40 + Math.random() * (Math.random() < 0.25 ? 220 : 100);
            var windows = [];
            for (var wy = 8; wy < height - 8; wy += 9) {
                for (var wx = 5; wx < width - 5; wx += 8) {
                    if (Math.random() < 0.16) windows.push({ x: wx, y: wy, tone: Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? 1 : 2), on: Math.random() < 0.85 });
                }
            }
            cyberSkyline.push({ x: x, w: width, h: height, windows: windows, antenna: height > 120 && Math.random() < 0.5, signs: [] });
            x += width + (Math.random() < 0.3 ? 6 + Math.random() * 18 : 0);
        }

        // Neon on most towers, top to bottom: maybe a rooftop sign, then plates and lightboxes
        // down the face, never over the rail (allowing for the parallax drift).
        var drift = backdropWidth * 0.012;
        var clearOfRail = function (left, top, w, h) {
            var rail = keepOut.rail;
            return !rail || left + w + drift < rail.l || left - drift > rail.r || top + h < rail.t || top > rail.b;
        };
        cyberSkyline.forEach(function (tower) {
            if (tower.w < 24 || tower.h < 70) return;
            var top = horizon - tower.h;
            if (tower.h > 160 && !tower.antenna && Math.random() < 0.45) {
                var roof = makeCyberSign('roof');
                roof.ox = (tower.w - roof.w) / 2;
                roof.oy = -roof.h - 8;
                if (clearOfRail(tower.x + roof.ox, top + roof.oy, roof.w, roof.h)) tower.signs.push(roof);
            }
            var cursor = 10 + Math.random() * 30;
            while (cursor < tower.h - 40) {
                if (Math.random() < 0.7) {
                    var sign = makeCyberSign(Math.random() < 0.6 ? 'v' : 'h');
                    if (cursor + sign.h > tower.h - 6) break;
                    sign.ox = sign.kind === 'v'
                        ? (Math.random() < 0.5 ? -sign.w * 0.4 : tower.w - sign.w * 0.6)
                        : Math.max(-sign.w * 0.3, Math.min(tower.w - sign.w * 0.7, (tower.w - sign.w) / 2 + (Math.random() - 0.5) * 20));
                    sign.oy = cursor;
                    if (clearOfRail(tower.x + sign.ox, top + sign.oy, sign.w, sign.h)) tower.signs.push(sign);
                    cursor += sign.h + 30 + Math.random() * 90;
                } else {
                    cursor += 50 + Math.random() * 80;
                }
            }
            tower.signs.forEach(renderCyberSign);
        });

        // A billboard in each clear margin that is wide enough, high on its own pylon.
        if (column) {
            [[0, leftRoom], [column.r, backdropWidth]].forEach(function (span, i) {
                var room = span[1] - span[0];
                if (room < 110) return;
                var bw = Math.round(Math.min(room * 0.72, 220));
                var bh = Math.round(bw * 1.45);
                var by = Math.max(horizon * 0.1, 40);
                if (by + bh > horizon - 60) return;
                cyberBillboards.push({
                    x: span[0] + (room - bw) / 2,
                    y: by,
                    w: bw,
                    h: bh,
                    ads: renderCyberAds(bw, bh),
                    period: 4200 + i * 900,
                    // The second starts one ad along, so the two never show the same one at once
                    // for long.
                    offset: (i * 4200 + 1500) * (1 + Math.random() * 0.1)
                });
            });
        }

        var drops = Math.round(Math.min(260, (backdropWidth * backdropHeight) / 6500));
        for (var d = 0; d < drops; d += 1) {
            var near = Math.random() < 0.3;
            cyberRain.push({
                x: Math.random() * (backdropWidth + 120) - 60,
                y: Math.random() * backdropHeight,
                len: near ? 16 + Math.random() * 14 : 7 + Math.random() * 8,
                speed: near ? 17 + Math.random() * 6 : 9 + Math.random() * 5,
                near: near
            });
        }
        for (var s = 0; s < 4; s += 1) {
            cyberSpinners.push({
                x: Math.random() * backdropWidth,
                y: horizon * (0.12 + Math.random() * 0.5),
                vx: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.9),
                phase: Math.random() * 1000
            });
        }
    };

    // A reflection in the wet floor below a light at x, broken up by ripples.
    const drawCyberReflection = function (ctx, cx, halfWidth, rgb, strength, horizon, now) {
        var floorDepth = (backdropHeight - horizon) * 0.7;
        for (var ry = 3; ry < floorDepth; ry += 3) {
            var fade = 1 - ry / floorDepth;
            var ripple = Math.sin(ry * 0.21 + now / 240 + cx) * 0.5 + Math.sin(ry * 0.07 - now / 410) * 0.5;
            var half = halfWidth * (0.6 + 0.4 * ripple + 0.6 * (1 - fade));
            ctx.fillStyle = cyberRgba(rgb, (strength * fade * fade).toFixed(3));
            ctx.fillRect(cx - half + ripple * 3, horizon + ry, half * 2, 1.6);
        }
    };

    const drawCyberBillboard = function (ctx, board, left, horizon, now, still) {
        var count = board.ads.length;
        var clock = now + board.offset;
        var index = Math.floor(clock / board.period) % count;
        var into = clock % board.period;
        var ad = board.ads[index];
        // The pylon and the frame's struts.
        ctx.fillStyle = 'rgba(6, 8, 13, 0.97)';
        ctx.fillRect(left + board.w * 0.38, board.y + board.h, board.w * 0.24, horizon - board.y - board.h);
        ctx.fillRect(left - 4, board.y - 4, board.w + 8, board.h + 8);
        // The light it throws into the smog.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var cx = left + board.w / 2;
        var cy = board.y + board.h / 2;
        var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, board.w * 1.3);
        glow.addColorStop(0, cyberRgba(ad.rgb, 0.22));
        glow.addColorStop(1, cyberRgba(ad.rgb, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(cx - board.w * 1.3, cy - board.w * 1.3, board.w * 2.6, board.w * 2.6);
        ctx.restore();
        // The screen: steady with a slight shimmer, now and then a dropout, and a glitch as
        // one ad hands over to the next.
        ctx.globalAlpha = still ? 0.92 : (Math.random() < 0.012 ? 0.45 : 0.86 + Math.random() * 0.08);
        if (!still && into < 320) {
            var previous = board.ads[(index + count - 1) % count].image;
            var strips = 9;
            var stripH = board.h / strips;
            for (var i = 0; i < strips; i += 1) {
                var source = Math.random() < into / 320 ? ad.image : previous;
                var dx = (Math.random() - 0.5) * board.w * 0.3;
                ctx.drawImage(source, 0, i * stripH, board.w, stripH, left + dx, board.y + i * stripH, board.w, stripH);
            }
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = Math.random() < 0.5 ? 'rgba(46, 242, 255, 0.25)' : 'rgba(255, 42, 109, 0.25)';
            ctx.fillRect(left, board.y + Math.random() * board.h, board.w, 3 + Math.random() * 10);
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.drawImage(ad.image, left, board.y);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = cyberRgba(ad.rgb, 0.6);
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, board.y + 0.5, board.w - 1, board.h - 1);
        drawCyberReflection(ctx, cx, board.w * 0.3, ad.rgb, 0.16, horizon, now);
    };

    const drawCyberpunkBackdrop = function (timestamp) {
        if (!backdropContext || getTheme() !== 'cyberpunk') {
            if (backdropContext) backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            backdropFrame = null;
            return;
        }
        if (!media.matches && timestamp && (timestamp - lastBackdropTimestamp) < (1000 / MAX_BACKDROP_FPS)) {
            backdropFrame = window.requestAnimationFrame(drawCyberpunkBackdrop);
            return;
        }
        lastBackdropTimestamp = timestamp || 0;
        var now = timestamp || 0;
        var still = media.matches;
        var ctx = backdropContext;
        var horizon = backdropHeight * 0.62;
        var vanishX = (backdropWidth * 0.5) + ((currentX - (backdropWidth * 0.5)) * 0.12);
        ctx.clearRect(0, 0, backdropWidth, backdropHeight);

        // Smog: dark blue overhead, sodium orange and a little magenta down at the horizon.
        var smog = ctx.createLinearGradient(0, 0, 0, horizon);
        smog.addColorStop(0, 'rgba(10, 16, 34, 0)');
        smog.addColorStop(0.45, 'rgba(40, 30, 70, 0.16)');
        smog.addColorStop(0.8, 'rgba(160, 70, 90, 0.24)');
        smog.addColorStop(1, 'rgba(255, 140, 60, 0.36)');
        ctx.fillStyle = smog;
        ctx.fillRect(0, 0, backdropWidth, horizon);

        // Searchlights from below the skyline, sweeping slowly through the cloud.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        [0.3, 0.7].forEach(function (at, i) {
            var baseX = backdropWidth * at;
            var angle = Math.sin((still ? 0.9 : now / (5200 + i * 1700)) + i * 2.1) * 0.55;
            var reach = horizon * 1.15;
            var tipX = baseX + Math.sin(angle) * reach;
            var tipY = horizon - Math.cos(angle) * reach;
            var beam = ctx.createLinearGradient(baseX, horizon, tipX, tipY);
            beam.addColorStop(0, 'rgba(200, 225, 255, 0.16)');
            beam.addColorStop(1, 'rgba(200, 225, 255, 0)');
            ctx.fillStyle = beam;
            var spread = reach * 0.07;
            ctx.beginPath();
            ctx.moveTo(baseX - 3, horizon);
            ctx.lineTo(tipX - Math.cos(angle) * spread, tipY - Math.sin(angle) * spread);
            ctx.lineTo(tipX + Math.cos(angle) * spread, tipY + Math.sin(angle) * spread);
            ctx.lineTo(baseX + 3, horizon);
            ctx.closePath();
            ctx.fill();
        });
        ctx.restore();

        // Far layer: megastructures and the arcology, pale with distance.
        var farShift = (currentX - (backdropWidth * 0.5)) * -0.008;
        ctx.fillStyle = 'rgba(38, 30, 46, 0.92)';
        cyberFar.forEach(function (tower) {
            ctx.fillRect(tower.x + farShift, horizon - tower.h, tower.w, tower.h);
        });
        if (cyberArcology) {
            var arc = cyberArcology;
            var steps = 9;
            for (var step = 0; step < steps; step += 1) {
                var stepW = arc.w * (1 - step / steps);
                var stepH = arc.h / steps;
                var stepTop = horizon - (step + 1) * stepH;
                ctx.fillStyle = 'rgba(34, 27, 40, 0.96)';
                ctx.fillRect(arc.x + farShift - stepW / 2, stepTop, stepW, stepH + 0.5);
                ctx.fillStyle = 'rgba(255, 190, 120, 0.4)';
                for (var lx = -stepW / 2 + 6; lx < stepW / 2 - 6; lx += 7) {
                    if (((lx * 13 + step * 7) | 0) % 5 !== 0) ctx.fillRect(arc.x + farShift + lx, stepTop + stepH * 0.45, 2, 1);
                }
            }
        }
        cyberFar.forEach(function (tower) {
            var left = tower.x + farShift;
            var top = horizon - tower.h;
            ctx.fillStyle = 'rgba(255, 176, 102, 0.32)';
            tower.lights.forEach(function (light) {
                ctx.fillRect(left + light.x, top + light.y, 2, 2);
            });
            if (tower.beacon) {
                ctx.fillStyle = 'rgba(255, 59, 92, ' + (Math.sin(now / 900 + tower.x) > 0.6 ? 0.9 : 0.25) + ')';
                ctx.fillRect(left + tower.w / 2 - 1, top - 2, 3, 3);
            }
        });

        // Ground fog over the foot of the far layer.
        var fog = ctx.createLinearGradient(0, horizon - 170, 0, horizon);
        fog.addColorStop(0, 'rgba(255, 140, 70, 0)');
        fog.addColorStop(1, 'rgba(255, 140, 70, 0.26)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, horizon - 170, backdropWidth, 170);

        // Flare stacks: now and then a column of fire bursts behind the near skyline.
        if (!still && Math.random() < 0.006 && cyberFlares.length < 2) {
            cyberFlares.push({ x: Math.random() * backdropWidth, life: 1, height: 50 + Math.random() * 60 });
        }
        cyberFlares = cyberFlares.filter(function (flare) {
            var glow = Math.sin(flare.life * Math.PI);
            var fire = ctx.createRadialGradient(flare.x, horizon - 30, 0, flare.x, horizon - 30, flare.height * 1.6);
            fire.addColorStop(0, 'rgba(255, 210, 120, ' + (0.6 * glow).toFixed(3) + ')');
            fire.addColorStop(0.3, 'rgba(255, 120, 40, ' + (0.32 * glow).toFixed(3) + ')');
            fire.addColorStop(1, 'rgba(255, 80, 30, 0)');
            ctx.fillStyle = fire;
            ctx.fillRect(flare.x - flare.height * 1.6, horizon - 30 - flare.height * 1.6, flare.height * 3.2, flare.height * 3.2);
            ctx.fillStyle = 'rgba(255, 220, 150, ' + (0.7 * glow).toFixed(3) + ')';
            ctx.fillRect(flare.x - 2, horizon - 20 - flare.height * glow, 4, flare.height * glow);
            flare.life -= 0.022;
            return flare.life > 0;
        });

        // Near skyline, with a slight parallax against the pointer.
        var shift = (currentX - (backdropWidth * 0.5)) * -0.02;
        var tones = ['255, 174, 66', '46, 242, 255', '255, 42, 109'];
        var lit = [];
        cyberSkyline.forEach(function (tower) {
            var left = tower.x + shift;
            var top = horizon - tower.h;
            ctx.fillStyle = 'rgba(6, 8, 13, 0.97)';
            ctx.fillRect(left, top, tower.w, tower.h);
            ctx.fillStyle = 'rgba(255, 150, 90, 0.16)';
            ctx.fillRect(left, top, tower.w, 1);
            if (tower.antenna) {
                ctx.fillRect(left + (tower.w / 2), top - 24, 1, 24);
                ctx.fillStyle = 'rgba(255, 59, 92, ' + (0.4 + (0.5 * Math.abs(Math.sin((now / 600) + tower.x)))).toFixed(3) + ')';
                ctx.fillRect(left + (tower.w / 2) - 1, top - 26, 3, 3);
            }
            tower.windows.forEach(function (light) {
                if (!still && Math.random() < 0.004) light.on = !light.on;
                if (!light.on) return;
                ctx.fillStyle = 'rgba(' + tones[light.tone] + ', 0.5)';
                ctx.fillRect(left + light.x, top + light.y, 3, 2);
            });
            tower.signs.forEach(function (sign) {
                lit.push({ sign: sign, x: left + sign.ox, y: top + sign.oy, roofY: top });
            });
        });

        // The signs; a tube fails now and then and buzzes back.
        lit.forEach(function (item) {
            var sign = item.sign;
            if (!still && now > sign.offUntil && Math.random() < 0.0015) sign.offUntil = now + 80 + Math.random() * 900;
            item.on = still || now > sign.offUntil || Math.random() < 0.15;
            if (sign.kind === 'roof') {
                ctx.fillStyle = 'rgba(30, 26, 36, 0.95)';
                ctx.fillRect(item.x + sign.w * 0.2, item.y + sign.h, 1, item.roofY - item.y - sign.h);
                ctx.fillRect(item.x + sign.w * 0.8, item.y + sign.h, 1, item.roofY - item.y - sign.h);
            }
            ctx.drawImage(item.on ? sign.lit : sign.dark, item.x - sign.pad, item.y - sign.pad);
        });

        // Billboards, on the near layer.
        cyberBillboards.forEach(function (board) {
            drawCyberBillboard(ctx, board, board.x + shift, horizon, now, still);
        });

        // Spinners: a white running light, a blinking red one, a short smear behind.
        cyberSpinners.forEach(function (spinner) {
            if (!still) {
                spinner.x += spinner.vx;
                if (spinner.x < -40 || spinner.x > backdropWidth + 40) {
                    spinner.vx = (spinner.x < 0 ? 1 : -1) * (0.4 + Math.random() * 0.9);
                    spinner.y = horizon * (0.12 + Math.random() * 0.5);
                }
            }
            var trail = ctx.createLinearGradient(spinner.x, 0, spinner.x - spinner.vx * 26, 0);
            trail.addColorStop(0, 'rgba(220, 235, 255, 0.35)');
            trail.addColorStop(1, 'rgba(220, 235, 255, 0)');
            ctx.fillStyle = trail;
            ctx.fillRect(Math.min(spinner.x, spinner.x - spinner.vx * 26), spinner.y, Math.abs(spinner.vx * 26), 1);
            ctx.fillStyle = 'rgba(235, 245, 255, 0.85)';
            ctx.fillRect(spinner.x - 1, spinner.y - 1, 3, 2);
            if (Math.sin((now + spinner.phase) / 260) > 0.5) {
                ctx.fillStyle = 'rgba(255, 59, 92, 0.9)';
                ctx.fillRect(spinner.x - spinner.vx * 4, spinner.y + 2, 2, 2);
            }
        });

        // Horizon line.
        ctx.fillStyle = 'rgba(255, 110, 90, 0.6)';
        ctx.fillRect(0, horizon, backdropWidth, 1.5);

        // Wet floor: each lit sign smears down into it.
        lit.forEach(function (item) {
            if (!item.on) return;
            drawCyberReflection(ctx, item.x + item.sign.w / 2, Math.min(item.sign.w * 0.35, 24), item.sign.rgb, 0.24, horizon, now);
        });

        // Floor grid: rays from the vanishing point, and cross lines that run toward the
        // viewer, spaced by perspective. Fainter than the neon; the rain is the weather here.
        ctx.lineWidth = 1;
        for (var ray = -24; ray <= 24; ray += 1) {
            var footX = vanishX + (ray * backdropWidth / 9);
            var rayGradient = ctx.createLinearGradient(0, horizon, 0, backdropHeight);
            rayGradient.addColorStop(0, 'rgba(46, 242, 255, 0)');
            rayGradient.addColorStop(1, 'rgba(46, 242, 255, 0.3)');
            ctx.strokeStyle = rayGradient;
            ctx.beginPath();
            ctx.moveTo(vanishX, horizon);
            ctx.lineTo(footX, backdropHeight);
            ctx.stroke();
        }
        if (!still) cyberGridOffset = (cyberGridOffset + 0.012) % 1;
        var depth = backdropHeight - horizon;
        for (var line = 0; line < 14; line += 1) {
            var t = (line + cyberGridOffset) / 14;
            var y = horizon + (depth * t * t);
            ctx.strokeStyle = 'rgba(46, 242, 255, ' + (0.05 + (0.28 * t)).toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(backdropWidth, y);
            ctx.stroke();
        }

        // Rain, slanting a little; drops near the pointer catch the light. None when still.
        if (!still) {
            var slant = 0.16;
            var rail = cyberKeepOut().rail;
            var far = new Path2D();
            var close = new Path2D();
            var bright = new Path2D();
            cyberRain.forEach(function (drop) {
                drop.y += drop.speed;
                drop.x += drop.speed * slant;
                if (drop.y - drop.len > backdropHeight) {
                    drop.y = -drop.len - Math.random() * 60;
                    drop.x = Math.random() * (backdropWidth + 120) - 60 - backdropHeight * slant;
                }
                if (rail && drop.x > rail.l && drop.x < rail.r && drop.y > rail.t && drop.y - drop.len < rail.b) return;
                var near = Math.abs(drop.x - currentX) < 150 && Math.abs(drop.y - currentY) < 150 &&
                    Math.hypot(drop.x - currentX, drop.y - currentY) < 150;
                var path = near && pointerActive ? bright : (drop.near ? close : far);
                path.moveTo(drop.x, drop.y);
                path.lineTo(drop.x - drop.len * slant, drop.y - drop.len);
            });
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(170, 195, 225, 0.16)';
            ctx.stroke(far);
            ctx.strokeStyle = 'rgba(190, 210, 235, 0.3)';
            ctx.stroke(close);
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = 'rgba(225, 240, 255, 0.7)';
            ctx.stroke(bright);
        }

        drawCyberGlass(now, still);

        backdropFrame = still ? null : window.requestAnimationFrame(drawCyberpunkBackdrop);
    };

    // Rain on the glass. The content panel is a pane of frosted glass (cyberpunk.css); this
    // canvas sits inside it, over its background and under its text (z-index -1 in the
    // panel's stacking context), one screen tall and kept in view as the page scrolls. Beads
    // gather on the pane; now and then a heavy one runs down, swallowing the beads in its
    // way and leaving a line of tiny ones behind.
    const cyberPanel = function () {
        return document.querySelector('.site-main > .content-page, .site-main > .blog-content');
    };

    const cyberBeadSprite = (function () {
        var sprite = null;
        return function () {
            if (sprite) return sprite;
            sprite = document.createElement('canvas');
            sprite.width = 32;
            sprite.height = 32;
            var g = sprite.getContext('2d');
            var body = g.createRadialGradient(16, 18, 2, 16, 16, 14);
            body.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
            body.addColorStop(0.75, 'rgba(255, 255, 255, 0.1)');
            body.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
            g.fillStyle = body;
            g.beginPath();
            g.arc(16, 16, 14, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = 'rgba(255, 190, 150, 0.55)';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(16, 16, 12.5, 0.15 * Math.PI, 0.85 * Math.PI);
            g.stroke();
            g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(16, 16, 13.5, 1.1 * Math.PI, 1.9 * Math.PI);
            g.stroke();
            g.fillStyle = 'rgba(255, 255, 255, 0.8)';
            g.beginPath();
            g.arc(11, 10, 2.6, 0, Math.PI * 2);
            g.fill();
            return sprite;
        };
    }());

    const newCyberBead = function (glass) {
        return { x: Math.random() * glass.w, y: Math.random() * glass.h, r: 1.2 + Math.pow(Math.random(), 2.5) * 5 };
    };

    // Keep the pane's canvas over the part of the panel that is on screen.
    const positionCyberGlass = function () {
        var glass = cyberGlass;
        if (!glass) return;
        var rect = glass.panel.getBoundingClientRect();
        var offset = Math.max(0, Math.min(-rect.top, rect.height - glass.h));
        glass.canvas.style.transform = 'translateY(' + Math.round(offset) + 'px)';
    };

    const syncCyberGlass = function () {
        var panel = cyberPanel();
        // Not with reduced motion: the pane only makes sense with the rain running.
        if (getTheme() !== 'cyberpunk' || !panel || media.matches) {
            if (cyberGlass) {
                cyberGlass.canvas.remove();
                cyberGlass = null;
            }
            return;
        }
        if (!cyberGlass || cyberGlass.panel !== panel) {
            if (cyberGlass) cyberGlass.canvas.remove();
            var canvas = document.createElement('canvas');
            canvas.className = 'cp-glass';
            canvas.setAttribute('aria-hidden', 'true');
            panel.appendChild(canvas);
            cyberGlass = { panel: panel, canvas: canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, beads: [], runs: [], trail: [] };
        }
        var glass = cyberGlass;
        var w = glass.panel.clientWidth;
        var h = Math.min(window.innerHeight, glass.panel.clientHeight);
        if (w === glass.w && h === glass.h) return;
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        glass.w = w;
        glass.h = h;
        glass.canvas.width = Math.round(w * ratio);
        glass.canvas.height = Math.round(h * ratio);
        glass.canvas.style.width = w + 'px';
        glass.canvas.style.height = h + 'px';
        glass.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        glass.target = Math.round((w * h) / 5200);
        glass.beads = [];
        glass.runs = [];
        glass.trail = [];
        for (var i = 0; i < glass.target; i += 1) glass.beads.push(newCyberBead(glass));
    };

    const drawCyberGlass = function (now, still) {
        var glass = cyberGlass;
        if (!glass || !glass.panel.isConnected) return;
        positionCyberGlass();
        var ctx = glass.ctx;
        var sprite = cyberBeadSprite();
        ctx.clearRect(0, 0, glass.w, glass.h);
        if (!still) {
            if (glass.beads.length < glass.target && Math.random() < 0.5) glass.beads.push(newCyberBead(glass));
            if (glass.runs.length < 4 && Math.random() < 0.035) {
                var heavy = glass.beads.filter(function (bead) { return bead.r > 3.4; });
                if (heavy.length) {
                    var start = heavy[Math.floor(Math.random() * heavy.length)];
                    glass.beads.splice(glass.beads.indexOf(start), 1);
                    glass.runs.push({ x: start.x, y: start.y, r: start.r + 0.6, vy: 0.4, wob: Math.random() * 10, lastDrop: start.y });
                }
            }
            glass.runs = glass.runs.filter(function (run) {
                run.vy = Math.min(run.vy + 0.15, 2.2 + run.r);
                run.y += run.vy;
                run.x += Math.sin(run.y * 0.05 + run.wob) * 0.35;
                glass.beads = glass.beads.filter(function (bead) {
                    if (Math.abs(bead.x - run.x) > run.r + bead.r || Math.abs(bead.y - run.y) > run.r + bead.r) return true;
                    run.r = Math.min(run.r + bead.r * 0.2, 7);
                    return false;
                });
                if (run.y - run.lastDrop > 5) {
                    glass.trail.push({ x: run.x + (Math.random() - 0.5), y: run.y - run.r, r: 0.8 + Math.random() * 1.2, born: now });
                    run.lastDrop = run.y;
                    run.r = Math.max(3, run.r - 0.02);
                }
                return run.y - run.r < glass.h;
            });
            glass.trail = glass.trail.filter(function (bead) { return now - bead.born < 4000; });
        }
        // The wet line a run leaves, then the beads, then the runs themselves.
        glass.trail.forEach(function (bead) {
            ctx.globalAlpha = 1 - (now - bead.born) / 4000;
            ctx.drawImage(sprite, bead.x - bead.r, bead.y - bead.r, bead.r * 2, bead.r * 2);
        });
        ctx.globalAlpha = 1;
        glass.beads.forEach(function (bead) {
            ctx.drawImage(sprite, bead.x - bead.r, bead.y - bead.r, bead.r * 2, bead.r * 2);
        });
        glass.runs.forEach(function (run) {
            ctx.drawImage(sprite, run.x - run.r, run.y - run.r * 1.25, run.r * 2, run.r * 2.5);
        });
    };

    // The panel's readout strip (cyberpunk.css): a node number and coordinates taken from
    // the page's path, and a clock with a signal meter.
    const syncCyberHud = function () {
        var panel = cyberPanel();
        if (getTheme() !== 'cyberpunk' || !panel) {
            if (cyberHud) {
                cyberHud.remove();
                cyberHud = null;
            }
            if (cyberHudTimer) {
                window.clearInterval(cyberHudTimer);
                cyberHudTimer = null;
            }
            return;
        }
        if (!cyberHud || cyberHud.parentNode !== panel) {
            if (cyberHud) cyberHud.remove();
            var hash = 0;
            for (var i = 0; i < location.pathname.length; i += 1) hash = ((hash * 31) + location.pathname.charCodeAt(i)) >>> 0;
            var node = ('0' + (hash % 97)).slice(-2);
            var lat = (35.5 + (hash % 1000) / 2500).toFixed(4);
            var lon = (139.5 + ((hash >>> 10) % 1000) / 2500).toFixed(4);
            cyberHud = document.createElement('div');
            cyberHud.className = 'cp-hud';
            cyberHud.setAttribute('aria-hidden', 'true');
            cyberHud.innerHTML = '<span>Node ' + node + '<span class="cp-hud__coords"> // ' + lat + 'N ' + lon + 'E</span></span><span class="cp-hud__clock"></span>';
            panel.appendChild(cyberHud);
        }
        var clock = cyberHud.querySelector('.cp-hud__clock');
        var tick = function () {
            var time = new Date();
            var pad = function (n) { return ('0' + n).slice(-2); };
            var level = 2 + Math.floor(Math.random() * 3);
            clock.textContent = pad(time.getHours()) + ':' + pad(time.getMinutes()) + ':' + pad(time.getSeconds()) +
                ' // SIG ' + '▮▮▮▮'.slice(0, level) + '▯▯▯▯'.slice(0, 4 - level);
        };
        tick();
        if (!cyberHudTimer) cyberHudTimer = window.setInterval(tick, 1000);
    };

    // Now and then (every 45-90 s) the page title replays the glitch it came in with
    // (cp-glitch in cyberpunk.css). Not with reduced motion, and not in a hidden tab.
    const scheduleCyberGlitch = function () {
        if (cyberGlitchTimer) window.clearTimeout(cyberGlitchTimer);
        cyberGlitchTimer = null;
        if (getTheme() !== 'cyberpunk' || media.matches) return;
        cyberGlitchTimer = window.setTimeout(function () {
            var title = document.querySelector('.section-heading__title, .blog-content h1');
            if (title && !document.hidden && getTheme() === 'cyberpunk') {
                title.style.animation = 'none';
                void title.offsetWidth;
                title.style.animation = '';
            }
            scheduleCyberGlitch();
        }, 45000 + Math.random() * 45000);
    };

    // Japanese under-titles for the section labels and the rail's links (shown by
    // cyberpunk.css only).
    const CYBER_JP = {
        'Latest writing': '最新記録', 'Selected work': '作品選', 'Photography': '写真', 'Profile': '経歴',
        'Legal': '規約', 'Projects': '作品', 'Runs in the browser': 'ブラウザ実行', 'Writing': '記録',
        'Browse by area': '分野', 'Browse by topic': '話題', 'Area': '分野', 'Topic': '話題',
        'Error 404': '接続失敗', 'Photos': '写真', 'About': '素性'
    };
    const labelCyberJapanese = function () {
        document.querySelectorAll('.section-heading__eyebrow, .site-nav__link').forEach(function (el) {
            var text = el.textContent.trim();
            var jp = CYBER_JP[text] || (/^Loaf \d+$/.test(text) ? 'パン' : '');
            if (jp) el.setAttribute('data-jp', jp);
        });
    };

    const syncCyberpunkChrome = function () {
        syncCyberGlass();
        syncCyberHud();
        scheduleCyberGlitch();
    };

    // Cyberpunk, over the page: a holographic scan ring where the pointer clicks.
    const drawCyberOverlay = function (ctx, now) {
        cyberRings = cyberRings.filter(function (ring) {
            var age = (now - ring.born) / 650;
            if (age >= 1) return false;
            var ease = 1 - Math.pow(1 - age, 3);
            var radius = 8 + 84 * ease;
            var alpha = 1 - age;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(46, 242, 255, ' + (0.85 * alpha).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 42, 109, ' + (0.6 * alpha).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(ring.x + 2, ring.y, radius * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(46, 242, 255, ' + alpha.toFixed(3) + ')';
            ctx.beginPath();
            for (var k = 0; k < 4; k += 1) {
                var angle = (k * Math.PI / 2) + ease * Math.PI / 2;
                ctx.moveTo(ring.x + Math.cos(angle) * (radius + 3), ring.y + Math.sin(angle) * (radius + 3));
                ctx.lineTo(ring.x + Math.cos(angle) * (radius + 11), ring.y + Math.sin(angle) * (radius + 11));
            }
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 174, 66, ' + alpha.toFixed(3) + ')';
            ctx.fillRect(ring.x - 1.5, ring.y - 1.5, 3, 3);
            return true;
        });
    };

    const drawOverlay = function (timestamp) {
        if (!overlayContext || media.matches || !hasReactiveOverlay()) {
            if (overlayContext) overlayContext.clearRect(0, 0, overlayWidth, overlayHeight);
            overlayFrame = null;
            return;
        }
        if (timestamp && (timestamp - lastOverlayTimestamp) < (1000 / MAX_OVERLAY_FPS)) {
            overlayFrame = window.requestAnimationFrame(drawOverlay);
            return;
        }
        lastOverlayTimestamp = timestamp || 0;
        overlayContext.clearRect(0, 0, overlayWidth, overlayHeight);
        var palette = getThemeParticlePalette();
        var theme = getTheme();
        var glowRadius = theme === 'matrix' ? 52 : theme === 'win31' ? 18 : theme === 'industrial' ? 24 : theme === 'minimalist' ? 34 : 64;
        var outerRadius = theme === 'matrix' ? 84 : theme === 'win31' ? 34 : theme === 'industrial' ? 42 : theme === 'minimalist' ? 58 : 102;

        // Matrix draws nothing at the pointer itself: the code rain answers it instead (see
        // drawMatrixBackdrop), and glyphs drip from where it moves (spawnMatrixDrip).
        if (theme !== 'matrix') {
        var coreGlow = overlayContext.createRadialGradient(currentX, currentY, 0, currentX, currentY, glowRadius);
        coreGlow.addColorStop(0, 'rgba(' + palette.core[0] + ', ' + (theme === 'win31' ? '0.16' : theme === 'minimalist' ? '0.12' : '0.28') + ')');
        coreGlow.addColorStop(0.35, 'rgba(' + palette.core[0] + ', ' + (theme === 'win31' ? '0.06' : theme === 'minimalist' ? '0.05' : '0.12') + ')');
        coreGlow.addColorStop(1, 'rgba(' + palette.core[0] + ', 0)');
        overlayContext.fillStyle = coreGlow;
        overlayContext.beginPath();
        overlayContext.arc(currentX, currentY, glowRadius, 0, Math.PI * 2);
        overlayContext.fill();

        var secondaryGlow = overlayContext.createRadialGradient(currentX, currentY, 0, currentX, currentY, outerRadius);
        secondaryGlow.addColorStop(0, 'rgba(' + palette.core[1] + ', ' + (theme === 'minimalist' ? '0.05' : '0.08') + ')');
        secondaryGlow.addColorStop(1, 'rgba(' + palette.core[1] + ', 0)');
        overlayContext.fillStyle = secondaryGlow;
        overlayContext.beginPath();
        overlayContext.arc(currentX, currentY, outerRadius, 0, Math.PI * 2);
        overlayContext.fill();
        }

        if (theme === 'win31') {
            overlayContext.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            overlayContext.lineWidth = 1;
            overlayContext.strokeRect(Math.round(currentX - 7) + 0.5, Math.round(currentY - 7) + 0.5, 14, 14);
            overlayContext.strokeStyle = 'rgba(0, 0, 128, 0.55)';
            overlayContext.strokeRect(Math.round(currentX - 3) + 0.5, Math.round(currentY - 3) + 0.5, 6, 6);
        } else if (theme === 'industrial') {
            overlayContext.strokeStyle = 'rgba(214, 82, 16, 0.45)';
            overlayContext.lineWidth = 1.4;
            overlayContext.beginPath();
            overlayContext.moveTo(currentX - 16, currentY);
            overlayContext.lineTo(currentX + 16, currentY);
            overlayContext.moveTo(currentX, currentY - 16);
            overlayContext.lineTo(currentX, currentY + 16);
            overlayContext.stroke();
            overlayContext.beginPath();
            overlayContext.fillStyle = 'rgba(255, 236, 214, 0.6)';
            overlayContext.arc(currentX, currentY, 3.2, 0, Math.PI * 2);
            overlayContext.fill();
        }

        particles = particles.filter(function (particle) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            if (particle.drip) {
                particle.vy += 0.09;
                particle.vx *= 0.94;
                if (Math.random() < 0.18) particle.glyph = randomGlyph();
            } else {
                particle.vx *= particle.isGlyph ? 0.978 : 0.985;
                particle.vy *= particle.isGlyph ? 0.978 : 0.985;
            }
            particle.life -= 1;
            var alpha = Math.max(0, particle.life / particle.maxLife);
            if (alpha <= 0) return false;
            overlayContext.shadowBlur = particle.isPixel ? 0 : 8;
            overlayContext.shadowColor = 'rgba(' + particle.hue + ', ' + (alpha * 0.75).toFixed(3) + ')';
            if (particle.isGlyph) {
                // A drip starts as a white head and cools to green as it falls.
                var hue = particle.drip && alpha > 0.72 ? '232, 255, 236' : particle.hue;
                overlayContext.fillStyle = 'rgba(' + hue + ', ' + (alpha * 0.95).toFixed(3) + ')';
                overlayContext.font = Math.max(11, Math.round(10 + particle.size * 2)) + 'px "IBM Plex Mono", "Courier New", monospace';
                overlayContext.fillText(particle.glyph, particle.x, particle.y);
            } else if (particle.isPixel) {
                overlayContext.fillStyle = 'rgba(' + particle.hue + ', ' + (alpha * 0.92).toFixed(3) + ')';
                var size = Math.max(2, Math.round(particle.size * alpha * 1.4));
                overlayContext.fillRect(Math.round(particle.x), Math.round(particle.y), size, size);
            } else {
                overlayContext.beginPath();
                overlayContext.fillStyle = 'rgba(' + particle.hue + ', ' + (alpha * 0.95).toFixed(3) + ')';
                overlayContext.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
                overlayContext.fill();
            }
            return true;
        });
        overlayContext.shadowBlur = 0;
        if (theme === 'cyberpunk') drawCyberOverlay(overlayContext, timestamp || performance.now());
        if (particles.length > 0 || cyberRings.length > 0 ||
            Math.abs(targetX - currentX) > 0.3 || Math.abs(targetY - currentY) > 0.3) {
            overlayFrame = window.requestAnimationFrame(drawOverlay);
        } else {
            overlayFrame = null;
        }
    };

    const queueOverlay = function () {
        if (!overlayFrame && !media.matches && hasReactiveOverlay()) {
            overlayFrame = window.requestAnimationFrame(drawOverlay);
        }
    };

    const queueBackdrop = function () {
        if (backdropFrame || !hasDynamicBackdrop()) return;
        // Reduced motion: the circuit board and the city are drawn once and still; matrix is not.
        if (media.matches && getTheme() === 'matrix') return;
        if (getTheme() === 'industrial') {
            backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
        } else if (getTheme() === 'cyberpunk') {
            backdropFrame = window.requestAnimationFrame(drawCyberpunkBackdrop);
        } else {
            backdropFrame = window.requestAnimationFrame(drawMatrixBackdrop);
        }
    };

    const animate = function () {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        applyPointerState();
        if (hasReactiveOverlay()) queueOverlay();
        if (hasDynamicBackdrop()) queueBackdrop();
        if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
            rafId = window.requestAnimationFrame(animate);
        } else {
            rafId = null;
        }
    };

    const queueAnimation = function () {
        if (!rafId && !media.matches) {
            rafId = window.requestAnimationFrame(animate);
        }
    };

    const handlePointerMove = function (event) {
        var dx = event.clientX - targetX;
        var dy = event.clientY - targetY;
        var velocity = Math.min(1, Math.sqrt((dx * dx) + (dy * dy)) / 36);
        targetX = event.clientX;
        targetY = event.clientY;
        pointerActive = true;
        resetIdleTimer();

        if (getTheme() === 'industrial') {
            if (!overCoveredArea(event.target)) triggerIndustrialCircuit(event.clientX, event.clientY, velocity);
        } else if (getTheme() === 'matrix') {
            // No glyphs over the article: they would fall across the text being read.
            if (!overCoveredArea(event.target)) spawnMatrixDrip(event.clientX, event.clientY, velocity);
        } else if (hasReactiveOverlay()) {
            spawnBurst(event.clientX, event.clientY, velocity);
        }
        queueAnimation();
        if (hasReactiveOverlay()) queueOverlay();
        if (hasDynamicBackdrop()) queueBackdrop();
    };

    const handlePointerDown = function (event) {
        if (getTheme() === 'cyberpunk') {
            cyberRings.push({ x: event.clientX, y: event.clientY, born: performance.now() });
            queueOverlay();
            return;
        }
        if (getTheme() !== 'industrial' || overCoveredArea(event.target)) return;
        burstIndustrialCircuit(event.clientX, event.clientY);
        resetIdleTimer();
        queueBackdrop();
    };

    const resetPointer = function () {
        pointerActive = false;
        targetX = window.innerWidth * 0.5;
        targetY = window.innerHeight * 0.22;
        queueAnimation();
        if (hasReactiveOverlay()) queueOverlay();
        if (hasDynamicBackdrop()) queueBackdrop();
    };

    // ── Gallery tabs (vanilla) ──

    const initGalleryTabs = function () {
        var tabs = document.querySelectorAll('.gallery-tabs__tab');
        var panels = document.querySelectorAll('.gallery-tabs-panel');
        if (tabs.length === 0) return;

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
                tab.setAttribute('aria-selected', 'true');
                panels.forEach(function (p) { p.classList.remove('is-active'); });
                var panelId = tab.getAttribute('aria-controls');
                var panel = document.getElementById(panelId);
                if (panel) panel.classList.add('is-active');
            });
        });
    };

    // ── Carousel (vanilla) ──

    const initCarousel = function (carouselEl) {
        if (!carouselEl) return;
        var inner = carouselEl.querySelector('.carousel__inner');
        var slides = carouselEl.querySelectorAll('.carousel__slide');
        var indicators = carouselEl.querySelectorAll('.carousel__indicator');
        var prevBtn = carouselEl.querySelector('.carousel__btn--prev');
        var nextBtn = carouselEl.querySelector('.carousel__btn--next');
        var currentIndex = 0;
        var autoplayInterval = null;

        var goToSlide = function (index) {
            if (index < 0) index = slides.length - 1;
            if (index >= slides.length) index = 0;
            currentIndex = index;
            inner.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
            indicators.forEach(function (ind, i) {
                ind.classList.toggle('is-active', i === currentIndex);
            });
        };

        var startAutoplay = function () {
            stopAutoplay();
            autoplayInterval = setInterval(function () {
                goToSlide(currentIndex + 1);
            }, 4000);
        };

        var stopAutoplay = function () {
            if (autoplayInterval) {
                clearInterval(autoplayInterval);
                autoplayInterval = null;
            }
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', function () {
                goToSlide(currentIndex - 1);
                startAutoplay();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function () {
                goToSlide(currentIndex + 1);
                startAutoplay();
            });
        }
        indicators.forEach(function (ind, i) {
            ind.addEventListener('click', function () {
                goToSlide(i);
                startAutoplay();
            });
        });

        // Touch swipe support
        var touchStartX = 0;
        var touchEndX = 0;

        carouselEl.addEventListener('touchstart', function (event) {
            touchStartX = event.changedTouches[0].screenX;
            stopAutoplay();
        }, { passive: true });

        carouselEl.addEventListener('touchend', function (event) {
            touchEndX = event.changedTouches[0].screenX;
            handleSwipe();
            startAutoplay();
        }, { passive: true });

        var handleSwipe = function () {
            var swipeThreshold = 50; // pixels
            if (touchEndX < touchStartX - swipeThreshold) {
                goToSlide(currentIndex + 1);
            } else if (touchEndX > touchStartX + swipeThreshold) {
                goToSlide(currentIndex - 1);
            }
        };

        // Pause autoplay on hover
        carouselEl.addEventListener('mouseenter', stopAutoplay);
        carouselEl.addEventListener('mouseleave', startAutoplay);

        startAutoplay();
    };

    const initCarousels = function () {
        var carousels = document.querySelectorAll('.carousel');
        carousels.forEach(function (carousel) { initCarousel(carousel); });
    };

    // ── Footer year ──

    const initFooterYear = function () {
        var footerYear = document.getElementById('footer-year');
        if (!footerYear) return;
        var year = new Date().getFullYear();
        footerYear.textContent = year > 2009 ? ' \u2013 ' + year : '';
    };

    // ── Matrix: the page title is typed out ──
    // The untyped rest of the title is in the line already, only hidden, so the heading keeps
    // its final size and nothing below it moves. Screen readers get the whole title from
    // aria-label while it types. Not with reduced motion, and only on a page load.
    const typeMatrixTitle = function (onDone) {
        var done = onDone || function () {};
        if (getTheme() !== 'matrix' || media.matches) return done();
        var title = document.querySelector('.section-heading__title, .blog-content h1');
        if (!title || title.children.length) return done();
        var text = title.textContent;
        if (!text.trim()) return done();
        var typed = document.createElement('span');
        var cursor = document.createElement('span');
        var rest = document.createElement('span');
        typed.setAttribute('aria-hidden', 'true');
        cursor.className = 'matrix-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        rest.setAttribute('aria-hidden', 'true');
        rest.style.visibility = 'hidden';
        title.setAttribute('aria-label', text);
        title.classList.add('is-typing');
        title.textContent = '';
        title.append(typed, cursor, rest);
        rest.textContent = text;
        var duration = Math.min(1100, Math.max(450, text.length * 32));
        var start = null;
        var step = function (now) {
            if (start === null) start = now;
            var count = Math.min(text.length, Math.round(((now - start) / duration) * text.length));
            typed.textContent = text.slice(0, count);
            rest.textContent = text.slice(count);
            if (count < text.length) {
                window.requestAnimationFrame(step);
                return;
            }
            title.textContent = text;
            title.removeAttribute('aria-label');
            title.classList.remove('is-typing');
            done();
        };
        window.requestAnimationFrame(step);
    };

    // ── Matrix: a post prints block by block ──
    // After the title, each block of the post (paragraph, heading, list, code, table, figure,
    // the footer) appears whole, one after another, as it comes into view: those on screen
    // at load in order, the rest as you scroll to them. Opacity only, so nothing moves and
    // screen readers still have the text. Not with reduced motion.
    const printMatrixBlocks = function () {
        var inner = document.querySelector('.blog-content__inner');
        if (getTheme() !== 'matrix' || media.matches || !inner || !('IntersectionObserver' in window)) return null;
        var blocks = Array.prototype.filter.call(inner.children, function (block) {
            return !block.matches('h1, .blog-post__date, script, style');
        });
        if (blocks.length === 0) return null;
        blocks.forEach(function (block) { block.classList.add('matrix-pending'); });
        var queue = [];
        var running = false;
        var started = false;
        var next = function () {
            if (!started) return;
            var block = queue.shift();
            if (!block) { running = false; return; }
            running = true;
            block.classList.remove('matrix-pending');
            block.classList.add('matrix-printed');
            window.setTimeout(next, 110);
        };
        var observer = new IntersectionObserver(function (entries) {
            entries
                .filter(function (entry) { return entry.isIntersecting; })
                .map(function (entry) { return entry.target; })
                .sort(function (a, b) { return blocks.indexOf(a) - blocks.indexOf(b); })
                .forEach(function (block) {
                    observer.unobserve(block);
                    queue.push(block);
                });
            if (!running) next();
        }, { rootMargin: '0px 0px -8% 0px' });
        blocks.forEach(function (block) { observer.observe(block); });
        return function start() {
            started = true;
            if (!running) next();
        };
    };

    // ── Init ──

    const init = function () {
        resizeOverlay();
        resizeBackdrop();
        labelCyberJapanese();
        setTheme(getTheme());
        var startPrinting = printMatrixBlocks();
        typeMatrixTitle(function () { if (startPrinting) startPrinting(); });
        applyPointerState();
        applyHeaderScrollState();

        if (themeToggle) {
            themeToggle.addEventListener('change', function () {
                setTheme(themeToggle.value);
                resetPointer();
            });
        }

        if (!media.matches) {
            window.addEventListener('pointermove', handlePointerMove, { passive: true });
            window.addEventListener('pointerdown', handlePointerDown, { passive: true });
            window.addEventListener('pointerleave', resetPointer);
            window.addEventListener('blur', resetPointer);
            window.addEventListener('scroll', function () {
                applyHeaderScrollState();
                positionCyberGlass();
            }, { passive: true });
            window.addEventListener('resize', function () {
                resizeOverlay();
                resizeBackdrop();
                syncCyberGlass();
                applyHeaderScrollState();
                resetPointer();
            });
            // Tab visibility: pause when not visible
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                    if (overlayFrame) { cancelAnimationFrame(overlayFrame); overlayFrame = null; }
                    if (backdropFrame) { cancelAnimationFrame(backdropFrame); backdropFrame = null; }
                } else {
                    resetIdleTimer();
                    queueAnimation();
                    if (hasReactiveOverlay()) queueOverlay();
                    if (hasDynamicBackdrop()) queueBackdrop();
                }
            });
            // Start idle timer
            resetIdleTimer();
        }

        // Gallery
        initGalleryTabs();
        initCarousels();
        initFooterYear();
    };

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
