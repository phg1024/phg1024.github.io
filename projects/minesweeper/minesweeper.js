/**
 * Created by peihongguo on 12/6/13.
 */

var EMPTY = -2;
var BOMB = -1;
var boardData = [];
var color = ['', 'black', 'green', 'blue', 'red', 'purple', 'cyan', 'yellow', 'orange'];

function countBombs(x, y)
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;

    var cnt = 0;
    for(var i=-1;i<=1;i++)
    {
        for(var j=-1;j<=1;j++)
        {
            var nx = x+j;
            var ny = y+i;

            if( nx < 0 || ny < 0 || nx >= bs || ny >= bs )
                continue;
            else
            {
                var idx =  ny * bs + nx;
                if( boardData[idx] === BOMB ) cnt++;
            }
        }
    }
    return cnt;
}

function expand(x, y)
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;

    // out of bound
    if( x < 0 || y < 0 || x >= bs || y >= bs )
        return;

    var idx = y * bs + x;

    // explored
    if( boardData[idx] >= 0 || boardData[idx] == BOMB )
    {
        return;
    }
    else
    {
        boardData[idx] = countBombs(x, y);
        var piece = document.getElementById('piece'+idx);
        piece.innerHTML = (boardData[idx]===0)?'':boardData[idx];
        piece.setAttribute('class', 'expanded');
        piece.style.color = color[boardData[idx]];

        if( boardData[idx] === 0 )
        {
            for(var i=-1;i<=1;i++)
            {
                for(var j=-1;j<=1;j++)
                {
                    var nx = x+j;
                    var ny = y+i;

                    expand(nx, ny);
                }
            }
        }
    }
}

function revealAll(x, y)
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;

    var idx = 0;
    for(var i=0;i<bs;i++)
    {
        for(var j=0;j<bs;j++,idx++)
        {
            var piece = document.getElementById('piece'+idx);
            piece.setAttribute('class', 'expanded');

            if( idx === y*bs + x )
            {
                piece.innerHTML = 'x';
                piece.style.color = 'red';
            }
            else if( boardData[idx] === BOMB )
            {
                piece.innerHTML = '*';
                piece.style.color = 'red';
            }
            else
            {
                boardData[idx] = countBombs(j, i);
                piece.innerHTML = (boardData[idx]===0)?'':boardData[idx];
                piece.style.color = color[boardData[idx]];
            }
        }
    }
}

function checkState()
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;

    var cnt = 0;
    for(var i=0;i<bs*bs;i++)
    {
        var piece = document.getElementById('piece'+i);
        if( piece.getAttribute('class') === 'raw' )
            cnt++;
    }
    console.log('raw pieces = ' + cnt);

    var bText = document.getElementById('bombs');
    var nbombs = bText.value;
    console.log('bombs = ' + nbombs);

    if( cnt == nbombs )
    {
        revealAll();
        setTimeout(function(){alert('You win!');}, 500);
    }
}

function play(x, y)
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;
    var idx = y * bs + x;

    if( boardData[idx] === BOMB )
    {
        revealAll(x, y);
        setTimeout(function(){alert( 'Hit a bomb! You lose.' );}, 500);
    }
    else
    {
        expand(x, y);
        checkState();
    }
}

function initBombs()
{
    var bsText = document.getElementById('fieldsize');
    var bs = bsText.value;
    var gridSize = bs * bs - 1;

    var bText = document.getElementById('bombs');
    if( bText.value > gridSize )
    {
        alert('Maximum number of bombs is ' + gridSize);
        bText.value = gridSize;
    }
    else if( bText.value < 1 )
    {
        alert('Minimum number of bombs is 1');
        bText.value = 1;
    }
    var nbombs = bText.value;

    var idx = 0;
    for(var i=0;i<bs;i++)
    {
        for(var j=0;j<bs;j++,idx++)
        {
            boardData[idx] = EMPTY;
        }
    }

    while( nbombs > 0 )
    {
        var pidx = Math.floor(Math.random() * gridSize);
        if( boardData[pidx] != BOMB )
        {
            boardData[pidx] = BOMB;
            nbombs--;
        }
    }
    console.log(boardData);
}

function init()
{
    console.log('initializing ...');

    // initialize the user interface
    var initButton = document.getElementById('initButton');
    initButton.onclick = initBoard;

    var revealButton = document.getElementById('revealButton');
    revealButton.onclick = revealAll;

    initBoard();
}

function initBoard(){
    console.log('initializing board ...');

    var board = document.getElementById('board');

    while( board.childNodes.length > 0 )
        board.removeChild(board.childNodes[0]);

    var table = document.createElement('table');
    var bsText = document.getElementById('fieldsize');
    if(bsText.value > 48)
    {
        alert('Maximum board size is 48x48!');
        bsText.value = 48;
    }
    if(bsText.value < 2)
    {
        alert('Minimum board size is 2x2!');
        bsText.value = 2;
    }

    var bs = bsText.value;

    // create a bs x bs table
    var idx = 0;
    for(var i=0;i<bs;i++)
    {
        var tr = document.createElement('tr');
        for(var j=0;j<bs;j++,idx++)
        {
            var td = document.createElement('td');
            td.setAttribute('id', 'piece'+idx);
            td.setAttribute('class', 'raw');
            // coordinates
            td.x = j;
            td.y = i;

            // listener
            td.onmouseover = function(){
                console.log(boardData[this.y * bs + this.x]);
            }

            td.onmousedown = function(){
                console.log('hit');
                this.setAttribute('class', 'expanded');
                play(this.x, this.y);
            }

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    board.appendChild(table);

    initBombs();
}

window.onload = init;
