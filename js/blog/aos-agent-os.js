window.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("chart-embed");
  if (!container || typeof Plotly === "undefined") {
    return;
  }

  var data = [{
    x: [0, 4, 5, 6, 7, 8, 10, 13, 14],
    y: [21.285, 14.407, 15.103, 6.688, 6.966, 5.267, 3.424, 6.115, 1.97],
    type: "scatter",
    mode: "lines+markers+text",
    name: "Execution Time",
    line: { color: "#2c3e50", width: 4, shape: "spline", smoothing: 1.3 },
    marker: {
      size: 12,
      color: ["#27ae60", "#f39c12", "#f39c12", "#3498db", "#3498db", "#3498db", "#e74c3c", "#9b59b6", "#27ae60"],
      symbol: "circle",
      line: { color: "white", width: 2 }
    },
    text: [
      "Baseline\n21.285ms",
      "Round 4\n14.407ms",
      "Round 5\n15.103ms<br>(1.41x)",
      "Round 6<br>6.688ms<br>(3.18x)<br><span style=\"color:#e74c3c\">WRONG PIXELS</span>",
      "Round 7<br>6.966ms<br>(3.04x)<br><span style=\"color:#e74c3c\">WRONG PIXELS</span>",
      "Round 8<br>5.267ms<br>(4.04x)<br><span style=\"color:#e74c3c\">WRONG PIXELS</span>",
      "Round 10<br>3.424ms<br><span style=\"color:#e74c3c\">6.2x - WRONG PIXELS</span>",
      "Round 13<br>6.115ms<br><span style=\"color:#27ae60\">CORRECT<br>275K pixels</span>",
      "Round 14<br>1.97ms<br><span style=\"color:#27ae60\">10.8x - TARGET ✓</span>"
    ],
    textposition: "top center",
    textfont: { size: 11, color: "#333", family: "Arial, sans-serif" },
    hoverinfo: "x+y+name"
  }];

  var annotations = [
    { x: 2, y: 18, xref: "x", yref: "y", showarrow: false,
      text: "<span style=\"font-size:11px;\">Round 4: Fixed monochrome</span><br><span style=\"font-size:10px;color:#666;\">Corrected discriminant: b*b - 4*a*c</span>",
      align: "left", bgcolor: "rgba(243,156,18,0.1)", borderpad: 8 },
    { x: 5.5, y: 12, xref: "x", yref: "y", showarrow: false,
      text: "<span style=\"font-size:11px;\">Rounds 6-8: Precomputation</span><br><span style=\"font-size:10px;color:#666;\">~6-7ms but WRONG pixels (275K vs 1.7K)</span>",
      align: "left", bgcolor: "rgba(52,152,219,0.1)", borderpad: 8 },
    { x: 8.5, y: 8, xref: "x", yref: "y", showarrow: false,
      text: "<span style=\"font-size:11px;\">Round 10: Faster but WRONG</span><br><span style=\"font-size:10px;color:#666;\">Only 34K non-black pixels instead of 275K</span>",
      align: "left", bgcolor: "rgba(231,76,60,0.1)", borderpad: 8 },
    { x: 12, y: 10, xref: "x", yref: "y", showarrow: false,
      text: "<span style=\"font-size:11px;\">Round 13: Pivot to safety</span><br><span style=\"font-size:10px;color:#666;\">Precomputed oc, static arrays - CORRECT</span>",
      align: "left", bgcolor: "rgba(155,89,182,0.1)", borderpad: 8 },
    { x: 13.5, y: 4, xref: "x", yref: "y", showarrow: false,
      text: "<span style=\"font-size:11px;\">Round 14: Multi-threading</span><br><span style=\"font-size:10px;color:#666;\">4 threads, no vector, 1/a precomputed - 10.8x!</span>",
      align: "left", bgcolor: "rgba(39,174,96,0.1)", borderpad: 8 }
  ];

  var layout = {
    title: false,
    showlegend: false,
    margin: { t: 40, r: 30, b: 80, l: 60 },
    xaxis: {
      title: "Optimization Round",
      range: [-1, 15],
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.1)",
      tickmode: "array",
      tickvals: [0, 4, 5, 6, 7, 8, 10, 13, 14],
      ticktext: ["Baseline", "R4<br>Monochrome", "R5<br>Safe", "R6<br>Fast/WRONG", "R7<br>Fast/WRONG", "R8<br>Fastest/WRONG", "R10<br>WRONG", "R13<br>Correct", "R14<br>Target"],
      titlefont: { size: 14, color: "#666" },
      tickfont: { size: 10 },
      tickangle: -45
    },
    yaxis: {
      title: "Execution Time (ms)",
      range: [0, 24],
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.1)",
      tickfont: { size: 12 },
      titlefont: { size: 14, color: "#666" }
    },
    annotations: annotations,
    hovermode: "closest",
    dragmode: "pan"
  };

  Plotly.newPlot("chart-embed", data, layout, {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    scrollZoom: true
  });
});
