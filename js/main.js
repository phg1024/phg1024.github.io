(function () {
    'use strict';

    const root = document.documentElement;
    const backdrop = document.querySelector('.theme-backdrop');
    const overlay = document.querySelector('.pointer-reactive-overlay');
    const themeToggle = document.getElementById('theme-toggle');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const themeNames = ['minimalist', 'cyberpunk', 'matrix', 'industrial', 'win31'];
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
        return { core: ['46, 242, 255', '252, 238, 10'], sparks: ['252, 238, 10', '255, 59, 92'] };
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

    // Cyberpunk backdrop: a city skyline on a horizon with a neon grid floor running toward
    // the viewer. The vanishing point drifts with the pointer; windows flicker. With reduced
    // motion it is drawn once, still.
    const initializeCyberSkyline = function () {
        cyberSkyline = [];
        if (!backdropContext || getTheme() !== 'cyberpunk') return;
        var x = -20;
        while (x < backdropWidth + 20) {
            var width = 26 + Math.random() * 70;
            var height = 30 + Math.random() * (Math.random() < 0.18 ? 190 : 90);
            var windows = [];
            for (var wy = 8; wy < height - 8; wy += 9) {
                for (var wx = 5; wx < width - 5; wx += 8) {
                    if (Math.random() < 0.16) windows.push({ x: wx, y: wy, tone: Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? 1 : 2), on: Math.random() < 0.85 });
                }
            }
            cyberSkyline.push({ x: x, w: width, h: height, windows: windows, antenna: height > 120 && Math.random() < 0.6 });
            x += width + (Math.random() < 0.3 ? 6 + Math.random() * 18 : 0);
        }
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
        var ctx = backdropContext;
        var horizon = backdropHeight * 0.62;
        var vanishX = (backdropWidth * 0.5) + ((currentX - (backdropWidth * 0.5)) * 0.12);
        ctx.clearRect(0, 0, backdropWidth, backdropHeight);

        // Haze behind the city.
        var haze = ctx.createLinearGradient(0, horizon - 220, 0, horizon);
        haze.addColorStop(0, 'rgba(255, 59, 92, 0)');
        haze.addColorStop(1, 'rgba(255, 59, 92, 0.16)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, horizon - 220, backdropWidth, 220);

        // Skyline, with a slight parallax against the pointer.
        var shift = (currentX - (backdropWidth * 0.5)) * -0.02;
        var tones = ['252, 238, 10', '46, 242, 255', '255, 59, 92'];
        cyberSkyline.forEach(function (tower) {
            var left = tower.x + shift;
            var top = horizon - tower.h;
            ctx.fillStyle = 'rgba(6, 8, 13, 0.96)';
            ctx.fillRect(left, top, tower.w, tower.h);
            ctx.fillStyle = 'rgba(46, 242, 255, 0.18)';
            ctx.fillRect(left, top, tower.w, 1);
            if (tower.antenna) {
                ctx.fillRect(left + (tower.w / 2), top - 24, 1, 24);
                ctx.fillStyle = 'rgba(255, 59, 92, ' + (0.4 + (0.5 * Math.abs(Math.sin(((timestamp || 0) / 600) + tower.x)))).toFixed(3) + ')';
                ctx.fillRect(left + (tower.w / 2) - 1, top - 26, 3, 3);
            }
            tower.windows.forEach(function (light) {
                if (!media.matches && Math.random() < 0.004) light.on = !light.on;
                if (!light.on) return;
                ctx.fillStyle = 'rgba(' + tones[light.tone] + ', 0.55)';
                ctx.fillRect(left + light.x, top + light.y, 3, 2);
            });
        });

        // Horizon line.
        ctx.fillStyle = 'rgba(255, 59, 92, 0.7)';
        ctx.fillRect(0, horizon, backdropWidth, 1.5);

        // Floor grid: rays from the vanishing point, and cross lines that run toward the
        // viewer, spaced by perspective.
        ctx.lineWidth = 1;
        for (var ray = -24; ray <= 24; ray += 1) {
            var footX = vanishX + (ray * backdropWidth / 9);
            var rayGradient = ctx.createLinearGradient(0, horizon, 0, backdropHeight);
            rayGradient.addColorStop(0, 'rgba(46, 242, 255, 0)');
            rayGradient.addColorStop(1, 'rgba(46, 242, 255, 0.5)');
            ctx.strokeStyle = rayGradient;
            ctx.beginPath();
            ctx.moveTo(vanishX, horizon);
            ctx.lineTo(footX, backdropHeight);
            ctx.stroke();
        }
        if (!media.matches) cyberGridOffset = (cyberGridOffset + 0.012) % 1;
        var depth = backdropHeight - horizon;
        for (var line = 0; line < 14; line += 1) {
            var t = (line + cyberGridOffset) / 14;
            var y = horizon + (depth * t * t);
            ctx.strokeStyle = 'rgba(46, 242, 255, ' + (0.08 + (0.45 * t)).toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(backdropWidth, y);
            ctx.stroke();
        }

        backdropFrame = media.matches ? null : window.requestAnimationFrame(drawCyberpunkBackdrop);
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
        if (particles.length > 0 || Math.abs(targetX - currentX) > 0.3 || Math.abs(targetY - currentY) > 0.3) {
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
    const typeMatrixTitle = function () {
        if (getTheme() !== 'matrix' || media.matches) return;
        var title = document.querySelector('.section-heading__title, .blog-content h1');
        if (!title || title.children.length) return;
        var text = title.textContent;
        if (!text.trim()) return;
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
        };
        window.requestAnimationFrame(step);
    };

    // ── Init ──

    const init = function () {
        resizeOverlay();
        resizeBackdrop();
        setTheme(getTheme());
        typeMatrixTitle();
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
            window.addEventListener('scroll', applyHeaderScrollState, { passive: true });
            window.addEventListener('resize', function () {
                resizeOverlay();
                resizeBackdrop();
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
