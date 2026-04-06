// Get all the projects
$(document).ready(function () {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 1024);
    const themeSwitcher = document.getElementById('theme-switcher');
    const cyberpunkCanvas = document.getElementById('cyberpunk-grid');
    const starWarsCanvas = document.getElementById('starwars-space');
    const matrixCanvas = document.getElementById('matrix-rain');
    let cyberpunkController = null;
    let starWarsController = null;
    let matrixController = null;

    const createCyberpunkBackdrop = function (canvas) {
        if (!canvas) {
            return null;
        }

        const context = canvas.getContext('2d');
        let animationFrameId = null;
        let isRunning = false;
        let width = 0;
        let height = 0;
        let time = 0;
        let shards = [];
        let towers = [];
        let sparks = [];
        let scanBands = [];
        let beamDrift = {
            magenta: 0,
            cyan: 0
        };
        let pointer = {
            x: 0,
            y: 0,
            strength: 0,
            active: false
        };

        const createShards = function () {
            return Array.from({ length: 34 }, function (_, index) {
                return {
                    x: Math.random() * width,
                    y: Math.random() * height * 0.7,
                    w: 50 + Math.random() * 260,
                    h: 1 + Math.random() * 4,
                    speed: 0.45 + Math.random() * 1.8,
                    drift: (Math.random() - 0.5) * 1.2,
                    hue: index % 2 === 0 ? '0, 245, 212' : '255, 79, 216',
                    alpha: 0.06 + Math.random() * 0.24
                };
            });
        };

        const createSparks = function () {
            return Array.from({ length: Math.max(18, Math.floor(width / 70)) }, function (_, index) {
                return {
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: 0.7 + Math.random() * 2.2,
                    speed: 0.2 + Math.random() * 1.1,
                    drift: -0.2 + Math.random() * 0.4,
                    alpha: 0.08 + Math.random() * 0.18,
                    hue: index % 3 === 0 ? '255, 79, 216' : '0, 245, 212',
                    phase: Math.random() * Math.PI * 2
                };
            });
        };

        const createScanBands = function () {
            return Array.from({ length: 3 }, function (_, index) {
                return {
                    y: Math.random() * height,
                    h: 60 + Math.random() * 140,
                    speed: 0.35 + (index * 0.18) + Math.random() * 0.4,
                    alpha: 0.02 + Math.random() * 0.04,
                    wobble: Math.random() * Math.PI * 2
                };
            });
        };

        const createTowers = function () {
            const towerCount = Math.max(8, Math.floor(width / 160));
            return Array.from({ length: towerCount }, function (_, index) {
                const span = width / towerCount;
                const baseX = index * span;
                const towerWidth = 36 + Math.random() * 90;
                const towerHeight = height * (0.12 + Math.random() * 0.3);
                return {
                    x: baseX + Math.random() * Math.max(12, span - towerWidth),
                    w: towerWidth,
                    h: towerHeight,
                    glow: Math.random() * Math.PI * 2,
                    accent: index % 3 === 0 ? '255, 79, 216' : '0, 245, 212',
                    flicker: 0.78 + Math.random() * 0.55
                };
            });
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
            shards = createShards();
            towers = createTowers();
            sparks = createSparks();
            scanBands = createScanBands();
            beamDrift.magenta = Math.random() * Math.PI * 2;
            beamDrift.cyan = Math.random() * Math.PI * 2;
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

        const draw = function () {
            if (!isRunning) {
                return;
            }

            time += 0.94 + Math.sin(time * 0.019) * 0.035;
            context.clearRect(0, 0, width, height);

            if (!pointer.active) {
                pointer.strength = Math.max(0, pointer.strength - 0.025);
            }

            const horizon = height * 0.34;
            const gridColor = 'rgba(0, 245, 212, 0.18)';
            const pointerInfluenceX = pointer.strength > 0 ? ((pointer.x / Math.max(1, width)) - 0.5) * 140 * pointer.strength : 0;
            const pointerInfluenceY = pointer.strength > 0 ? ((pointer.y / Math.max(1, height)) - 0.5) * 70 * pointer.strength : 0;

            const background = context.createLinearGradient(0, 0, 0, height);
            background.addColorStop(0, 'rgba(13, 2, 24, 0.24)');
            background.addColorStop(0.3, 'rgba(33, 8, 50, 0.12)');
            background.addColorStop(0.55, 'rgba(20, 5, 34, 0.06)');
            background.addColorStop(1, 'rgba(7, 1, 15, 0)');
            context.fillStyle = background;
            context.fillRect(0, 0, width, height);

            const vignette = context.createRadialGradient(width * 0.5, height * 0.42, width * 0.08, width * 0.5, height * 0.42, width * 0.72);
            vignette.addColorStop(0, 'rgba(255, 79, 216, 0.02)');
            vignette.addColorStop(0.55, 'rgba(0, 245, 212, 0.03)');
            vignette.addColorStop(1, 'rgba(3, 0, 8, 0.28)');
            context.fillStyle = vignette;
            context.fillRect(0, 0, width, height);

            const beamX = (time * (4.2 + Math.sin(time * 0.012 + beamDrift.magenta) * 0.24)) % (width + 260) - 260 + pointerInfluenceX * 0.35;
            const beam = context.createLinearGradient(beamX, 0, beamX + 180, 0);
            beam.addColorStop(0, 'rgba(255, 79, 216, 0)');
            beam.addColorStop(0.5, 'rgba(255, 79, 216, 0.13)');
            beam.addColorStop(1, 'rgba(255, 79, 216, 0)');
            context.fillStyle = beam;
            context.fillRect(0, 0, width, height);

            const beamX2 = width - (((time * (3.05 + Math.cos(time * 0.016 + beamDrift.cyan) * 0.22)) % (width + 320)) - 320) - pointerInfluenceX * 0.28;
            const beam2 = context.createLinearGradient(beamX2, 0, beamX2 + 140, 0);
            beam2.addColorStop(0, 'rgba(0, 245, 212, 0)');
            beam2.addColorStop(0.45, 'rgba(0, 245, 212, 0.09)');
            beam2.addColorStop(1, 'rgba(0, 245, 212, 0)');
            context.fillStyle = beam2;
            context.fillRect(0, 0, width, height);

            scanBands.forEach(function (band) {
                band.y += band.speed + Math.sin((time * 0.017) + band.wobble) * 0.14 + (pointerInfluenceY * 0.002);
                if (band.y - band.h > height) {
                    band.y = -band.h;
                }
                const bandGradient = context.createLinearGradient(0, band.y, 0, band.y + band.h);
                bandGradient.addColorStop(0, 'rgba(255, 79, 216, 0)');
                bandGradient.addColorStop(0.5, 'rgba(255, 79, 216, ' + band.alpha.toFixed(3) + ')');
                bandGradient.addColorStop(1, 'rgba(255, 79, 216, 0)');
                context.fillStyle = bandGradient;
                context.fillRect(0, band.y, width, band.h);
            });

            const cyanSweep = context.createLinearGradient(0, horizon - 40 + pointerInfluenceY * 0.2, 0, horizon + 160 + pointerInfluenceY * 0.35);
            cyanSweep.addColorStop(0, 'rgba(0, 245, 212, 0)');
            cyanSweep.addColorStop(0.45, 'rgba(0, 245, 212, 0.08)');
            cyanSweep.addColorStop(1, 'rgba(0, 245, 212, 0)');
            context.fillStyle = cyanSweep;
            context.fillRect(0, horizon - 40, width, height - horizon + 40);

            const magentaFog = context.createLinearGradient(0, horizon - 10, 0, height);
            magentaFog.addColorStop(0, 'rgba(255, 79, 216, 0)');
            magentaFog.addColorStop(0.28, 'rgba(255, 79, 216, 0.035)');
            magentaFog.addColorStop(1, 'rgba(10, 3, 18, 0)');
            context.fillStyle = magentaFog;
            context.fillRect(0, horizon - 10, width, height - horizon + 10);

            towers.forEach(function (tower, index) {
                const towerTop = horizon + 18 - tower.h;
                const pulse = (0.52 + ((Math.sin(time * 0.03 + tower.glow) + 1) * 0.18)) * tower.flicker;
                const towerDistance = Math.abs((tower.x + tower.w * 0.5) - pointer.x);
                const towerBoost = pointer.strength > 0 ? Math.max(0, 1 - (towerDistance / 220)) * 0.16 * pointer.strength : 0;
                context.fillStyle = 'rgba(9, 4, 20, 0.7)';
                context.fillRect(tower.x, towerTop, tower.w, tower.h);

                context.fillStyle = 'rgba(' + tower.accent + ', ' + (0.06 + pulse * 0.08 + towerBoost).toFixed(2) + ')';
                context.shadowBlur = 16;
                context.shadowColor = 'rgba(' + tower.accent + ', 0.22)';
                context.fillRect(tower.x, towerTop, tower.w, 2);

                for (let row = towerTop + 12; row < towerTop + tower.h - 8; row += 12) {
                    if ((row + index * 3 + Math.floor(time * 0.14)) % 24 !== 0) {
                        continue;
                    }
                    context.fillStyle = 'rgba(' + tower.accent + ', ' + (0.08 + Math.random() * 0.1).toFixed(2) + ')';
                    context.fillRect(tower.x + 6, row, Math.max(10, tower.w - 12), 1.5);
                }
            });

            context.beginPath();
            for (let y = horizon; y < height; y += 28) {
                const perspective = (y - horizon) / (height - horizon + 1);
                const inset = width * 0.5 * perspective * 0.92;
                context.moveTo(inset, y);
                context.lineTo(width - inset, y);
            }
            context.strokeStyle = gridColor;
            context.lineWidth = 1;
            context.shadowBlur = 14;
            context.shadowColor = 'rgba(0, 245, 212, 0.28)';
            context.stroke();

            context.beginPath();
            const vanishingX = (width * 0.5) + pointerInfluenceX * 0.22;
            for (let x = -width * 0.2; x <= width * 1.2; x += 42) {
                context.moveTo(x + ((time * 0.35) % 42), height);
                context.lineTo(vanishingX, horizon);
            }
            context.strokeStyle = 'rgba(0, 245, 212, 0.13)';
            context.lineWidth = 1;
            context.stroke();

            context.beginPath();
            for (let x = -width * 0.1; x <= width * 1.1; x += 84) {
                context.moveTo(x - ((time * 0.5) % 84), height);
                context.lineTo(vanishingX, horizon + 22);
            }
            context.strokeStyle = 'rgba(255, 79, 216, 0.08)';
            context.lineWidth = 1;
            context.stroke();

            context.shadowBlur = 0;
            shards.forEach(function (shard) {
                shard.x += shard.speed * (0.94 + Math.sin(time * 0.011 + shard.alpha * 10) * 0.08);
                shard.y += shard.drift + Math.cos(time * 0.013 + shard.x * 0.002) * 0.06;
                if (pointer.strength > 0) {
                    const shardDx = shard.x - pointer.x;
                    const shardDy = shard.y - pointer.y;
                    const shardDistance = Math.sqrt((shardDx * shardDx) + (shardDy * shardDy));
                    if (shardDistance < 180 && shardDistance > 0.001) {
                        const repel = (1 - (shardDistance / 180)) * 0.8 * pointer.strength;
                        shard.x += (shardDx / shardDistance) * repel;
                        shard.y += (shardDy / shardDistance) * repel;
                    }
                }
                if (shard.x - shard.w > width) {
                    shard.x = -shard.w;
                    shard.y = Math.random() * height * 0.75;
                }

                context.fillStyle = 'rgba(' + shard.hue + ', ' + shard.alpha.toFixed(2) + ')';
                context.shadowBlur = 12;
                context.shadowColor = 'rgba(' + shard.hue + ', 0.28)';
                context.fillRect(shard.x, shard.y, shard.w, shard.h);
            });

            sparks.forEach(function (spark) {
                spark.x += spark.drift + Math.sin(time * 0.018 + spark.phase) * 0.08;
                spark.y += spark.speed * (0.97 + Math.cos(time * 0.021 + spark.phase) * 0.05);
                if (pointer.strength > 0) {
                    const sparkDx = spark.x - pointer.x;
                    const sparkDy = spark.y - pointer.y;
                    const sparkDistance = Math.sqrt((sparkDx * sparkDx) + (sparkDy * sparkDy));
                    if (sparkDistance < 140 && sparkDistance > 0.001) {
                        const shove = (1 - (sparkDistance / 140)) * 0.9 * pointer.strength;
                        spark.x += (sparkDx / sparkDistance) * shove;
                        spark.y += (sparkDy / sparkDistance) * shove;
                    }
                }
                if (spark.y > height + 4) {
                    spark.y = -4;
                    spark.x = Math.random() * width;
                }
                if (spark.x < -6) {
                    spark.x = width + 6;
                } else if (spark.x > width + 6) {
                    spark.x = -6;
                }
                const pulse = 0.55 + ((Math.sin((time * 0.03) + spark.phase) + 1) * 0.25);
                context.fillStyle = 'rgba(' + spark.hue + ', ' + (spark.alpha * pulse).toFixed(2) + ')';
                context.shadowBlur = 8;
                context.shadowColor = 'rgba(' + spark.hue + ', 0.18)';
                context.beginPath();
                context.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
                context.fill();
            });

            const sunRadius = Math.min(width, height) * 0.12;
            const sunX = (width * 0.76) + pointerInfluenceX * 0.08;
            const sunY = (height * 0.22) + pointerInfluenceY * 0.05;
            const sun = context.createRadialGradient(sunX, sunY, sunRadius * 0.1, sunX, sunY, sunRadius);
            sun.addColorStop(0, 'rgba(255, 79, 216, 0.34)');
            sun.addColorStop(0.55, 'rgba(255, 79, 216, 0.14)');
            sun.addColorStop(1, 'rgba(255, 79, 216, 0)');
            context.fillStyle = sun;
            context.beginPath();
            context.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
            context.fill();

            const halo = context.createRadialGradient(sunX, sunY, sunRadius * 0.8, sunX, sunY, sunRadius * 1.9);
            halo.addColorStop(0, 'rgba(255, 79, 216, 0.06)');
            halo.addColorStop(0.5, 'rgba(0, 245, 212, 0.04)');
            halo.addColorStop(1, 'rgba(0, 245, 212, 0)');
            context.fillStyle = halo;
            context.beginPath();
            context.arc(sunX, sunY, sunRadius * 1.9, 0, Math.PI * 2);
            context.fill();

            context.strokeStyle = 'rgba(255, 79, 216, 0.2)';
            context.lineWidth = 2;
            for (let i = 0; i < 6; i += 1) {
                const lineY = sunY - sunRadius * 0.45 + i * (sunRadius * 0.16);
                context.beginPath();
                context.moveTo(sunX - sunRadius * 0.68, lineY);
                context.lineTo(sunX + sunRadius * 0.68, lineY);
                context.stroke();
            }

            context.strokeStyle = 'rgba(0, 245, 212, 0.12)';
            context.lineWidth = 1.2;
            context.beginPath();
            context.arc(sunX, sunY, sunRadius * 1.18, Math.PI * 1.06, Math.PI * 1.95);
            context.stroke();

            context.shadowBlur = 0;
            animationFrameId = window.requestAnimationFrame(draw);
        };

        const start = function () {
            if (isRunning) {
                return;
            }
            isRunning = true;
            resize();
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

    const createStarWarsBackdrop = function (canvas) {
        if (!canvas) {
            return null;
        }

        const context = canvas.getContext('2d');
        let animationFrameId = null;
        let isRunning = false;
        let width = 0;
        let height = 0;
        let time = 0;
        let stars = [];
        let streaks = [];
        let ships = [];

        const createStars = function () {
            const count = Math.max(120, Math.floor((width * height) / 9500));
            return Array.from({ length: count }, function () {
                const depth = 0.35 + Math.random() * 1.4;
                return {
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: 0.4 + Math.random() * 1.9,
                    twinkle: Math.random() * Math.PI * 2,
                    drift: 0.04 + Math.random() * 0.22,
                    hue: Math.random() < 0.14 ? '141, 200, 255' : '246, 226, 122',
                    depth: depth
                };
            });
        };

        const createStreaks = function () {
            const count = Math.max(7, Math.floor(width / 240));
            return Array.from({ length: count }, function () {
                return {
                    x: Math.random() * width,
                    y: Math.random() * height * 0.8,
                    length: 90 + Math.random() * 220,
                    speed: 4 + Math.random() * 8,
                    alpha: 0.06 + Math.random() * 0.1
                };
            });
        };

        const createShips = function () {
            const count = Math.max(3, Math.floor(width / 520));
            return Array.from({ length: count }, function (_, index) {
                return {
                    x: width + Math.random() * width,
                    y: height * (0.22 + Math.random() * 0.5),
                    speed: 1 + Math.random() * 2.2,
                    size: 16 + Math.random() * 28,
                    hue: index % 2 === 0 ? '141, 200, 255' : '246, 226, 122',
                    tilt: -0.35 + Math.random() * 0.12,
                    alpha: 0.08 + Math.random() * 0.1
                };
            });
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
            stars = createStars();
            streaks = createStreaks();
            ships = createShips();
        };

        const draw = function () {
            if (!isRunning) {
                return;
            }

            time += 1;
            context.clearRect(0, 0, width, height);

            const background = context.createRadialGradient(width * 0.5, height * 0.45, width * 0.02, width * 0.5, height * 0.45, width * 0.75);
            background.addColorStop(0, 'rgba(18, 32, 76, 0.16)');
            background.addColorStop(0.45, 'rgba(8, 16, 42, 0.08)');
            background.addColorStop(1, 'rgba(2, 4, 12, 0)');
            context.fillStyle = background;
            context.fillRect(0, 0, width, height);

            const nebulaLeft = context.createRadialGradient(width * 0.18, height * 0.24, width * 0.01, width * 0.18, height * 0.24, width * 0.24);
            nebulaLeft.addColorStop(0, 'rgba(82, 126, 255, 0.12)');
            nebulaLeft.addColorStop(1, 'rgba(82, 126, 255, 0)');
            context.fillStyle = nebulaLeft;
            context.fillRect(0, 0, width, height);

            const nebulaRight = context.createRadialGradient(width * 0.82, height * 0.18, width * 0.01, width * 0.82, height * 0.18, width * 0.2);
            nebulaRight.addColorStop(0, 'rgba(255, 192, 92, 0.08)');
            nebulaRight.addColorStop(1, 'rgba(255, 192, 92, 0)');
            context.fillStyle = nebulaRight;
            context.fillRect(0, 0, width, height);

            stars.forEach(function (star) {
                star.y += star.drift * star.depth;
                if (star.y > height + 4) {
                    star.y = -4;
                    star.x = Math.random() * width;
                }

                const pulse = 0.4 + ((Math.sin((time * 0.015 * star.depth) + star.twinkle) + 1) * 0.35);
                context.fillStyle = 'rgba(' + star.hue + ', ' + (0.2 + pulse * 0.55).toFixed(2) + ')';
                context.shadowBlur = 6 + (pulse * 7);
                context.shadowColor = 'rgba(' + star.hue + ', ' + (0.12 + pulse * 0.25).toFixed(2) + ')';
                context.beginPath();
                context.arc(star.x, star.y, star.size * (0.85 + pulse * 0.4), 0, Math.PI * 2);
                context.fill();
            });

            context.shadowBlur = 0;
            streaks.forEach(function (streak) {
                streak.x -= streak.speed;
                streak.y += streak.speed * 0.18;
                if (streak.x + streak.length < 0 || streak.y - streak.length * 0.18 > height) {
                    streak.x = width + Math.random() * width * 0.3;
                    streak.y = Math.random() * height * 0.45;
                    streak.length = 90 + Math.random() * 220;
                    streak.speed = 4 + Math.random() * 8;
                    streak.alpha = 0.05 + Math.random() * 0.09;
                }

                const streakGradient = context.createLinearGradient(streak.x, streak.y, streak.x + streak.length, streak.y - (streak.length * 0.18));
                streakGradient.addColorStop(0, 'rgba(255, 232, 154, 0)');
                streakGradient.addColorStop(0.55, 'rgba(141, 200, 255, ' + streak.alpha.toFixed(2) + ')');
                streakGradient.addColorStop(1, 'rgba(255, 232, 154, 0)');
                context.strokeStyle = streakGradient;
                context.lineWidth = 1.1;
                context.beginPath();
                context.moveTo(streak.x, streak.y);
                context.lineTo(streak.x + streak.length, streak.y - (streak.length * 0.18));
                context.stroke();
            });

            ships.forEach(function (ship) {
                ship.x -= ship.speed;
                ship.y += Math.sin((time * 0.015) + ship.x * 0.002) * 0.15;
                if (ship.x < -ship.size * 3) {
                    ship.x = width + Math.random() * width * 0.5;
                    ship.y = height * (0.18 + Math.random() * 0.56);
                    ship.speed = 1 + Math.random() * 2.2;
                    ship.size = 16 + Math.random() * 28;
                    ship.alpha = 0.08 + Math.random() * 0.1;
                }

                context.save();
                context.translate(ship.x, ship.y);
                context.rotate(ship.tilt);
                context.strokeStyle = 'rgba(' + ship.hue + ', ' + ship.alpha.toFixed(2) + ')';
                context.lineWidth = 1.2;
                context.shadowBlur = 10;
                context.shadowColor = 'rgba(' + ship.hue + ', 0.14)';
                context.beginPath();
                context.moveTo(-ship.size * 0.8, 0);
                context.lineTo(ship.size * 0.7, 0);
                context.moveTo(-ship.size * 0.15, -ship.size * 0.18);
                context.lineTo(ship.size * 0.16, 0);
                context.lineTo(-ship.size * 0.15, ship.size * 0.18);
                context.stroke();
                context.restore();
            });

            const planetX = width * 0.82;
            const planetY = height * 0.24;
            const planetRadius = Math.min(width, height) * 0.09;
            const planet = context.createRadialGradient(planetX - planetRadius * 0.25, planetY - planetRadius * 0.35, planetRadius * 0.1, planetX, planetY, planetRadius);
            planet.addColorStop(0, 'rgba(255, 232, 154, 0.28)');
            planet.addColorStop(0.45, 'rgba(229, 184, 88, 0.18)');
            planet.addColorStop(1, 'rgba(229, 184, 88, 0)');
            context.fillStyle = planet;
            context.beginPath();
            context.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
            context.fill();

            const planetRim = context.createLinearGradient(planetX - planetRadius, planetY, planetX + planetRadius, planetY - planetRadius * 0.15);
            planetRim.addColorStop(0, 'rgba(255, 232, 154, 0)');
            planetRim.addColorStop(0.55, 'rgba(255, 232, 154, 0.2)');
            planetRim.addColorStop(1, 'rgba(141, 200, 255, 0.08)');
            context.strokeStyle = planetRim;
            context.lineWidth = 2;
            context.beginPath();
            context.arc(planetX, planetY, planetRadius * 0.98, Math.PI * 1.15, Math.PI * 1.98);
            context.stroke();

            const horizon = height * 0.83;
            const horizonGlow = context.createLinearGradient(0, horizon - 50, 0, horizon + 90);
            horizonGlow.addColorStop(0, 'rgba(92, 136, 255, 0)');
            horizonGlow.addColorStop(0.45, 'rgba(92, 136, 255, 0.06)');
            horizonGlow.addColorStop(1, 'rgba(8, 16, 42, 0)');
            context.fillStyle = horizonGlow;
            context.fillRect(0, horizon - 50, width, 140);

            const silhouette = context.createLinearGradient(0, horizon - 20, 0, height);
            silhouette.addColorStop(0, 'rgba(6, 10, 22, 0.2)');
            silhouette.addColorStop(1, 'rgba(2, 4, 12, 0.7)');
            context.fillStyle = silhouette;
            context.beginPath();
            context.moveTo(0, height);
            context.lineTo(0, horizon);
            for (let x = 0; x <= width; x += 60) {
                const peak = horizon - (12 + Math.random() * 24);
                context.lineTo(x + 12, peak);
                context.lineTo(x + 28, horizon - (6 + Math.random() * 14));
                context.lineTo(Math.min(width, x + 60), horizon);
            }
            context.lineTo(width, height);
            context.closePath();
            context.fill();

            const crawlGlow = context.createLinearGradient(width * 0.25, height * 0.92, width * 0.75, height * 0.55);
            crawlGlow.addColorStop(0, 'rgba(246, 226, 122, 0.02)');
            crawlGlow.addColorStop(0.5, 'rgba(246, 226, 122, 0.08)');
            crawlGlow.addColorStop(1, 'rgba(246, 226, 122, 0)');
            context.save();
            context.translate(width * 0.5, height * 0.87);
            context.rotate(-0.32);
            context.fillStyle = crawlGlow;
            context.fillRect(-width * 0.16, -8, width * 0.32, 16);
            context.restore();

            animationFrameId = window.requestAnimationFrame(draw);
        };

        const start = function () {
            if (isRunning) {
                return;
            }
            isRunning = true;
            resize();
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
        resize();

        return {
            start: start,
            stop: stop
        };
    };

    const createMatrixRain = function (canvas) {
        if (!canvas) {
            return null;
        }

        const context = canvas.getContext('2d');
        const haskellSource = [
            'qsortTR :: Ord a => [a] -> [a]',
            'qsortTR xs = go [xs] []',
            '  where',
            '    go [] acc = acc',
            '    go ([]:rest) acc = go rest acc',
            '    go ([x]:rest) acc = go rest (x : acc)',
            '    go ((p:ys):rest) acc =',
            '      let smaller = revFilter (<= p) ys []',
            '          larger  = revFilter (>  p) ys []',
            '      in go (larger : [p] : smaller : rest) acc',
            '',
            '    revFilter _ [] acc = acc',
            '    revFilter f (z:zs) acc',
            '      | f z       = revFilter f zs (z : acc)',
            '      | otherwise = revFilter f zs acc'
        ].join('');
        const glyphs = haskellSource.replace(/\s+/g, '');
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

        const randomGlyphPair = function () {
            return {
                main: randomGlyph(),
                echo: randomGlyph()
            };
        };

        const createOffsets = function (length, size) {
            let total = 0;
            return Array.from({ length: length }, function (_, index) {
                if (index === 0) {
                    return 0;
                }
                total += size * (1.15 + Math.random() * 1.45);
                return Math.round(total);
            });
        };

        const createColumn = function (x) {
            const length = 3 + Math.floor(Math.random() * 48);
            const size = fontSize * (0.7 + Math.random() * 0.7);
            const sizeRatio = size / fontSize;
            const sizeInfluence = Math.pow(sizeRatio, 1.35) * (0.95 + Math.random() * 1.25);
            const baseDrift = 0.45 + Math.random() * 0.95;
            const speedMagnitude = (baseDrift + sizeInfluence) * 0.5625;
            return {
                x: x,
                y: Math.random() * -height,
                speed: (Math.random() < 0.28 ? -1 : 1) * speedMagnitude,
                length: length,
                chars: Array.from({ length: length }, randomGlyphPair),
                size: size,
                offsets: createOffsets(length, size),
                brightness: 0.78 + Math.random() * 0.35,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 0.012 + Math.random() * 0.02,
                sparkTimestamps: []
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

        const spawnSpark = function (x, y, glyphPair, size) {
            const baseAngle = Math.atan2(y - pointer.y, x - pointer.x);
            const scatter = (Math.random() - 0.5) * 1.3;
            const speed = (2.4 + Math.random() * 3.8) * 3;
            sparks.push({
                x: x,
                y: y,
                vx: Math.cos(baseAngle + scatter) * speed,
                vy: Math.sin(baseAngle + scatter) * speed,
                glyph: glyphPair,
                alpha: 1,
                heat: 1,
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
                if (spark.trail.length > 3) {
                    spark.trail.length = 3;
                }
                spark.x += spark.vx * (elapsed / 16);
                spark.y += spark.vy * (elapsed / 16);
                spark.vx *= 0.987;
                spark.vy = (spark.vy * 0.987) + 0.015;
                if (spark.x < 0 || spark.x > width) {
                    spark.x = Math.min(width, Math.max(0, spark.x));
                    spark.vx *= -0.82;
                }
                if (spark.y < 0 || spark.y > height) {
                    spark.y = Math.min(height, Math.max(0, spark.y));
                    spark.vy *= -0.82;
                }
                spark.alpha -= 0.0044;
                spark.heat = Math.max(0, spark.heat - 0.01);

                if (spark.alpha <= 0) {
                    return false;
                }

                context.font = spark.size + 'px "Courier New", monospace';
                spark.trail.forEach(function (trailPoint, index) {
                    const trailAlpha = Math.max(0, spark.alpha * (0.11 - index * 0.028));
                    if (trailAlpha <= 0) {
                        return;
                    }
                    const trailRed = Math.round(120 + (135 * spark.heat));
                    const trailGreen = Math.round(220 - (70 * spark.heat));
                    const trailBlue = Math.round(120 - (110 * spark.heat));
                    context.fillStyle = 'rgba(' + trailRed + ', ' + trailGreen + ', ' + trailBlue + ', ' + trailAlpha.toFixed(2) + ')';
                    context.shadowBlur = 0;
                    context.fillText(spark.glyph.main, trailPoint.x, trailPoint.y);
                    context.fillStyle = 'rgba(' + trailRed + ', ' + trailGreen + ', ' + trailBlue + ', ' + Math.max(0, trailAlpha * 0.72).toFixed(2) + ')';
                    context.fillText(spark.glyph.echo, trailPoint.x + (spark.size * 0.16), trailPoint.y + (spark.size * 0.08));
                });
                const headRed = Math.round(180 + (75 * spark.heat));
                const headGreen = Math.round(255 - (95 * spark.heat));
                const headBlue = Math.round(180 - (165 * spark.heat));
                context.fillStyle = 'rgba(' + headRed + ', ' + headGreen + ', ' + headBlue + ', ' + spark.alpha.toFixed(2) + ')';
                context.shadowBlur = 5;
                context.shadowColor = 'rgba(' + headRed + ', ' + headGreen + ', ' + headBlue + ', ' + Math.max(0.16, spark.alpha * 0.45).toFixed(2) + ')';
                context.fillText(spark.glyph.main, spark.x, spark.y);
                context.fillStyle = 'rgba(' + headRed + ', ' + headGreen + ', ' + headBlue + ', ' + Math.max(0.04, spark.alpha * 0.78).toFixed(2) + ')';
                context.fillText(spark.glyph.echo, spark.x + (spark.size * 0.16), spark.y + (spark.size * 0.08));
                return true;
            });

            context.font = fontSize + 'px "Courier New", monospace';

            columns.forEach(function (column) {
                if (frameCount % 10 === 0) {
                    column.chars = column.chars.map(randomGlyphPair);
                }
                column.sparkTimestamps = column.sparkTimestamps.filter(function (sparkTimestamp) {
                    return timestamp - sparkTimestamp < 1000;
                });
                const influenceRadius = Math.max(16, column.size * 1.05);
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

                    if (hitPointer && column.sparkTimestamps.length < 5 && Math.random() < 0.1) {
                        column.sparkTimestamps.push(timestamp);
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
                    context.fillText(glyph.main, x, y);
                    const echoAlpha = Math.max(0.03, Math.min(0.55, 0.72 * brightness * (step === 0 ? 0.75 : 0.55)));
                    context.fillStyle = 'rgba(139, 255, 139, ' + echoAlpha.toFixed(2) + ')';
                    context.shadowBlur = Math.max(0, context.shadowBlur * 0.5);
                    context.fillText(glyph.echo, x + (column.size * 0.16), y + (column.size * 0.08));
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
                    column.sparkTimestamps = refreshed.sparkTimestamps;
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

    if (cyberpunkCanvas) {
        cyberpunkController = createCyberpunkBackdrop(cyberpunkCanvas);
    }

    if (starWarsCanvas) {
        starWarsController = createStarWarsBackdrop(starWarsCanvas);
    }

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
        if (cyberpunkController) {
            if (theme === 'cyberpunk') {
                cyberpunkController.start();
            } else {
                cyberpunkController.stop();
            }
        }
        if (starWarsController) {
            if (theme === 'starwars') {
                starWarsController.start();
            } else {
                starWarsController.stop();
            }
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
