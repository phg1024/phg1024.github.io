// Get all the projects
$(document).ready(function () {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 1024);
    const themeSwitcher = document.getElementById('theme-switcher');
    const matrixCanvas = document.getElementById('matrix-rain');
    let matrixController = null;

    const createMatrixRain = function (canvas) {
        if (!canvas) {
            return null;
        }

        const context = canvas.getContext('2d');
        const glyphs = '天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏閏餘成歲律呂調陽雲騰致雨露結為霜金生麗水玉出崑岡劍號巨闕珠稱夜光果珍李柰菜重芥薑海鹹河淡鱗潛羽翔龍師火帝鳥官人皇始制文字乃服衣裳推位讓國有虞陶唐';
        let columns = [];
        let animationFrameId = null;
        let lastFrame = 0;
        let frameCount = 0;
        let isRunning = false;
        let width = 0;
        let height = 0;
        let fontSize = 18;
        let columnWidth = fontSize;
        let glyphStep = fontSize * 1.3;
        let sparks = [];
        let pointer = {
            x: 0,
            y: 0,
            strength: 0,
            active: false
        };

        const randomGlyph = function () {
            return glyphs.charAt(Math.floor(Math.random() * glyphs.length));
        };

        const createOffsets = function (length, size) {
            let total = 0;
            return Array.from({ length: length }, function (_, index) {
                if (index === 0) {
                    return 0;
                }
                total += size * (1.2 + Math.random() * 0.9);
                return Math.round(total);
            });
        };

        const createColumn = function (x) {
            const length = 3 + Math.floor(Math.random() * 8);
            const size = fontSize * (0.7 + Math.random() * 0.7);
            const sizeRatio = size / fontSize;
            const speedMagnitude = ((0.8 + Math.random() * 2.2) + (sizeRatio * (0.6 + Math.random() * 1.6))) * 0.75;
            return {
                x: x,
                y: Math.random() * -height,
                speed: (Math.random() < 0.28 ? -1 : 1) * speedMagnitude,
                length: length,
                chars: Array.from({ length: length }, randomGlyph),
                size: size,
                offsets: createOffsets(length, size),
                brightness: 0.78 + Math.random() * 0.35,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 0.012 + Math.random() * 0.02
            };
        };

        const resize = function () {
            const ratio = window.devicePixelRatio || 1;
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.floor(width * ratio);
            canvas.height = Math.floor(height * ratio);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            context.setTransform(ratio, 0, 0, ratio, 0, 0);

            fontSize = width < 768 ? 15 : 18;
            columnWidth = fontSize;
            glyphStep = Math.round(fontSize * 1.6);
            const columnCount = Math.max(12, Math.floor(width / columnWidth));
            columns = Array.from({ length: columnCount }, function (_, index) {
                return createColumn(index * columnWidth);
            });
            context.font = fontSize + 'px "Courier New", monospace';
            context.textBaseline = 'top';
        };

        const updatePointer = function (event) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.strength = 1;
            pointer.active = true;
        };

        const fadePointer = function () {
            pointer.active = false;
        };

        const spawnSpark = function (x, y, glyph, size) {
            const baseAngle = Math.atan2(y - pointer.y, x - pointer.x);
            const scatter = (Math.random() - 0.5) * 1.3;
            const speed = 2.4 + Math.random() * 3.8;
            sparks.push({
                x: x,
                y: y,
                vx: Math.cos(baseAngle + scatter) * speed,
                vy: Math.sin(baseAngle + scatter) * speed,
                glyph: glyph,
                alpha: 1,
                size: size * (0.9 + Math.random() * 0.25),
                trail: []
            });
        };

        const draw = function (timestamp) {
            if (!isRunning) {
                return;
            }

            if (!lastFrame) {
                lastFrame = timestamp;
            }

            const elapsed = timestamp - lastFrame;
            if (elapsed < 33) {
                animationFrameId = window.requestAnimationFrame(draw);
                return;
            }
            lastFrame = timestamp;
            frameCount += 1;

            context.fillStyle = 'rgba(3, 8, 5, 0.12)';
            context.fillRect(0, 0, width, height);

            if (!pointer.active) {
                pointer.strength = Math.max(0, pointer.strength - 0.02);
            }

            sparks = sparks.filter(function (spark) {
                spark.trail.unshift({ x: spark.x, y: spark.y, alpha: spark.alpha });
                if (spark.trail.length > 4) {
                    spark.trail.length = 4;
                }
                spark.x += spark.vx * (elapsed / 16);
                spark.y += spark.vy * (elapsed / 16);
                spark.vx *= 0.987;
                spark.vy = (spark.vy * 0.987) + 0.015;
                spark.alpha -= 0.04;

                if (spark.alpha <= 0 || spark.x < -fontSize || spark.x > width + fontSize || spark.y < -fontSize || spark.y > height + fontSize) {
                    return false;
                }

                context.font = spark.size + 'px "Courier New", monospace';
                spark.trail.forEach(function (trailPoint, index) {
                    const trailAlpha = Math.max(0, spark.alpha * (0.18 - index * 0.035));
                    if (trailAlpha <= 0) {
                        return;
                    }
                    context.fillStyle = 'rgba(120, 220, 120, ' + trailAlpha.toFixed(2) + ')';
                    context.shadowBlur = 0;
                    context.fillText(spark.glyph, trailPoint.x, trailPoint.y);
                });
                context.fillStyle = 'rgba(180, 255, 180, ' + spark.alpha.toFixed(2) + ')';
                context.shadowBlur = 7;
                context.shadowColor = 'rgba(139, 255, 139, ' + Math.max(0.16, spark.alpha * 0.45).toFixed(2) + ')';
                context.fillText(spark.glyph, spark.x, spark.y);
                return true;
            });

            context.font = fontSize + 'px "Courier New", monospace';

            columns.forEach(function (column) {
                if (frameCount % 10 === 0) {
                    column.chars = column.chars.map(randomGlyph);
                }
                const influenceRadius = Math.max(56, column.size * 3.5);
                const pulse = 0.62 + ((Math.sin((frameCount * column.pulseSpeed) + column.pulsePhase) + 1) * 0.42);
                const brightness = column.brightness * pulse;
                context.font = column.size + 'px "Courier New", monospace';

                for (let step = 0; step < column.length; step += 1) {
                    const x = column.x;
                    const y = column.y - column.offsets[step];
                    if (y < -column.size || y > height + column.size) {
                        continue;
                    }

                    const glyph = column.chars[step];
                    const dx = x - pointer.x;
                    const dy = y - pointer.y;
                    const distance = Math.sqrt((dx * dx) + (dy * dy));
                    const hitPointer = pointer.strength > 0.2 && distance < influenceRadius;

                    if (hitPointer && Math.random() > 0.78) {
                        spawnSpark(x, y, glyph, column.size);
                        continue;
                    }

                    if (step === 0) {
                        const headAlpha = Math.min(1, 0.58 + brightness * 0.42);
                        context.fillStyle = 'rgba(139, 255, 139, ' + headAlpha.toFixed(2) + ')';
                        context.shadowBlur = 7 + (brightness * 10);
                        context.shadowColor = 'rgba(139, 255, 139, ' + Math.min(0.95, 0.24 + brightness * 0.42).toFixed(2) + ')';
                    } else if (step < 4) {
                        const midAlpha = Math.min(0.98, 0.28 + brightness * 0.5);
                        context.fillStyle = 'rgba(139, 255, 139, ' + midAlpha.toFixed(2) + ')';
                        context.shadowBlur = 2 + (brightness * 6);
                        context.shadowColor = 'rgba(139, 255, 139, ' + Math.min(0.78, 0.1 + brightness * 0.26).toFixed(2) + ')';
                    } else {
                        const alpha = Math.max(0.04, (0.28 - (step / column.length) * 0.2) * brightness);
                        context.fillStyle = 'rgba(139, 255, 139, ' + alpha.toFixed(2) + ')';
                        context.shadowBlur = 0;
                    }
                    context.fillText(glyph, x, y);
                }

                context.shadowBlur = 0;
                column.y += column.speed * (elapsed / 16);
                const tailOffset = column.offsets[column.length - 1];
                const movedPastBottom = column.speed > 0 && column.y - tailOffset > height && Math.random() > 0.975;
                const movedPastTop = column.speed < 0 && column.y < -column.size && Math.random() > 0.975;

                if (movedPastBottom || movedPastTop) {
                    const refreshed = createColumn(column.x);
                    column.y = refreshed.speed > 0
                        ? -Math.random() * height * 0.6
                        : height + tailOffset + Math.random() * (height * 0.35);
                    column.speed = refreshed.speed;
                    column.length = refreshed.length;
                    column.chars = refreshed.chars;
                    column.offsets = refreshed.offsets;
                    column.brightness = refreshed.brightness;
                    column.pulsePhase = refreshed.pulsePhase;
                    column.pulseSpeed = refreshed.pulseSpeed;
                }
            });

            animationFrameId = window.requestAnimationFrame(draw);
        };

        const start = function () {
            if (isRunning) {
                return;
            }
            isRunning = true;
            resize();
            context.fillStyle = 'rgba(3, 8, 5, 1)';
            context.fillRect(0, 0, width, height);
            lastFrame = 0;
            animationFrameId = window.requestAnimationFrame(draw);
        };

        const stop = function () {
            isRunning = false;
            if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            context.clearRect(0, 0, width, height);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('pointermove', updatePointer);
        window.addEventListener('pointerleave', fadePointer);
        resize();

        return {
            start: start,
            stop: stop
        };
    };

    if (matrixCanvas) {
        matrixController = createMatrixRain(matrixCanvas);
    }

    const applyTheme = function(themeName) {
        const theme = themeName || 'matrix';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('site-theme', theme);
        if (themeSwitcher) {
            themeSwitcher.value = theme;
        }
        if (matrixController) {
            if (theme === 'matrix') {
                matrixController.start();
            } else {
                matrixController.stop();
            }
        }
    };

    document.body.classList.toggle('mobile-device', isMobileDevice);
    applyTheme(localStorage.getItem('site-theme'));

    if (themeSwitcher) {
        themeSwitcher.addEventListener('change', function (event) {
            applyTheme(event.target.value);
        });
    }

    $.get('/project/get', function (data) {
        data.forEach(item => {
            $('#projects-menu').append(
                `<a class="dropdown-item" href="/project?id=${item.id}">${item.name}</a>`
            )
        })
    });

    $.get('/blog/get', function (data) {
        data.forEach(item => {
            $('#blog-menu').append(
                `<a class="dropdown-item" href="/blog?category=${item.category}">${item.category}</a>`
            )
        })
    });

    $('#em').html('<a href="mailto:admin@phg1024.net">admin@phg1024.net</a>');
});
