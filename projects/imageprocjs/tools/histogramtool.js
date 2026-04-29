/**
 * Created by PhG on 11/17/13.
 * Rewritten to use Canvas API instead of D3.js
 */

var HistogramTool = function() {
    var width = 255, height = 255;
    var mode = 'brightness';

    var hist = [];
    var chist = [];
    var canvas;
    var ctx;

    var axes = {
        draw: function() {
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, height); ctx.lineTo(width, height);
            ctx.stroke();
            
            ctx.fillStyle = '#888';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Intensity (0-255)', width / 2, height - 4);
            
            ctx.save();
            ctx.translate(10, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Count / CDF', 0, 0);
            ctx.restore();
        }
    };

    this.bindImage = function( I ) {
        switch( mode ) {
            case 'brightness': {
                var h = histogram(I, 0, 0, I.w, I.h);
                this.bindHistogram(h);
                break;
            }
            case 'rgb': {
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
        
                var factor = 0.9 / maxHist;
                var factor2 = 1.0 / sum;
                for(var i=0;i< h.length;i++) {
                    hist[i].cnt *= factor;
                    chist[i].cnt *= factor2;
                }
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
                    var factor = 0.9 / maxHist;
                    for(var i=0;i< h[c].length;i++) {
                        hist[c][i].cnt *= factor;
                    }
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
        ctx.clearRect(0, 0, width, height);
        axes.draw();

        ctx.beginPath();
        ctx.lineWidth = 1;

        switch(mode) {
            case 'rgb': {
                var colors = ['rgba(255, 80, 80, 0.6)', 'rgba(80, 255, 80, 0.6)', 'rgba(80, 80, 255, 0.6)'];
                for(var i=0;i<3;i++) {
                    ctx.fillStyle = colors[i];
                    ctx.strokeStyle = colors[i].replace('0.6', '1');
                    ctx.beginPath();
                    for(var j=0; j<hist[i].length; j++) {
                        var x = hist[i][j].lev;
                        var y = height - (hist[i][j].cnt * height); // Scale y to height
                        if (j === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.fill();
                }
                break;
            }
            case 'brightness': {
                // Histogram area
                ctx.fillStyle = 'rgba(78, 246, 255, 0.6)';
                ctx.strokeStyle = 'rgba(78, 246, 255, 1)';
                ctx.beginPath();
                for(var j=0; j<hist.length; j++) {
                    var x = hist[j].lev;
                    var y = height - (hist[j].cnt * height);
                    if (j === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.fill();
                ctx.stroke();

                // CDF curve
                ctx.strokeStyle = 'rgba(255, 79, 216, 1)';
                ctx.beginPath();
                for(var j=0; j<chist.length; j++) {
                    var x = chist[j].lev;
                    var y = height - (chist[j].cnt * height);
                    if (j === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                break;
            }
        }
    }

    this.init = function( target, m ) {
        if( !target ) {
            throw "failed to initialize histogram tool";
        }

        mode = m || mode;

        var container = document.querySelector(target);
        if (!container) throw "Target not found";

        canvas = document.createElement('canvas');
        canvas.id = "histogram";
        canvas.className = "back";
        canvas.width = width;
        canvas.height = height;
        container.appendChild(canvas);

        ctx = canvas.getContext('2d');
        redraw();
    }
};
