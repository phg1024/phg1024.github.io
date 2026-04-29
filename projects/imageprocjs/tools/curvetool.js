/**
 * Created by peihongguo on 9/30/13.
 * Rewritten to use Canvas API instead of D3.js
 */

var CurveTool = function() {
    var width = 255,
        height = 255;

    var nextPointId = 0;
    var points = makeDefaultPoints();

    var dragged = null,
        selected = null;

    var canvas;
    var ctx;
    var containerId;

    function createPoint(x, y, locked) {
        return {
            id: nextPointId++,
            x: x,
            y: y,
            locked: !!locked
        };
    }

    function makeDefaultPoints() {
        return [
            createPoint(0, height, true),
            createPoint(width, 0, true)
        ];
    }

    function clampValue(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function sortpoints() {
        points.sort(function(a, b) {
            if (a.x === b.x) return a.y - b.y;
            return a.x - b.x;
        });
    }

    function redraw() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw axes
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, height); ctx.lineTo(width, height);
        ctx.stroke();

        // Calculate curve points
        var curvePoints = [];
        for (var x = 0; x <= width; x++) {
            for (var i = 0; i < points.length - 1; i++) {
                if (x >= points[i].x && x <= points[i+1].x) {
                    var px, py;
                    var xl = points[i].x, yl = points[i].y;
                    var xr = points[i+1].x, yr = points[i+1].y;
                    var mxl = 0.5 * (points[i+1].x - points[i].x), myl = 0.5 * (points[i+1].y - points[i].y);
                    var mxr = 0.5 * (points[i+1].x - points[i-1].x, myr = 0.5 * (points[i+1].y - points[i-1].y);
                    // simplified catmull-rom just for drawing path
                    // actually just drawing points and lines first for simplicity or use the CatmullRomCurve logic
                    // Let's reuse the existing CatmullRomCurve logic from curve.js if accessible, 
                    // but since we don't have access in this scope easily without imports, I'll replicate the path logic.
                    
                    // Re-implementing simple card spline or just drawing control points
                    break;
                }
            }
        }
        
        // Draw the curve using CatmullRomCurve logic
        var pts = [];
        for (var i = 0; i < points.length; i++) {
            pts.push({x: points[i].x, y: points[i].y});
        }
        var curve = new CatmullRomCurve(pts);

        ctx.beginPath();
        ctx.strokeStyle = 'var(--accent-secondary)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'var(--accent-glow)';

        for (var x = 0; x <= width; x++) {
            var y = curve.getValue(x);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw points
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.locked ? 4 : 6.5, 0, Math.PI * 2);
            ctx.fillStyle = p.locked ? '#666' : (p === selected ? 'var(--accent)' : 'var(--text)');
            ctx.fill();
            if (!p.locked) {
                ctx.strokeStyle = 'var(--accent-secondary)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    function pathPos(x) {
        var pts = [];
        for (var i = 0; i < points.length; i++) {
            pts.push({x: points[i].x, y: points[i].y});
        }
        var curve = new CatmullRomCurve(pts);
        var y = curve.getValue(x);
        return { x: x, y: y };
    }

    function getMousePos(evt) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }

    function mousedown(evt) {
        var m = getMousePos(evt);
        var x = clampValue(m.x, 0, width);
        var y = clampValue(m.y, 0, height);
        var pos = pathPos(x);

        if (pos && !isNaN(pos.y)) {
            y = clampValue(pos.y, 0, height);
        }

        selected = dragged = createPoint(x, y, false);
        points.push(selected);
        sortpoints();
        redraw();
        document.dispatchEvent(new Event('curvechanged'));
    }

    function mousemove(evt) {
        if (!dragged) return;
        var m = getMousePos(evt);
        dragged.x = clampValue(m.x, 0, width);
        dragged.y = clampValue(m.y, 0, height);
        sortpoints();
        redraw();
        document.dispatchEvent(new Event('curvechanged'));
    }

    function mouseup() {
        if (!dragged) return;
        mousemove(document); // snap to curve one last time
        dragged = null;
        document.dispatchEvent(new Event('curvechanged'));
    }

    function keydown(evt) {
        if (!selected || selected.locked) return;
        if ([8, 46].indexOf(evt.keyCode) !== -1) { // Backspace, Delete
            var index = points.indexOf(selected);
            if (index !== -1) {
                points.splice(index, 1);
                selected = null;
                redraw();
                document.dispatchEvent(new Event('curvechanged'));
            }
        }
    }

    this.resetCurveTool = function() {
        points = makeDefaultPoints();
        dragged = null;
        selected = null;
        redraw();
    };

    this.getLUT = function() {
        var pts = [];
        for (var i = 0; i < points.length; i++) {
            pts.push({x: points[i].x, y: 255 - points[i].y});
        }
        var crCurve = new CatmullRomCurve(pts);
        var lut = [0];
        for (var j = 1; j < 255; j++) {
            lut[j] = crCurve.getValue(j);
        }
        lut.push(255);
        return lut;
    };

    this.init = function(target) {
        if (!target) {
            throw "failed to initialize curve tool";
        }
        
        var container = document.querySelector(target);
        if (!container) throw "Target not found";

        cursor: 'pointer';
        canvas = document.createElement('canvas');
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        canvas.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        canvas.setAttribute('tabindex', 1);
        container.appendChild(canvas);
        ctx = canvas.getContext('2d');

        canvas.addEventListener('mousedown', mousedown);
        document.addEventListener('mousemove', mousemove);
        document.addEventListener('mouseup', mouseup);
        canvas.addEventListener('keydown', keydown);

        redraw();
    };
};
