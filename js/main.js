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

    const getTheme = function () {
        return root.getAttribute('data-theme') || 'cyberpunk';
    };

    const hasReactiveOverlay = function () {
        return getTheme() !== 'win31' && getTheme() !== 'minimalist';
    };

    const hasMatrixBackdrop = function () {
        return getTheme() === 'matrix';
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
                core: ['188, 202, 214', '232, 238, 243'],
                sparks: ['188, 202, 214', '146, 162, 176']
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

        if (!hasMatrixBackdrop() && backdropContext) {
            backdropContext.clearRect(0, 0, backdropWidth, backdropHeight);
        }

        if (hasMatrixBackdrop()) {
            initializeMatrixColumns();
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
    };

    const initializeMatrixColumns = function () {
        if (!backdropContext || !hasMatrixBackdrop()) {
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

    const spawnBurst = function (x, y, strength) {
        const count = Math.max(3, Math.min(8, Math.round(3 + strength * 6)));
        const palette = getThemeParticlePalette();
        const theme = getTheme();

        for (let index = 0; index < count; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.6 + Math.random() * (1.5 + strength * 2.2);
            const industrialDirection = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random() * 4)];
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: theme === 'industrial' ? 48 + Math.random() * 26 : 12 + Math.random() * 16,
                maxLife: theme === 'industrial' ? 48 + Math.random() * 26 : 12 + Math.random() * 16,
                size: 1.25 + Math.random() * 2.1,
                hue: index % 2 === 0 ? palette.sparks[0] : palette.sparks[1],
                glyph: theme === 'matrix' ? randomGlyph() : '',
                isGlyph: theme === 'matrix',
                isPixel: theme === 'win31',
                isIndustrialLine: theme === 'industrial',
                direction: theme === 'industrial' ? industrialDirection : null,
                length: theme === 'industrial' ? 16 + Math.random() * (14 + strength * 18) : 0,
                speed: theme === 'industrial' ? 1.4 + Math.random() * (1.5 + strength * 1.2) : speed
            });
        }

        if (particles.length > MAX_PARTICLES) {
            particles = particles.slice(particles.length - MAX_PARTICLES);
        }
    };

    const drawMatrixBackdrop = function (timestamp) {
        if (!backdropContext || media.matches || !hasMatrixBackdrop()) {
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
            overlayContext.strokeStyle = 'rgba(216, 227, 236, 0.16)';
            overlayContext.lineWidth = 1;
            overlayContext.beginPath();
            overlayContext.moveTo(currentX - 12, currentY);
            overlayContext.lineTo(currentX + 12, currentY);
            overlayContext.moveTo(currentX, currentY - 12);
            overlayContext.lineTo(currentX, currentY + 12);
            overlayContext.stroke();
        }

        particles = particles.filter(function (particle) {
            if (particle.isIndustrialLine) {
                particle.x += particle.direction[0] * particle.speed;
                particle.y += particle.direction[1] * particle.speed;
                particle.speed *= 0.989;
            } else {
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.vx *= particle.isGlyph ? 0.978 : 0.985;
                particle.vy *= particle.isGlyph ? 0.978 : 0.985;
            }
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
            } else if (particle.isIndustrialLine) {
                const directionX = particle.direction[0];
                const directionY = particle.direction[1];
                const halfLength = particle.length * alpha;
                overlayContext.strokeStyle = 'rgba(' + particle.hue + ', ' + (alpha * 0.88).toFixed(3) + ')';
                overlayContext.lineWidth = 1;
                overlayContext.beginPath();
                overlayContext.moveTo(
                    particle.x,
                    particle.y
                );
                overlayContext.lineTo(
                    particle.x + directionX * halfLength,
                    particle.y + directionY * halfLength
                );
                overlayContext.stroke();
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
        if (!backdropFrame && !media.matches && hasMatrixBackdrop()) {
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
        if (hasMatrixBackdrop()) {
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

        if (hasReactiveOverlay()) {
            spawnBurst(event.clientX, event.clientY, velocity);
        }

        queueAnimation();
        if (hasReactiveOverlay()) {
            queueOverlay();
        }
        if (hasMatrixBackdrop()) {
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
        if (hasMatrixBackdrop()) {
            queueBackdrop();
        }
    }
});
