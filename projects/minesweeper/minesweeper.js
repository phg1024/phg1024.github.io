/**
 * Created by peihongguo on 12/6/13.
 */

var EMPTY = -2;
var BOMB = -1;
var boardData = [];

function showPopup(message, callback) {
    if (popupOpen) return;
    popupOpen = true;

    var overlay = document.createElement('div');
    overlay.className = 'ms-popup-overlay';

    var popup = document.createElement('div');
    popup.className = 'ms-popup';
    popup.innerHTML = '<p class="ms-popup-msg">' + message + '</p>'
                     + '<button class="ms-popup-btn" id="ms-popup-btn">OK</button>';

    overlay.appendChild(popup);
    popup.onclick = function(e) { e.stopPropagation(); };

    document.body.appendChild(overlay);
    document.body.classList.add('ms-popup-open');

    function dismiss() {
        document.body.removeChild(overlay);
        document.body.classList.remove('ms-popup-open');
        popupOpen = false;
        if (callback) callback();
    }

    overlay.onclick = dismiss;
    document.getElementById('ms-popup-btn').onclick = dismiss;
    document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape' || e.key === 'Enter') { dismiss(); document.removeEventListener('keydown', handler); }
    });
}

var popupOpen = false;

function countBombs(x, y) {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;

    var cnt = 0;
    for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
            var nx = x + j;
            var ny = y + i;
            if (nx < 0 || ny < 0 || nx >= bs || ny >= bs) continue;
            var idx = ny * bs + nx;
            if (boardData[idx] === BOMB) cnt++;
        }
    }
    return cnt;
}

function expand(x, y) {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;

    if (x < 0 || y < 0 || x >= bs || y >= bs) return;

    var idx = y * bs + x;
    if (boardData[idx] >= 0 || boardData[idx] === BOMB) return;

    boardData[idx] = countBombs(x, y);
    var piece = document.getElementById('piece' + idx);
    piece.classList.remove('raw');
    piece.classList.add('expanded');

    if (boardData[idx] === 0) {
        piece.innerHTML = '';
    } else {
        piece.innerHTML = '<span class="ms-cell ms-cell-' + boardData[idx] + '">' + boardData[idx] + '</span>';
    }

    if (boardData[idx] === 0) {
        for (var i = -1; i <= 1; i++) {
            for (var j = -1; j <= 1; j++) {
                expand(x + j, y + i);
            }
        }
    }
}

function revealAll(x, y) {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;

    for (var i = 0; i < bs; i++) {
        for (var j = 0; j < bs; j++) {
            var idx = i * bs + j;
            var piece = document.getElementById('piece' + idx);
            piece.classList.remove('raw');
            piece.classList.add('expanded');

            if (idx === y * bs + x) {
                piece.innerHTML = '<span class="ms-cell ms-cell-explode">\ud83d\udd25</span>';
            } else if (boardData[idx] === BOMB) {
                piece.innerHTML = '<span class="ms-cell ms-cell-bomb">\ud83d\udca3</span>';
            } else if (boardData[idx] !== EMPTY) {
                piece.innerHTML = '<span class="ms-cell ms-cell-' + boardData[idx] + '">' + boardData[idx] + '</span>';
            } else {
                boardData[idx] = countBombs(j, i);
                if (boardData[idx] === 0) {
                    piece.innerHTML = '';
                } else {
                    piece.innerHTML = '<span class="ms-cell ms-cell-' + boardData[idx] + '">' + boardData[idx] + '</span>';
                }
            }
        }
    }
}

function checkState() {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;

    var cnt = 0;
    for (var i = 0; i < bs * bs; i++) {
        var piece = document.getElementById('piece' + i);
        if (piece.classList.contains('raw')) cnt++;
    }
    console.log('raw pieces = ' + cnt);

    var bText = document.getElementById('bombs');
    var nbombs = parseInt(bText.value) || 0;
    console.log('bombs = ' + nbombs);

    if (cnt === nbombs) {
        revealAll();
        setTimeout(function () { showPopup('\ud83c\udf89 You win!'); }, 500);
    }
}

function play(x, y) {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;
    var idx = y * bs + x;

    if (boardData[idx] === BOMB) {
        revealAll(x, y);
        setTimeout(function () { showPopup('\ud83d\udca3 Hit a bomb! You lose.'); }, 500);
    } else {
        expand(x, y);
        checkState();
    }
}

function initBombs() {
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;
    var gridSize = bs * bs - 1;

    var bText = document.getElementById('bombs');
    var nbombs = parseInt(bText.value) || 8;

    if (nbombs > gridSize) {
        showPopup('Maximum number of bombs is ' + gridSize);
        nbombs = gridSize;
    } else if (nbombs < 1) {
        showPopup('Minimum number of bombs is 1');
        nbombs = 1;
    }

    bText.value = nbombs;

    var idx = 0;
    for (var i = 0; i < bs; i++) {
        for (var j = 0; j < bs; j++, idx++) {
            boardData[idx] = EMPTY;
        }
    }

    while (nbombs > 0) {
        var pidx = Math.floor(Math.random() * gridSize);
        if (boardData[pidx] !== BOMB) {
            boardData[pidx] = BOMB;
            nbombs--;
        }
    }
    console.log(boardData);
}

function init() {
    console.log('initializing ...');

    var initButton = document.getElementById('initButton');
    initButton.onclick = initBoard;

    var revealButton = document.getElementById('revealButton');
    revealButton.onclick = revealAll;

    initBoard();
}

function initBoard() {
    console.log('initializing board ...');

    var board = document.getElementById('board');

    while (board.childNodes.length > 0) {
        board.removeChild(board.childNodes[0]);
    }

    var table = document.createElement('table');
    var bsText = document.getElementById('fieldsize');
    var bs = parseInt(bsText.value) || 10;

    if (bs > 48) {
        showPopup('Maximum board size is 48x48!');
        bs = 48;
        bsText.value = 48;
    }
    if (bs < 2) {
        showPopup('Minimum board size is 2x2!');
        bs = 2;
        bsText.value = 2;
    }

    var idx = 0;
    for (var i = 0; i < bs; i++) {
        var tr = document.createElement('tr');
        for (var j = 0; j < bs; j++, idx++) {
            var td = document.createElement('td');
            td.setAttribute('id', 'piece' + idx);
            td.setAttribute('class', 'raw');
            td.x = j;
            td.y = i;

            td.onmouseover = function () {
                console.log(boardData[this.y * bs + this.x]);
            };

            td.onmousedown = function () {
                console.log('hit');
                this.classList.remove('raw');
                this.classList.add('expanded');
                play(this.x, this.y);
            };

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    board.appendChild(table);

    initBombs();
}

window.onload = init;
