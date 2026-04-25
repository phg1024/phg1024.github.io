/**
 * Created by peihongguo on 9/30/13.
 */

var CurveTool = function() {
    var width = 255,
        height = 255;

    var nextPointId = 0;
    var points = makeDefaultPoints();

    var dragged = null,
        selected = null;

    var line = d3.svg.line()
        .x(function(d) { return d.x; })
        .y(function(d) { return d.y; })
        .interpolate("cardinal");
    var svg;

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
        svg.select("path.line")
            .datum(points)
            .attr("d", line);

        var circle = svg.selectAll("circle")
            .data(points, function(d) { return d.id; });

        circle.enter().append("circle")
            .attr("r", 1e-6)
            .on("mousedown", function(d) {
                selected = d;
                dragged = d.locked ? null : d;
                redraw();
            })
            .transition()
            .duration(250)
            .attr("r", 6.5);

        circle
            .classed("selected", function(d) { return d === selected; })
            .classed("locked", function(d) { return d.locked; })
            .attr("cx", function(d) { return d.x; })
            .attr("cy", function(d) { return d.y; });

        circle.exit().remove();

        if (d3.event) {
            d3.event.preventDefault();
            d3.event.stopPropagation();
        }
    }

    function pathPos(x) {
        var pathEl = svg.select("path.line").node();
        var pathLength = pathEl.getTotalLength();
        var beginning = clampValue(x, 0, width);
        var end = pathLength;
        var target;
        var pos;

        while (true) {
            target = Math.floor((beginning + end) / 2);
            pos = pathEl.getPointAtLength(target);
            if ((target === end || target === beginning) && pos.x !== x) {
                break;
            }
            if (pos.x > x) end = target;
            else if (pos.x < x) beginning = target;
            else break;
        }
        return pos;
    }

    function mousedown() {
        var mouse = d3.mouse(svg.node());
        var x = clampValue(mouse[0], 0, width);
        var y = clampValue(mouse[1], 0, height);
        var pos = pathPos(x);

        if (pos && !isNaN(pos.y)) {
            y = clampValue(pos.y, 0, height);
        }

        selected = dragged = createPoint(x, y, false);
        points.push(selected);
        sortpoints();
        redraw();
        $(document).trigger('curvechanged');
    }

    function mousemove() {
        if (!dragged) return;

        var mouse = d3.mouse(svg.node());
        dragged.x = clampValue(mouse[0], 0, width);
        dragged.y = clampValue(mouse[1], 0, height);

        sortpoints();
        redraw();
        $(document).trigger('curvechanged');
    }

    function mouseup() {
        if (!dragged) return;
        mousemove();
        dragged = null;
        $(document).trigger('curvechanged');
    }

    function keydown() {
        if (!selected || selected.locked) return;

        switch (d3.event.keyCode) {
            case 8:
            case 46: {
                var index = points.indexOf(selected);
                if (index === -1) return;
                points.splice(index, 1);
                selected = null;
                redraw();
                $(document).trigger('curvechanged');
                break;
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

        svg = d3.select(target).append("svg")
            .attr("id", "curvetool")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("tabindex", 1);

        svg.append("rect")
            .attr("id", "rect")
            .attr("width", width)
            .attr("height", height)
            .on("mousedown", mousedown);

        svg.append("path")
            .datum(points)
            .attr("class", "line");

        d3.select(window)
            .on("mousemove.curvetool", mousemove)
            .on("mouseup.curvetool", mouseup)
            .on("keydown.curvetool", keydown);

        redraw();
    };
};
