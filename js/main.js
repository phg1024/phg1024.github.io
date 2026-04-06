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
        const glyphs = '01<>[]{}()$#@*+-=<>|/\\\\ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let columns = [];
        let animationFrameId = null;
        let lastFrame = 0;
        let isRunning = false;
        let width = 0;
        let height = 0;
        let fontSize = 18;
        let columnWidth = fontSize;

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
            const columnCount = Math.max(12, Math.floor(width / columnWidth));
            columns = Array.from({ length: columnCount }, function () {
                return {
                    x: 0,
                    y: Math.random() * -height,
                    speed: 1.5 + Math.random() * 3.5,
                    length: 6 + Math.floor(Math.random() * 18)
                };
            }).map(function (column, index) {
                column.x = index * columnWidth;
                return column;
            });
            context.font = fontSize + 'px "Courier New", monospace';
            context.textBaseline = 'top';
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

            context.fillStyle = 'rgba(3, 8, 5, 0.12)';
            context.fillRect(0, 0, width, height);

            columns.forEach(function (column) {
                for (let step = 0; step < column.length; step += 1) {
                    const y = column.y - (step * fontSize);
                    if (y < -fontSize || y > height + fontSize) {
                        continue;
                    }

                    const glyph = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
                    if (step === 0) {
                        context.fillStyle = 'rgba(224, 255, 224, 0.95)';
                        context.shadowBlur = 14;
                        context.shadowColor = 'rgba(139, 255, 139, 0.65)';
                    } else if (step < 4) {
                        context.fillStyle = 'rgba(139, 255, 139, 0.82)';
                        context.shadowBlur = 9;
                        context.shadowColor = 'rgba(80, 255, 140, 0.45)';
                    } else {
                        const alpha = Math.max(0.08, 0.45 - (step / column.length) * 0.4);
                        context.fillStyle = 'rgba(70, 210, 90, ' + alpha.toFixed(2) + ')';
                        context.shadowBlur = 0;
                    }
                    context.fillText(glyph, column.x, y);
                }

                context.shadowBlur = 0;
                column.y += column.speed * (elapsed / 16);
                if (column.y - column.length * fontSize > height && Math.random() > 0.975) {
                    column.y = -Math.random() * height * 0.6;
                    column.speed = 1.5 + Math.random() * 3.5;
                    column.length = 6 + Math.floor(Math.random() * 18);
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
