$(document).ready(function () {
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

    let rafId = null;
    let overlayFrame = null;
    let backdropFrame = null;
    let lastOverlayTimestamp = 0;
    let lastBackdropTimestamp = 0;

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

    const getTheme = function () {
        return root.getAttribute('data-theme') || 'cyberpunk';
    };

    const hasReactiveOverlay = function () {
        return getTheme() !== 'win31' && getTheme() !== 'minimalist';
    };

    const hasDynamicBackdrop = function () {
        const theme = getTheme();
        return theme === 'matrix' || theme === 'industrial';
    };

    const getThemeParticlePalette = function () {
        const theme = getTheme();
        if (theme === 'minimalist') {
            return {
                core: ['170, 178, 188', '223, 227, 232'],
                sparks: ['170, 178, 188', '223, 227, 232']
            };
        }
        if (theme === 'matrix') {
            return {
                core: ['64, 255, 120', '200, 255, 210'],
                sparks: ['64, 255, 120', '210, 255, 210']
            };
        }
        if (theme === 'industrial') {
            return {
                core: ['156, 206, 250', '234, 246, 255'],
                sparks: ['156, 206, 250', '110, 182, 242']
            };
        }
        if (theme === 'win31') {
            return {
                core: ['255, 255, 255', '0, 0, 128'],
                sparks: ['255, 255, 255', '0, 0, 0']
            };
        }
        return {
            core: ['78, 246, 255', '255, 79, 216'],
            sparks: ['78, 246, 255', '255, 79, 216']
        };
    };

    const randomGlyph = function () {
        return matrixGlyphs.charAt(Math.floor(Math.random() * matrixGlyphs.length));
    };

    const setTheme = function (themeName) {
        const nextTheme = themeNames.indexOf(themeName) >= 0 ? themeName : 'cyberpunk';
        root.setAttribute('data-theme', nextTheme);
        localStorage.setItem('site-theme', nextTheme);
        if (themeToggle) {
            themeToggle.value = nextTheme;
        }

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
        }
    };

    const applyPointerState = function () {
        const width = Math.max(window.innerWidth, 1);
        const height = Math.max(window.innerHeight, 1);
        const normalizedX = currentX / width;
        const normalizedY = currentY / height;
        const tiltY = ((normalizedX - 0.5) * 2.2).toFixed(2);
        const tiltX = ((0.5 - normalizedY) * 1.6).toFixed(2);
        const glow = Math.min(1, Math.max(0, 0.35 + Math.abs(normalizedX - 0.5) * 0.5 + Math.abs(normalizedY - 0.35) * 0.3));

        root.style.setProperty('--pointer-x', (normalizedX * 100).toFixed(2) + '%');
        root.style.setProperty('--pointer-y', (normalizedY * 100).toFixed(2) + '%');
        root.style.setProperty('--pointer-glow', glow.toFixed(3));
        root.style.setProperty('--pointer-tilt-x', tiltX + 'deg');
        root.style.setProperty('--pointer-tilt-y', tiltY + 'deg');
    };

    const applyHeaderScrollState = function () {
        const progress = Math.min(1, Math.max(0, window.scrollY / HEADER_SHRINK_SCROLL));
        root.style.setProperty('--header-scroll-progress', progress.toFixed(3));
    };

    const resizeOverlay = function () {
        if (!overlay) {
            return;
        }

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
        if (!backdrop) {
            return;
        }

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
    };

    const initializeMatrixColumns = function () {
        if (!backdropContext || getTheme() !== 'matrix') {
            matrixColumns = [];
            return;
        }

        const fontSize = 18;
        const columnCount = Math.max(12, Math.ceil(backdropWidth / fontSize));
        matrixColumns = Array.from({ length: columnCount }, function (_, index) {
            return {
                x: index * fontSize,
                y: Math.random() * -backdropHeight,
                speed: 1.4 + Math.random() * 2.4,
                length: 6 + Math.floor(Math.random() * 12),
                glyphs: Array.from({ length: 22 }, randomGlyph)
            };
        });
    };

    const distanceToSegment = function (pointX, pointY, startX, startY, endX, endY) {
        const segmentX = endX - startX;
        const segmentY = endY - startY;
        const segmentLengthSquared = (segmentX * segmentX) + (segmentY * segmentY);
        if (segmentLengthSquared === 0) {
            return {
                distance: Math.hypot(pointX - startX, pointY - startY),
                t: 0,
                x: startX,
                y: startY
            };
        }

        const projected = ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSquared;
        const t = Math.max(0, Math.min(1, projected));
        const closestX = startX + (segmentX * t);
        const closestY = startY + (segmentY * t);
        return {
            distance: Math.hypot(pointX - closestX, pointY - closestY),
            t: t,
            x: closestX,
            y: closestY
        };
    };

    const pointAlongPath = function (path, distance) {
        const clampedDistance = Math.max(0, Math.min(path.totalLength, distance));
        let traversed = 0;

        for (let index = 0; index < path.segmentData.length; index += 1) {
            const segment = path.segmentData[index];
            if (traversed + segment.length >= clampedDistance) {
                const localDistance = clampedDistance - traversed;
                const ratio = segment.length > 0 ? (localDistance / segment.length) : 0;
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
            return;
        }

        const grid = Math.max(42, Math.round(Math.min(backdropWidth, backdropHeight) / 18));
        const columns = Math.max(8, Math.floor(backdropWidth / grid));
        const rows = Math.max(6, Math.floor(backdropHeight / grid));
        const marginX = Math.max(28, (backdropWidth - (columns * grid)) / 2);
        const marginY = Math.max(28, (backdropHeight - (rows * grid)) / 2);
        const node = function (column, row) {
            return {
                x: marginX + (column * grid),
                y: marginY + (row * grid)
            };
        };

        const pathSpecs = [
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
            const points = spec.map(function (pair) {
                return node(
                    Math.max(0, Math.min(columns, pair[0])),
                    Math.max(0, Math.min(rows, pair[1]))
                );
            });
            const segmentData = [];
            let totalLength = 0;

            for (let index = 0; index < points.length - 1; index += 1) {
                const start = points[index];
                const end = points[index + 1];
                const length = Math.hypot(end.x - start.x, end.y - start.y);
                segmentData.push({
                    start: start,
                    end: end,
                    length: length,
                    accumulated: totalLength
                });
                totalLength += length;
            }

            return {
                id: pathIndex,
                points: points,
                segmentData: segmentData,
                totalLength: totalLength
            };
        });

        industrialSegments = [];
        industrialPaths.forEach(function (path) {
            path.segmentData.forEach(function (segment, segmentIndex) {
                industrialSegments.push({
                    pathId: path.id,
                    segmentIndex: segmentIndex,
                    start: segment.start,
                    end: segment.end,
                    accumulated: segment.accumulated,
                    length: segment.length
                });
            });
        });
        industrialPulses = [];
    };

    const spawnBurst = function (x, y, strength) {
        const count = Math.max(3, Math.min(8, Math.round(3 + strength * 6)));
        const palette = getThemeParticlePalette();
        const theme = getTheme();

        for (let index = 0; index < count; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.6 + Math.random() * (1.5 + strength * 2.2);
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 12 + Math.random() * 16,
                maxLife: 12 + Math.random() * 16,
                size: 1.25 + Math.random() * 2.1,
                hue: index % 2 === 0 ? palette.sparks[0] : palette.sparks[1],
                glyph: theme === 'matrix' ? randomGlyph() : '',
                isGlyph: theme === 'matrix',
                isPixel: theme === 'win31',
                isIndustrialLine: false,
                direction: null,
                length: 0,
                speed: speed
            });
        }

        if (particles.length > MAX_PARTICLES) {
            particles = particles.slice(particles.length - MAX_PARTICLES);
        }
    };

    const triggerIndustrialCircuit = function (x, y, strength) {
        if (getTheme() !== 'industrial' || industrialSegments.length === 0) {
            return;
        }

        let bestHit = null;
        industrialSegments.forEach(function (segment) {
            const hit = distanceToSegment(x, y, segment.start.x, segment.start.y, segment.end.x, segment.end.y);
            if (!bestHit || hit.distance < bestHit.distance) {
                bestHit = {
                    distance: hit.distance,
                    segment: segment,
                    localT: hit.t,
                    x: hit.x,
                    y: hit.y
                };
            }
        });

        if (!bestHit || bestHit.distance > 24) {
            return;
        }

        const path = industrialPaths.find(function (entry) {
            return entry.id === bestHit.segment.pathId;
        });
        if (!path) {
            return;
        }

        const hasNearbyActivePulse = industrialPulses.some(function (pulse) {
            const dx = pulse.glowX - bestHit.x;
            const dy = pulse.glowY - bestHit.y;
            return pulse.life > 0 && Math.hypot(dx, dy) <= 15;
        });

        if (hasNearbyActivePulse) {
            return;
        }

        industrialPulses.push({
            pathId: path.id,
            originDistance: bestHit.segment.accumulated + (bestHit.segment.length * bestHit.localT),
            progress: 0,
            speed: 2.6 + (strength * 3.4),
            life: 132,
            maxLife: 132,
            glowX: bestHit.x,
            glowY: bestHit.y
        });

        if (industrialPulses.length > 12) {
            industrialPulses = industrialPulses.slice(industrialPulses.length - 12);
        }
    };

    const drawMatrixBackdrop = function (timestamp) {
        if (!backdropContext || media.matches || getTheme() !== 'matrix') {
            if (backdropContext) {
                backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            }
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
        backdropContext.font = '18px "Courier New", monospace';
        backdropContext.textBaseline = 'top';

        matrixColumns.forEach(function (column) {
            const pointerDistance = Math.abs(column.x - currentX);
            const pointerBoost = pointerDistance < 120 ? 1.22 : 1;
            column.y += column.speed * pointerBoost;

            for (let index = 0; index < column.length; index += 1) {
                const glyph = column.glyphs[(Math.floor(column.y / 16) + index) % column.glyphs.length];
                const glyphY = column.y - (index * 16);
                if (glyphY < -24 || glyphY > backdropHeight + 24) {
                    continue;
                }

                const alpha = Math.max(0.06, 1 - (index / (column.length + 2)));
                const isHead = index === 0;
                backdropContext.fillStyle = isHead
                    ? 'rgba(220, 255, 220, 0.92)'
                    : 'rgba(100, 255, 140, ' + (alpha * 0.75).toFixed(3) + ')';
                backdropContext.shadowBlur = isHead ? 6 : 0;
                backdropContext.shadowColor = isHead ? 'rgba(124, 255, 157, 0.65)' : 'transparent';
                backdropContext.fillText(glyph, column.x, glyphY);
            }

            if (Math.random() > 0.96) {
                column.glyphs[Math.floor(Math.random() * column.glyphs.length)] = randomGlyph();
            }

            if (column.y - (column.length * 16) > backdropHeight) {
                column.y = -Math.random() * 240;
                column.speed = 1.4 + Math.random() * 2.4;
                column.length = 6 + Math.floor(Math.random() * 12);
                column.glyphs = Array.from({ length: 22 }, randomGlyph);
            }
        });

        backdropContext.shadowBlur = 0;
        backdropFrame = window.requestAnimationFrame(drawMatrixBackdrop);
    };

    const drawIndustrialBackdrop = function (timestamp) {
        if (!backdropContext || media.matches || getTheme() !== 'industrial') {
            if (backdropContext) {
                backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
            }
            backdropFrame = null;
            return;
        }

        if (timestamp && (timestamp - lastBackdropTimestamp) < (1000 / MAX_BACKDROP_FPS)) {
            backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
            return;
        }
        lastBackdropTimestamp = timestamp || 0;

        backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
        backdropContext.lineCap = 'round';
        backdropContext.lineJoin = 'round';

        industrialPaths.forEach(function (path) {
            backdropContext.beginPath();
            path.points.forEach(function (point, index) {
                if (index === 0) {
                    backdropContext.moveTo(point.x, point.y);
                } else {
                    backdropContext.lineTo(point.x, point.y);
                }
            });
            backdropContext.strokeStyle = 'rgba(134, 152, 168, 0.18)';
            backdropContext.lineWidth = 10;
            backdropContext.stroke();

            backdropContext.strokeStyle = 'rgba(205, 218, 229, 0.35)';
            backdropContext.lineWidth = 3;
            backdropContext.shadowBlur = 0;
            backdropContext.stroke();

            path.points.forEach(function (point) {
                backdropContext.fillStyle = 'rgba(216, 227, 236, 0.55)';
                backdropContext.beginPath();
                backdropContext.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
                backdropContext.fill();
            });
        });

        backdropContext.fillStyle = 'rgba(26, 32, 38, 0.96)';
        [
            { x: backdropWidth * 0.15, y: backdropHeight * 0.18, w: 110, h: 64 },
            { x: backdropWidth * 0.58, y: backdropHeight * 0.28, w: 136, h: 72 },
            { x: backdropWidth * 0.32, y: backdropHeight * 0.66, w: 120, h: 68 }
        ].forEach(function (chip) {
            backdropContext.fillRect(chip.x, chip.y, chip.w, chip.h);
            backdropContext.strokeStyle = 'rgba(190, 204, 216, 0.24)';
            backdropContext.lineWidth = 1;
            backdropContext.strokeRect(chip.x + 0.5, chip.y + 0.5, chip.w - 1, chip.h - 1);
            for (let pin = 0; pin < 7; pin += 1) {
                const pinOffset = 10 + (pin * 14);
                backdropContext.fillStyle = 'rgba(204, 216, 225, 0.42)';
                backdropContext.fillRect(chip.x - 7, chip.y + pinOffset, 7, 2);
                backdropContext.fillRect(chip.x + chip.w, chip.y + pinOffset, 7, 2);
            }
        });

        industrialPulses = industrialPulses.filter(function (pulse) {
            const path = industrialPaths.find(function (entry) {
                return entry.id === pulse.pathId;
            });
            if (!path) {
                return false;
            }

            pulse.progress += pulse.speed;
            pulse.life -= 1;
            const alpha = Math.max(0, pulse.life / pulse.maxLife);
            const headDistanceA = pulse.originDistance + pulse.progress;
            const tailDistanceA = Math.max(pulse.originDistance, headDistanceA - 58);
            const headDistanceB = pulse.originDistance - pulse.progress;
            const tailDistanceB = Math.min(pulse.originDistance, headDistanceB + 58);

            backdropContext.strokeStyle = 'rgba(232, 246, 255, ' + (alpha * 0.98).toFixed(3) + ')';
            backdropContext.lineWidth = 3.2;
            backdropContext.shadowBlur = 18;
            backdropContext.shadowColor = 'rgba(132, 196, 248, ' + (alpha * 0.92).toFixed(3) + ')';

            const drawPulseSegment = function (fromDistance, toDistance) {
                const clampedStart = Math.max(0, Math.min(path.totalLength, fromDistance));
                const clampedEnd = Math.max(0, Math.min(path.totalLength, toDistance));
                if (Math.abs(clampedEnd - clampedStart) < 2) {
                    return;
                }

                const segmentCount = Math.max(2, Math.ceil(Math.abs(clampedEnd - clampedStart) / 18));
                backdropContext.beginPath();
                for (let step = 0; step <= segmentCount; step += 1) {
                    const ratio = step / segmentCount;
                    const distance = clampedStart + ((clampedEnd - clampedStart) * ratio);
                    const point = pointAlongPath(path, distance);
                    const jitter = (Math.sin((step * 1.7) + (timestamp || 0) * 0.03) * 1.6) * alpha;
                    if (step === 0) {
                        backdropContext.moveTo(point.x + jitter, point.y - jitter);
                    } else {
                        backdropContext.lineTo(point.x + jitter, point.y - jitter);
                    }
                }
                backdropContext.stroke();
                backdropContext.strokeStyle = 'rgba(132, 196, 248, ' + (alpha * 0.72).toFixed(3) + ')';
                backdropContext.lineWidth = 1.4;
                backdropContext.stroke();
            };

            drawPulseSegment(tailDistanceA, headDistanceA);
            drawPulseSegment(tailDistanceB, headDistanceB);

            backdropContext.beginPath();
            backdropContext.fillStyle = 'rgba(238, 248, 255, ' + (alpha * 0.98).toFixed(3) + ')';
            backdropContext.arc(pulse.glowX, pulse.glowY, 4.5 + ((1 - alpha) * 5), 0, Math.PI * 2);
            backdropContext.fill();

            return pulse.life > 0 && (headDistanceA < path.totalLength + 72 || headDistanceB > -72);
        });

        backdropContext.shadowBlur = 0;
        backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
    };

    const drawOverlay = function (timestamp) {
        if (!overlayContext || media.matches || !hasReactiveOverlay()) {
            if (overlayContext) {
                overlayContext.clearRect(0, 0, overlayWidth, overlayHeight);
            }
            overlayFrame = null;
            return;
        }

        if (timestamp && (timestamp - lastOverlayTimestamp) < (1000 / MAX_OVERLAY_FPS)) {
            overlayFrame = window.requestAnimationFrame(drawOverlay);
            return;
        }
        lastOverlayTimestamp = timestamp || 0;

        overlayContext.clearRect(0, 0, overlayWidth, overlayHeight);
        const palette = getThemeParticlePalette();
        const theme = getTheme();
        const glowRadius = theme === 'matrix' ? 52 : theme === 'win31' ? 18 : theme === 'industrial' ? 24 : theme === 'minimalist' ? 34 : 64;
        const outerRadius = theme === 'matrix' ? 84 : theme === 'win31' ? 34 : theme === 'industrial' ? 42 : theme === 'minimalist' ? 58 : 102;

        const coreGlow = overlayContext.createRadialGradient(currentX, currentY, 0, currentX, currentY, glowRadius);
        coreGlow.addColorStop(0, 'rgba(' + palette.core[0] + ', ' + (theme === 'win31' ? '0.16' : theme === 'minimalist' ? '0.12' : '0.28') + ')');
        coreGlow.addColorStop(0.35, 'rgba(' + palette.core[0] + ', ' + (theme === 'win31' ? '0.06' : theme === 'minimalist' ? '0.05' : '0.12') + ')');
        coreGlow.addColorStop(1, 'rgba(' + palette.core[0] + ', 0)');
        overlayContext.fillStyle = coreGlow;
        overlayContext.beginPath();
        overlayContext.arc(currentX, currentY, glowRadius, 0, Math.PI * 2);
        overlayContext.fill();

        const secondaryGlow = overlayContext.createRadialGradient(currentX, currentY, 0, currentX, currentY, outerRadius);
        secondaryGlow.addColorStop(0, 'rgba(' + palette.core[1] + ', ' + (theme === 'minimalist' ? '0.05' : '0.08') + ')');
        secondaryGlow.addColorStop(1, 'rgba(' + palette.core[1] + ', 0)');
        overlayContext.fillStyle = secondaryGlow;
        overlayContext.beginPath();
        overlayContext.arc(currentX, currentY, outerRadius, 0, Math.PI * 2);
        overlayContext.fill();

        if (theme === 'matrix') {
            overlayContext.strokeStyle = 'rgba(124, 255, 157, 0.18)';
            overlayContext.lineWidth = 1;
            overlayContext.beginPath();
            overlayContext.moveTo(currentX - 18, currentY);
            overlayContext.lineTo(currentX + 18, currentY);
            overlayContext.moveTo(currentX, currentY - 18);
            overlayContext.lineTo(currentX, currentY + 18);
            overlayContext.stroke();
        } else if (theme === 'win31') {
            overlayContext.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            overlayContext.lineWidth = 1;
            overlayContext.strokeRect(Math.round(currentX - 7) + 0.5, Math.round(currentY - 7) + 0.5, 14, 14);
            overlayContext.strokeStyle = 'rgba(0, 0, 128, 0.55)';
            overlayContext.strokeRect(Math.round(currentX - 3) + 0.5, Math.round(currentY - 3) + 0.5, 6, 6);
        } else if (theme === 'industrial') {
            overlayContext.strokeStyle = 'rgba(156, 206, 250, 0.42)';
            overlayContext.lineWidth = 1.4;
            overlayContext.beginPath();
            overlayContext.moveTo(currentX - 16, currentY);
            overlayContext.lineTo(currentX + 16, currentY);
            overlayContext.moveTo(currentX, currentY - 16);
            overlayContext.lineTo(currentX, currentY + 16);
            overlayContext.stroke();
            overlayContext.beginPath();
            overlayContext.fillStyle = 'rgba(232, 246, 255, 0.48)';
            overlayContext.arc(currentX, currentY, 3.2, 0, Math.PI * 2);
            overlayContext.fill();
        }

        particles = particles.filter(function (particle) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= particle.isGlyph ? 0.978 : 0.985;
            particle.vy *= particle.isGlyph ? 0.978 : 0.985;
            particle.life -= 1;
            const alpha = Math.max(0, particle.life / particle.maxLife);

            if (alpha <= 0) {
                return false;
            }

            overlayContext.shadowBlur = particle.isPixel ? 0 : 8;
            overlayContext.shadowColor = 'rgba(' + particle.hue + ', ' + (alpha * 0.75).toFixed(3) + ')';

            if (particle.isGlyph) {
                overlayContext.fillStyle = 'rgba(' + particle.hue + ', ' + (alpha * 0.95).toFixed(3) + ')';
                overlayContext.font = Math.max(11, Math.round(10 + particle.size * 2)) + 'px "Courier New", monospace';
                overlayContext.fillText(particle.glyph, particle.x, particle.y);
            } else if (particle.isPixel) {
                overlayContext.fillStyle = 'rgba(' + particle.hue + ', ' + (alpha * 0.92).toFixed(3) + ')';
                const size = Math.max(2, Math.round(particle.size * alpha * 1.4));
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
        if (backdropFrame || media.matches || !hasDynamicBackdrop()) {
            return;
        }

        if (getTheme() === 'industrial') {
            backdropFrame = window.requestAnimationFrame(drawIndustrialBackdrop);
        } else {
            backdropFrame = window.requestAnimationFrame(drawMatrixBackdrop);
        }
    };

    const animate = function () {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        applyPointerState();

        if (hasReactiveOverlay()) {
            queueOverlay();
        }
        if (hasDynamicBackdrop()) {
            queueBackdrop();
        }

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
        const dx = event.clientX - targetX;
        const dy = event.clientY - targetY;
        const velocity = Math.min(1, Math.sqrt((dx * dx) + (dy * dy)) / 36);
        targetX = event.clientX;
        targetY = event.clientY;

        if (getTheme() === 'industrial') {
            triggerIndustrialCircuit(event.clientX, event.clientY, velocity);
        } else if (hasReactiveOverlay()) {
            spawnBurst(event.clientX, event.clientY, velocity);
        }

        queueAnimation();
        if (hasReactiveOverlay()) {
            queueOverlay();
        }
        if (hasDynamicBackdrop()) {
            queueBackdrop();
        }
    };

    const resetPointer = function () {
        targetX = window.innerWidth * 0.5;
        targetY = window.innerHeight * 0.22;
        queueAnimation();
        if (hasReactiveOverlay()) {
            queueOverlay();
        }
        if (hasDynamicBackdrop()) {
            queueBackdrop();
        }
    };

    resizeOverlay();
    resizeBackdrop();
    setTheme(getTheme());
    applyPointerState();
    applyHeaderScrollState();

    if (themeToggle) {
        themeToggle.addEventListener('change', function (event) {
            setTheme(event.target.value);
            resetPointer();
        });
    }

    if (!media.matches) {
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('pointerleave', resetPointer);
        window.addEventListener('blur', resetPointer);
        window.addEventListener('scroll', applyHeaderScrollState, { passive: true });
        window.addEventListener('resize', function () {
            resizeOverlay();
            resizeBackdrop();
            applyHeaderScrollState();
            resetPointer();
        });

        if (hasReactiveOverlay()) {
            queueOverlay();
        }
        if (hasDynamicBackdrop()) {
            queueBackdrop();
        }
    }
});
