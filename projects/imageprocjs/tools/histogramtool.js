/**
 * Created by PhG on 11/17/13.
 */

var HistogramTool = function() {
    var width = 255, height = 255;
    var mode = 'brightness';

    // histogram
    var hist = [];
    var chist = [];
    var svg, area, curve;

    this.bindImage = function( I ) {
        switch( mode ) {
            case 'brightness': {
                var h = histogram(I, 0, 0, I.w, I.h);
                this.bindHistogram(h);
                break;
            }
            case 'rgb':
            {
                var h = colorHistogram(I, 0, 0, I.w, I.h);
                this.bindHistogram(h);
                break;
            }
            default: {
                throw 'invalid histogram mode!';
            }
        }
    };

    this.bindHistogram = function( h ) {
        console.log('bind histogram');
        switch( mode ) {
            case 'brightness': {
                hist = [];
                var cumu = [];
                var sum = 0;
                var maxHist = 0;
                for(var i=0;i< h.length;i++) {
                    hist[i] = {lev: i, cnt: h[i]};
                    sum = sum + h[i];
                    chist[i] = {lev: i, cnt: sum};
                    maxHist = Math.max(maxHist, h[i]);
                }
        
                // normalize
                var factor = 0.9 / maxHist;
                var factor2 = 1.0 / sum;
                for(var i=0;i< h.length;i++) {
                    hist[i].cnt *= factor;
                    chist[i].cnt *= factor2;
                }
        
                console.log(hist);
                console.log(chist);
                break;
            }
            case 'rgb': {
                
                for(var c=0;c<3;c++) {
                                
                    hist[c] = [];
                    var sum = 0;
                    var maxHist = 0;
                    for(var i=0;i< h[c].length;i++) {
                        hist[c][i] = {lev: i, cnt: h[c][i]};
                        sum += h[c][i];
                        maxHist = Math.max(maxHist, h[c][i]);
                    }
            
                    // normalize
                    var factor = 0.9 / maxHist;
                    for(var i=0;i< h[c].length;i++) {
                        hist[c][i].cnt *= factor;
                    }
            
                    //console.log(hist[c]);
                }
                
                break;
            }
            default: {
                throw 'invalid histogram mode!';
            }
        }

        redraw();
    };

    function redraw() {
        // display the histogram
        
        switch(mode) {
            case 'rgb': {
                for(var i=0;i<3;i++) {
                    svg.select("#hist" + i).datum(hist[i])
                        .attr("class", "area")
                        .attr("d", area[i]);                    
                }
                break;
            }
            case 'brightness': {
                svg.select("#hist").datum(hist)
                    .attr("class", "area")
                    .attr("d", area);

                svg.select("#cumucurve").datum(chist)
                    .attr("class", "curve")
                    .attr("d", curve);
                break;
            }
        }
    }

    this.init = function( target, m ) {
        if( !target ) {
            throw "failed to initialize histogram tool";
        }

        mode = m || mode;

        var x = d3.scale.linear()
            .range([0, width]);
        var y = d3.scale.linear()
            .range([height, 0]);
        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");
        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left");

        svg = d3.select(target).append("svg")
            .attr("id", "histogram")
            .attr("class", "back")
            .attr("width", width)
            .attr("height", height);

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end");

        x.domain([0, 255]);
        y.domain([0.0, 1.0]);

        switch( mode ) {
            case 'brightness':
            {
                area = d3.svg.area()
                    .x(function(d) { return x(d.lev); })
                    .y0(height)
                    .y1(function(d) { return y(d.cnt); });

                curve = d3.svg.line()
                    .x(function(d) { return x(d.lev); })
                    .y(function(d) { return y(d.cnt); })
                    .interpolate('linear');

                svg.append("path")
                    .datum(hist)
                    .attr("id", 'hist')
                    .attr("class", "area")
                    .attr("d", area);

                svg.append("path")
                    .datum(chist)
                    .attr("id", 'cumucurve')
                    .attr("class", "curve")
                    .attr("d", curve)
                    .attr("stroke", "red")
                    .attr("stroke-width", 2)
                    .attr("fill", "none");
                break;
            }
            case 'rgb': {
                hist = new Array(3);
                area = new Array(3);
                var cls = ['red', 'green', 'blue'];
                for(var i=0;i<3;i++) {
                    hist[i] = [];
                    area[i] = d3.svg.area()
                        .x(function(d) { return x(d.lev); })
                        .y0(height)
                        .y1(function(d) { return y(d.cnt); });
                    svg.append("path")
                        .attr("id", 'hist' + i)
                        .datum(hist[i])
                        .attr("class", "area")
                        .attr("d", area[i]);
                    $('#hist' + i).addClass( cls[i] );
                }
                break;
            }
            default: {
                throw 'invalid histogram mode!';
            }
        }
    }
};