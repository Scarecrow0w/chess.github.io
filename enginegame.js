const LEVEL_DEPTH = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 7,
  8: 10,
  9: 13,
  10: 16
};

var engine, 
evaler,
board,
ascii,
bestMoveFormatted;

function engineGame(options) {
  options = options || {}
  var game = new Chess(),
  // game_prediction = new Chess(),
  selected_depth = $('#engineDepth').val();

  $('#engineDepth').change(()=>selected_depth = $('#engineDepth').val());

  /// We can load Stockfish via Web Workers or via STOCKFISH() if loaded from a <script> tag.
  engine = typeof STOCKFISH === "function" ? STOCKFISH() : new Worker(options.stockfishjs || 'stockfish.js');
  evaler = typeof STOCKFISH === "function" ? STOCKFISH() : new Worker(options.stockfishjs || 'stockfish.js');
  var engineStatus = {};
  var displayScore = false;
  var time = {
    wtime: 300000,
    btime: 300000,
    winc: 2000,
    binc: 2000
  };
  var playerColor = 'white';
  var clockTimeoutID = null;
  var isEngineRunning = false;
  var evaluation_el = document.getElementById("evaluation");
  var announced_game_over;
  // do not pick up pieces if the game is over
  // only pick up pieces for White
  var onDragStart = function(source, piece, position, orientation) {
    if (window.innerWidth <= 800) {
      $('body').addClass('no-scroll');
    }
    var re = playerColor == 'white' ? /^b/ : /^w/
    if (game.game_over()) {
      return false;
    }

    // uciCmd('stop')
  };

  setInterval(function() {
    if (announced_game_over) {
      return;
    }

    if (game.game_over()) {
      announced_game_over = true;
      $('.variant-line').text('');
      $('.variant-eval').text('');
    }
  }, 1000);

  function uciCmd(cmd, which) {
    console.log("UCI: " + cmd);

    (which || engine).postMessage(cmd);
  }
  uciCmd('uci');

  ///TODO: Eval starting positions. I suppose the starting positions could be different in different chess variants.

  // Удалить подсвеченные возможные ходы
  function removeGreySquares() {
    $('#' + 'board' + ' .square-55d63').css('filter', '')
  }

  /* Highlighting allow  */
  function greySquare(square) {
    var $square = $('#' + 'board' + ' .square-' + square)

    var background = '#fff'
    if ($square.hasClass('black-3c85d')) {
      background = '#000'
    }

    $square.css('filter', 'grayscale(0.75)')
  }

  function onMouseoutSquare(square, piece) {
    removeGreySquares()
  }
  /* Подсвечивание возможных ходов */
  function onMouseoverSquare(square, piece) {
    // get list of possible moves for this square
    var moves = game.moves({
      square: square,
      verbose: true
    })

    // exit if there are no moves available for this square
    if (moves.length === 0) return

    // highlight the square they moused over
    greySquare(square)

    // highlight the possible squares for this piece
    for (var i = 0; i < moves.length; i++) {
      greySquare(moves[i].to)
    }
  }

  function displayStatus() {
    var status = 'Engine: ';
    if (!engineStatus.engineLoaded) {
      status += 'loading...';
    } else if (!engineStatus.engineReady) {
      status += 'loaded...';
    } else {
      status += 'ready.';
    }

    if (engineStatus.search) {
      status += '<br>' + engineStatus.search;
      if (engineStatus.score && displayScore) {
        status += (engineStatus.score.substr(0, 4) === "Mate" ? " " : ' Score: ') + engineStatus.score;
      }
    }
    // $('#engineStatus').html(status);
  }

  function displayClock(color, t) {
    var isRunning = false;
    if (time.startTime > 0 && color == time.clockColor) {
      t = Math.max(0, t + time.startTime - Date.now());
      isRunning = true;
    }
    var id = color == playerColor ? '#time2' : '#time1';
    var sec = Math.ceil(t / 1000);
    var min = Math.floor(sec / 60);
    sec -= min * 60;
    var hours = Math.floor(min / 60);
    min -= hours * 60;
    var display = hours + ':' + ('0' + min).slice(-2) + ':' + ('0' + sec).slice(-2);
    if (isRunning) {
      display += sec & 1 ? ' <--' : ' <-';
    }
    $(id).text(display);
  }

  function updateClock() {
    displayClock('white', time.wtime);
    displayClock('black', time.btime);
  }

  function clockTick() {
    updateClock();
    var t = (time.clockColor == 'white' ? time.wtime : time.btime) + time.startTime - Date.now();
    var timeToNextSecond = (t % 1000) + 1;
    clockTimeoutID = setTimeout(clockTick, timeToNextSecond);
  }

  function stopClock() {
    if (clockTimeoutID !== null) {
      clearTimeout(clockTimeoutID);
      clockTimeoutID = null;
    }
    if (time.startTime > 0) {
      var elapsed = Date.now() - time.startTime;
      time.startTime = null;
      if (time.clockColor == 'white') {
        time.wtime = Math.max(0, time.wtime - elapsed);
      } else {
        time.btime = Math.max(0, time.btime - elapsed);
      }
    }
  }

  function startClock() {
    if (game.turn() == 'w') {
      time.wtime += time.winc;
      time.clockColor = 'white';
    } else {
      time.btime += time.binc;
      time.clockColor = 'black';
    }
    time.startTime = Date.now();
    clockTick();
  }

  function get_moves() {
    var moves = '';
    var history = game.history({
      verbose: true
    });

    for (var i = 0; i < history.length; ++i) {
      var move = history[i];
      moves += ' ' + move.from + move.to + (move.promotion ? move.promotion : '');
    }

    return moves;
  }

  time.depth = ($('#timeDepth').val() * 2);


  var cooldownPrepareMove = false,
  threatsActive = false,
  engineActive = false;

 
  $('#threatsToggler').click(function() {
    threatsActive = !threatsActive;
    prepareMove();
  });
  
  $('#engineToggler').click(function() {
    $('.miscalculation').toggleClass('miscalculation-flex');
    $('#engineToggler').toggleClass('active');
    $('#positionInfo').toggle();
    engineActive = !engineActive;
    prepareMove();
  })


  function prepareMove() {
    if (!cooldownPrepareMove) {
      console.log(game.in_check());
      if(game.in_check()) {
        $('#threatsToggler').attr('disabled', 'disabled');
        $('#threatsToggler').css('cursor', 'not-allowed')
      } else {
        $('#threatsToggler').removeAttr('disabled');
        $('#threatsToggler').css('cursor', 'pointer')
      }
      console.log('%c%s', 'color: green; font: 1.2rem/1 Tahoma;', 'Просчёт'); 
      console.log(threatsActive);

      if (threatsActive) {
        $('#threatsToggler').css('color', 'red')
      } else {
        $('#threatsToggler').css('color', 'gray')
      }

      // stopClock();
     
      $('#pgn').text(game.pgn());
      board.position(game.fen());
      // updateClock();
      // var turn = game.turn() == 'w' ? 'white' : 'black';
      // uciCmd('position startpos moves' + get_moves(), evaler);
      // uciCmd("eval", evaler); 
      // uciCmd("go depth 10");
      
      // console.log(board.fen());
      console.log(game.fen());

      function swapTurn() {
        let tokens = game.fen().split(" ");
        tokens[1] = game.turn() === "b" ? "w" : "b";
        tokens[3] = "-";
        return (tokens.join(" "));  
      }
    

      if (!game.game_over() && engineActive) {

        if (threatsActive) {
          uciCmd('position fen ' + swapTurn());
          uciCmd('position fen ' + swapTurn(), evaler)
        } else {
          uciCmd('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
          uciCmd('position startpos moves' + get_moves());
          uciCmd('position startpos moves' + get_moves(), evaler);
        }

        // uciCmd('position fen ' + swapTurn())
        // uciCmd('position startpos moves' + get_moves());
        // uciCmd('position startpos moves' + get_moves(), evaler);

        evaluation_el.textContent = "";
        uciCmd("eval", evaler);
        // uciCmd("go depth " + time.depth); 
        // uciCmd("go depth " + time.depth, evaler); 
        setTimeout(()=>uciCmd('go depth ' + selected_depth), 200) // нужно depth 22

        // uciCmd('go depth 10');


        // if (turn != playerColor) {
        //   time.depth = +($('#timeDepth').val() * 2);
        //   if (time && time.wtime) {
        //     uciCmd("go " + (time.depth ? "depth " + time.depth : "") + " wtime " + time.wtime + " winc " + time.winc + " btime " + time.btime + " binc " + time.binc, evaler);
        //   } else {
        //     uciCmd("go " + (time.depth ? "depth " + time.depth : ""));
        //   }
        // } else {
        //   //  swapTurn(game);


        //   time.depth = +($('#timeDepth').val() * 2);
        //   if (time && time.wtime) {
        //     uciCmd("go " + ((time.depth) ? "depth " + time.depth : "") + " wtime " + time.wtime + " winc " + time.winc + " btime " + time.btime + " binc " + time.binc, evaler);
        //   } else {
        //     uciCmd("go " + ((time.depth) ? "depth " + time.depth : ""));
        //   }
        // }
        isEngineRunning = true;
      }

      // if (game.history().length >= 2 && !time.depth && !time.nodes) {
      //   startClock();
      // }

      cooldownPrepareMove = true;

      

      setTimeout(() => {
        cooldownPrepareMove = false
      }, 100);  


    }
  }

  function ascciToAr( ascciStr ){
    function numericToLetter( num ){
      if(num == 1) return 'a'
      if(num == 2) return 'b'
      if(num == 3) return 'c'
      if(num == 4) return 'd'
      if(num == 5) return 'e'
      if(num == 6) return 'f'
      if(num == 7) return 'g'
      if(num == 8) return 'h'
    }

    function getColor( square ){ if(game.get(square)) return game.get(square).color; else return NaN }
    var muAns ='';
    ascciStr.split(' ').forEach(item => {
        if(item.length == 1){
            muAns+=item;
        }
    })

    var myArAns = [];
    if(muAns[0] == '|') muAns = muAns.slice(1)
    muAns.split('|').forEach((item, i) => {
        var myArAnsLine = [];
        item.split('').forEach((initem, j) => {
          var pos = numericToLetter(j+1)+''+(8-i);
            if(initem == '.') {
              myArAnsLine.push({position: pos, type: 'empty', color: ''})
            } else {
              myArAnsLine.push({position: pos, type: initem.toLowerCase(), color: getColor(pos)})
            }
        })
        myArAns.push(myArAnsLine);
    })
    return myArAns;
  }
  function LetterToNumeric( num ){
    if(num == 'a') return 1
    if(num == 'b') return 2
    if(num == 'c') return 3
    if(num == 'd') return 4
    if(num == 'e') return 5
    if(num == 'f') return 6
    if(num == 'g') return 7
    if(num == 'h') return 8
  }

  evaler.onmessage = function(event) {
    var line;

    if (event && typeof event === "object") {
      line = event.data;
    } else {
      line = event;
    }

    // console.log("evaler: " + line)

    if(typeof line != 'undefined') {
      // console.log(line); 

      let asciiBuf = game.ascii(), // ASCII форма шахматного поля
          reg      = /[a-z][0-8]/; // Для проверки на вид шахматных кординат
      ascii = ascciToAr(asciiBuf.slice(0, asciiBuf.length-27)); // Возвращается Array

      if ((line.slice(0, 8) === 'bestmove' && $('#timeDepth').val() <= 2) || (line.indexOf('info depth') != -1)) {

        function newborard_get(a){ // Получить элемент на невидимой доске
          let num = 8-a[1], char = LetterToNumeric(a[0])-1;
          return movechain_board[num][char];
        }
        function findSpices ( searchType, searchColor, table ){ // example : findSpices('p', 'w', ascii)
          let ans = [];
          // work about O(64), because board always 8*8
          table.forEach(item=>{item.forEach(iitem=>{if(iitem.type===searchType&&iitem.color===searchColor){ans.push(iitem)}})});
          return ans; // returned type is Array
        }

        var ans_movechain = [],
            movechain = '',
            movechain_board = ascii,
            movechain_extremums = []; // [{type: 'check', position : 2}, {type: 'checkmate', position: 3}] position is i

        // if only 1 best move
        if(line.slice(0,8)==='bestmove'&&$('#timeDepth').val()<=2){movechain=line.slice(9)}
        // if it's chain of best moves
        if(line.indexOf('info depth')!=-1){movechain=line.slice((line.lastIndexOf('pv')+3),(line.lastIndexOf('bmc')))}

        movechain = movechain.trim(); // Delete extra spaces
        movechain = movechain.split(' '); // make array from string
        // var curPgn = $("#pgn").text();
        // if(curPgn) {
        //   game_prediction.load_pgn(curPgn);
        // }

        // console.log(movechain);
        
        movechain.forEach((item, i) => { // Check each move
          if (item.trim().length < 6 && !game.game_over()) {  // If it's move
            // if (!threatsActive) {
            //   game_prediction.move({
            //     from: item[0]+item[1],
            //     to: item[2]+item[3],
            //     promotion: $("#promote").val()
            //   });
            //   // console.log(game_prediction.pgn());
            //   bestMoveFormatted = game_prediction.pgn();
  
              
              
            //   if(curPgn) {
            //     var turn = game.turn() == 'w' ? 'white' : 'black';
            //     if (turn === 'black') {
            //       let moveNum = curPgn.split('.');                
  
            //       bestMoveFormatted = bestMoveFormatted.replace(curPgn, moveNum.length - 1 + '...');
            //     } 
            //     bestMoveFormatted = bestMoveFormatted.replace(curPgn, '');
            //   }
            //   // var bestMove = bestMoveFormatted.split('. '),
            //   //     resultBestMove = '',
            //   //     moveNum = 1;
            //   // bestMove.splice(0, 1);    
  
            //   // for(var idx in bestMove) {
            //   //   var tempMove = bestMove[idx].split(' ');
            //   //   resultBestMove += ' ' + moveNum + '. ' + tempMove[0] + ' ' + tempMove[1];
            //   //   moveNum++;
            //   // }
  
            //   bestMoveFormatted = bestMoveFormatted.trim();
            // }

            // bestMoveFormatted = resultBestMove.trim();
            
            let thisObj = { // info about move
              string: item,
              type: newborard_get(item[0]+item[1]).type,
              color: newborard_get(item[0]+item[1]).color,
              move: {from:item[0]+item[1],to:item[2]+item[3]},
              needX : false, // is checkmate
              needx : true,  // is check
              needcol : true // if at least two one type figures can move at this square
            };
            // All figures of cur type
            var fig = findSpices(thisObj.type, thisObj.color, movechain_board);

            if( thisObj.type == 'b' ){ // for Bishops
              if(fig.length<=1){thisObj.needcol=false} // if only 1 Bishop
              else{
                let ar = fig,
                    needSquareColor = game.square_color(thisObj.move.to), // dark || light
                    movetoX = LetterToNumeric(thisObj.move.to[0]),
                    movetoY = thisObj.move.to[1];
                // Check each bishop of cur color
                ar=ar.filter((item)=>{if(game.square_color(item.position)==needSquareColor){if(Math.abs(LetterToNumeric(item.position[0])-movetoX)==Math.abs(item.position[1]-movetoY)){return true}else return false}else{return false}});
                // If more than 1 figure with cur options, need col in notation
                if(ar.length<=1){thisObj.needcol=false}
              }
            }
            else if( thisObj.type == 'p' ){ // for Pawns
              // using new variable for don't cause warnings in future code
              let ar = fig;
              // Next lines of code check how much figures of cur type can go to thisObj.move.to
              let ma=LetterToNumeric(thisObj.move.to[0]),mb=+thisObj.move.to[1];let atmove=newborard_get(thisObj.move.to);
              ar=ar.filter(item=>{let a=LetterToNumeric(item.position[0]),b=+item.position[1];let isattack=true;if(atmove.type==='empty')isattack=false;if(isattack&&(Math.abs(a-ma)==1&&Math.abs(b-mb)==1)){return true}else if(Math.abs(mb-b)==1&&ma==a){return true}return false});
              // if 1 or less count of figures able to go to new position then false
              if(ar.length <= 1) thisObj.needcol = false;
            }
            else if( thisObj.type == 'k' ){
              // Never add col to notation for kings
              thisObj.needcol = false;
            }
            else if( thisObj.type == 'r' ){ // for Rooks
              let ar = fig,
                  movetoX = thisObj.move.to[0],
                  movetoY = thisObj.move.to[1];

              ar=ar.filter(item=>{let x=item.position[0],y=item.position[1];if(x==movetoX||y==movetoY)return true})

              if(ar.length <= 1) thisObj.needcol = false;
            }
            else if( thisObj.type == 'q' ){ // for Quins
              let ar = fig;
              if(ar.length <= 1) thisObj.needcol = false; // usualy this check is enough
              else {
                let movetoX = thisObj.move.to[0],
                    movetoY = thisObj.move.to[1],
                    needSquareColor = game.square_color(thisObj.move.to); // for check if will Queen go as a Bishop

                // Check if queen will go as Rook, else check if will go as Bishop
                ar=ar.filter(item=>{if(item.position[0]==movetoX||item.position[1]==movetoY)return true;else if(game.square_color(item.position)==needSquareColor){if(Math.abs(LetterToNumeric(item.position[0])-LetterToNumeric(movetoX))==Math.abs(item.position[1]-movetoY))return true}})
                // if max 1 queen with cur settings
                if(ar.length <= 1) thisObj.needcol = false;
              }
            }
            else if( thisObj.type == 'n' ){ // for Knights
              let ar = fig,
                  movetoX = LetterToNumeric(thisObj.move.to[0]),
                  movetoY = thisObj.move.to[1];


              ar=ar.filter(item=>{if(Math.abs(LetterToNumeric(item.position[0])-movetoX)==1){if(Math.abs(item.position[1]-movetoY)==2)return true}else if(Math.abs(item.position[1]-movetoY)==1){if(Math.abs(LetterToNumeric(item.position[0])-movetoX)==2)return true}})
              // if max 1 queen with cur settings
              if(ar.length <= 1) thisObj.needcol = false;
            }
            //console.log(item, 8-item[1]+''+LetterToNumeric(item[0]) - 1,8-item[3]+''+LetterToNumeric(item[2]) - 1)
            // move figure on fictional board
            movechain_board[8-item[3]][LetterToNumeric(item[2]) - 1]=movechain_board[8-item[1]][LetterToNumeric(item[0]) - 1];
            movechain_board[8-item[3]][LetterToNumeric(item[2]) - 1].position=item[2]+''+item[3]; // do string
            // leave field empty after figure move
            movechain_board[8-item[1]][LetterToNumeric(item[0]) - 1] = {position: item[0]+item[1], type: 'empty', color: ''};
            // Add move to chain
            ans_movechain.push(thisObj);
          }
        }
      );



        var debugInfo = ''; // DEBUG:
        var notationInfo = '';
        var boardInfo = '';
        ans_movechain.forEach((item, i) => {
          // DEBUG:

          debugInfo += 'ans_movechain[' + i + '] is { color : ' + ans_movechain[i].color + '; type : ' + ans_movechain[i].type + '; string : ' + ans_movechain[i].string + '; } \n'

          if(i%2==0) notationInfo += ((i/2)+1)+'. '; // If it's white's move
          else notationInfo += ' '; // it's long '-'


          if(i%2==0) boardInfo += ((i/2)+1)+'. '; // If it's white's move
          else boardInfo += ' '; // it's long '-'

          let itString = '';
          if(ans_movechain[i].type != 'p') itString += ans_movechain[i].type.toUpperCase();

          if( ans_movechain[i].needcol ) itString += ans_movechain[i].move.from[0];

          notationInfo += itString+ans_movechain[i].move.to;
          boardInfo    += itString+ans_movechain[i].move.to;

          if(i % 2 == 1) notationInfo += '; ';

          if(i % 2 == 1) boardInfo += ' ';
        });


        // console.log('debugInfo is ' + debugInfo);
        // console.log('boardInfo is ' + boardInfo);
        // console.log(typeof(bestMoveFormatted));

        $('#hintForMove').html(bestMoveFormatted);
      }
      if(line.indexOf('Total evaluation') != -1){
        let a = parseFloat(line.slice(line.indexOf(':')+2, line.indexOf('(')-1));

        if(a<0){a-=1;a*=-1;$('#blackevaluation').attr('style','flex-grow:'+a);$('#whiteevaluation').removeAttr('style')}
        else{a+=1;$('#whiteevaluation').attr('style','flex-grow:'+a);$('#blackevaluation').removeAttr('style')}
      }
      /// Ignore some output.
      if(line==="uciok"||line==="readyok"||line.substr(0,11)==="option name"||line.indexOf('Stockfish.js') != -1){return}

      if (line.indexOf('info depth') == -1 && line.indexOf('bestmove') == -1) {
        if(evaluation_el.textContent){evaluation_el.textContent+="\n"}
        // evaluation_el.textContent += line;
      }
    }
  }

  engine.onmessage = function(event) {
    var line,
    variants;

    if (event && typeof event === "object") {
      line = event.data;
    } else {
      line = event;
    }


    if (line.includes('info')) { // отлавливаем сообщение движка с вариантами ходов
      variants = line.split(' '); // разбиение строки вариантов по словам
      console.log(variants);

      var depth = variants[2], // значение depth
      turn = game.turn() == 'w' ? 'white' : 'black', // текущий ход
      multiPV = variants[6], // номер линии вариантов
      score = turn == 'white' ? Number(variants[9]) / 100 : Number(variants[9]) / 100 * -1, // оценка варианта
      score = score.toFixed(1), // округление оценки 
      score = threatsActive ? score * -1 : score, // преобразование оценки для Угроз
      // score = Number(variants[9]) / 100,
      lineFormatted = ''; // строка PGN сделанных ходов вариантов на виртуальной доске
      // line_1 = [], // массив с оценкой и ходами для варианта 1
      line_2 = [], // массив с оценкой и ходами для варианта 2
      line_3 = []; // массив с оценкой и ходами для варианта 3

      $('#positionDepth').text(variants[2]); // отображение Depth над линиями

      console.log(game.turn());

      // обработка линий вариантов ходов
      for (let j = 1; j <= 3; j++) {       

        let line_predictions_1 = new Chess();

      
        if (depth != selected_depth && multiPV != j) {    

          var topPGN = $("#pgn").text(), // PGN партии на игровой доске
          moveNum = topPGN ? topPGN.split(/(?<=[^.])\ /) : [],
          line_1 = []; // разбиение ходов PGN партии на игровой доске               
         
          if (variants[14] == "hashfull") { // добавление оценки и ходов в массив 
            line_1.push(score, variants.slice(19, -2));
          } else {
            line_1.push(score, variants.slice(17, -2));
          }

          console.log(line_1);

          // вывод оценки варианта в линии
          if (score == '0') { 
            $('#variantEval_' + j).text('0.0')
          } else {
            $('#variantEval_' + j).text(line_1[0] > 0 ? '+' + line_1[0] : line_1[0]);
          }        
          
          // вывод оценки, если движок нашел мат
          if (variants[8] == 'mate' && j == 1) { 
            $('#variantEval_' + j).text('M' + variants[9]);
            $('#positionEval').text('M' + variants[9])
          } else if (j == 1) {
            $('#positionEval').text(line_1[0] > 0 ? '+' + line_1[0] : line_1[0]);
          }

          // добавление ходов в строку
          for (let i = 0; i < line_1[1].length; i++) { 
            lineFormatted += line_1[1][i] + ' ';          
          }

          lineFormatted = lineFormatted.trim(); // удаление пробелов в строке ходов варианта линии

          lineFormatted = lineFormatted.split(' '); // преобразование строки ходов в массив

          if(topPGN) { 
            line_predictions_1.load_pgn(topPGN); // если ход на игровой доске сделан, загрузить на виртуальную доску PGN с игровой доски
          } else {
            line_predictions_1.reset() // сбросить до стартовой позиции виртуальную доску
          }

          if (threatsActive) { // если включен режим Угроз, то "передать ход" черным принудительным преобразованием FEN'a (замена w на b и наоборот)
            let tokens = game.fen().split(" ");
            tokens[1] = game.turn() === "b" ? "w" : "b";
            tokens[3] = "-";
            line_predictions_1.load(tokens.join(" "));
          }
          
          // делает все предложенные линией ходы на виртуальной доске
          for (let k = 0; k < lineFormatted.length; k++) {
            line_predictions_1.move({
                  from: lineFormatted[k][0]+lineFormatted[k][1],
                  to: lineFormatted[k][2]+lineFormatted[k][3],
                  promotion: $("#promote").val()
                })          
          }

          // получает PGN всех выполненных предложенных ходов
          lineFormatted = line_predictions_1.pgn();

          // форматирование PGN для "угроз"
          if (threatsActive) {
            lineFormatted = lineFormatted.split(']');
            lineFormatted = lineFormatted[2];
            lineFormatted = lineFormatted.trim();

            let pgnLength = Math.round(moveNum.length / 2); // длина полных ходов реальной игры
            let threatsLength = Math.round(lineFormatted.split(/(?<=[^.])\ /).length / 2); // длина ходов угроз

            lineFormatted = lineFormatted.split(' ');

            for (let i = 0; i < threatsLength; i++) {
              let k = i * 3; 
              lineFormatted[k] = (pgnLength + 1 + i) + '.'; 
            }

            if (game.turn() == 'w') {
              lineFormatted[0] = (pgnLength + 1);
              lineFormatted = lineFormatted.slice(0, 1).join() + '... ' + lineFormatted.slice(2).join(' ')
            } else {
              lineFormatted = lineFormatted.join(' ')       
            }   
          }

          if(topPGN && !threatsActive) {
            var turn = game.turn() == 'w' ? 'white' : 'black';

            if (turn === 'black') {
              lineFormatted = lineFormatted.replace(topPGN, Math.round(moveNum.length / 2) + '...');
            } else {
              lineFormatted = lineFormatted.replace(topPGN,'');
            } 
          }

          

          // Отображение линии не более 11 полуходов
          lineFormatted = lineFormatted.split(/(?<=[^.])\ /);
          console.log(lineFormatted);

          if (lineFormatted.length > 11) {
            lineFormatted = lineFormatted.slice(0, 11);
            lineFormatted = lineFormatted.join(' ').trim()
          } else {
            lineFormatted = lineFormatted.join(' ').trim()
          }

          $('#variantLine_' + j).text(lineFormatted);
        // } else if (depth != selected_depth) {
        //   $('#variantLine_' + j).text('');
        //   $('#variantEval_' + j).text('')
        }   

        if (depth == selected_depth && multiPV == j) {    

          var topPGN = $("#pgn").text(), // PGN партии на игровой доске
          moveNum = topPGN ? topPGN.split(/(?<=[^.])\ /) : [],
          line_1 = []; // разбиение ходов PGN партии на игровой доске               
         
          if (variants[14] == "hashfull") { // добавление оценки и ходов в массив 
            line_1.push(score, variants.slice(19, -2));
          } else {
            line_1.push(score, variants.slice(17, -2));
          }

          console.log(line_1);

          // вывод оценки варианта в линии
          if (score == '0') { 
            $('#variantEval_' + j).text('0.0')
          } else {
            $('#variantEval_' + j).text(line_1[0] > 0 ? '+' + line_1[0] : line_1[0]);
          }        
          
          // вывод оценки, если движок нашел мат
          if (variants[8] == 'mate' && j == 1) { 
            $('#variantEval_' + j).text('M' + variants[9]);
            $('#positionEval').text('M' + variants[9])
          } else if (j == 1) {
            $('#positionEval').text(line_1[0] > 0 ? '+' + line_1[0] : line_1[0]);
          }

          // добавление ходов в строку
          for (let i = 0; i < line_1[1].length; i++) { 
            lineFormatted += line_1[1][i] + ' ';          
          }

          lineFormatted = lineFormatted.trim(); // удаление пробелов в строке ходов варианта линии

          lineFormatted = lineFormatted.split(' '); // преобразование строки ходов в массив

          if(topPGN) { 
            line_predictions_1.load_pgn(topPGN); // если ход на игровой доске сделан, загрузить на виртуальную доску PGN с игровой доски
          } else {
            line_predictions_1.reset() // сбросить до стартовой позиции виртуальную доску
          }

          if (threatsActive) { // если включен режим Угроз, то "передать ход" черным принудительным преобразованием FEN'a (замена w на b и наоборот)
            let tokens = game.fen().split(" ");
            tokens[1] = game.turn() === "b" ? "w" : "b";
            tokens[3] = "-";
            line_predictions_1.load(tokens.join(" "));
          }
          
          // делает все предложенные линией ходы на виртуальной доске
          for (let k = 0; k < lineFormatted.length; k++) {
            line_predictions_1.move({
                  from: lineFormatted[k][0]+lineFormatted[k][1],
                  to: lineFormatted[k][2]+lineFormatted[k][3],
                  promotion: $("#promote").val()
                })          
          }

          // получает PGN всех выполненных предложенных ходов
          lineFormatted = line_predictions_1.pgn();

          // форматирование PGN для "угроз"
          if (threatsActive) {
            lineFormatted = lineFormatted.split(']');
            lineFormatted = lineFormatted[2];
            lineFormatted = lineFormatted.trim();

            let pgnLength = Math.round(moveNum.length / 2); // длина полных ходов реальной игры
            let threatsLength = Math.round(lineFormatted.split(/(?<=[^.])\ /).length / 2); // длина ходов угроз

            lineFormatted = lineFormatted.split(' ');

            for (let i = 0; i < threatsLength; i++) {
              let k = i * 3; 
              lineFormatted[k] = (pgnLength + 1 + i) + '.'; 
            }

            if (game.turn() == 'w') {
              lineFormatted[0] = (pgnLength + 1);
              lineFormatted = lineFormatted.slice(0, 1).join() + '... ' + lineFormatted.slice(2).join(' ')
            } else {
              lineFormatted = lineFormatted.join(' ')       
            }   
          }

          if(topPGN && !threatsActive) {
            var turn = game.turn() == 'w' ? 'white' : 'black';

            if (turn === 'black') {
              lineFormatted = lineFormatted.replace(topPGN, Math.round(moveNum.length / 2) + '...');
            } else {
              lineFormatted = lineFormatted.replace(topPGN,'');
            } 
          }

          

          // Отображение линии не более 11 полуходов
          lineFormatted = lineFormatted.split(/(?<=[^.])\ /);
          console.log(lineFormatted);

          if (lineFormatted.length > 11) {
            lineFormatted = lineFormatted.slice(0, 11);
            lineFormatted = lineFormatted.join(' ').trim()
          } else {
            lineFormatted = lineFormatted.join(' ').trim()
          }

          $('#variantLine_' + j).text(lineFormatted);
        // } else if (depth != selected_depth) {
        //   $('#variantLine_' + j).text('');
        //   $('#variantEval_' + j).text('')
        }         
      }  
    }
    
    console.log("Reply: " + line);
    // $('.variant-line').text(line);

    var topmatch = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
    // console.log( '%c%s', 'color: green; font: 1.2rem/1 Tahoma;', topmatch);

    if (line == 'uciok') {
      engineStatus.engineLoaded = true;
    } else if (line == 'readyok') {
      engineStatus.engineReady = true;
    } else {
      var match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);

      
    // console.log('color: red; font: 1.2rem/1 Tahoma;', match);


      /// Did the AI move?
      // if (match) {
      //   isEngineRunning = false;

      //   newBest = true;
      //   bestmove = match[1] + ' to ' + match[2];
      //   if (match[3]) bestmove += ' with promotion ' + match[3]

      //   prepareMove();
      //   uciCmd("eval", evaler);
      //   evaluation_el.textContent = "";
      //   // uciCmd("eval");
      // } else if (match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)) {
      //   engineStatus.search = 'Depth: ' + match[1] + ' Nps: ' + match[2];
      // }

      /// Is it sending feed back with a score?
      if (match = line.match(/^info .*\bscore (\w+) (-?\d+)/)) {
        var score = parseInt(match[2]) * (game.turn() == 'w' ? 1 : -1);
        /// Is it measuring in centipawns?
        if (match[1] == 'cp') {
          engineStatus.score = (score / 100.0).toFixed(2);
          /// Did it find a mate?
        } else if (match[1] == 'mate') {
          engineStatus.score = 'Mate in ' + Math.abs(score);
        }

        /// Is the score bounded?
        if (match = line.match(/\b(upper|lower)bound\b/)) {
          engineStatus.score = ((match[1] == 'upper') == (game.turn() == 'w') ? '<= ' : '>= ') + engineStatus.score
        }
      }
    }
    displayStatus();
  };



  var onDrop = function(source, target) {
    $('body').removeClass('no-scroll');

    // see if the move is legal
    var move = game.move({
      from: source,
      to: target,
      promotion: $("#promote").val()
    });

    // illegal move
    if (move === null) return 'snapback';

    threatsActive = false;

    prepareMove();
  };

  // update the board position after the piece snap
  // for castling, en passant, pawn promotion
  var onSnapEnd = function() {

    board.position(game.fen());
  };

  var cfg = {
    showErrors: true,
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
  };

  board = new ChessBoard('board', cfg);

  return {
    reset: function() {
      game.reset();
      // game_prediction.reset();
      uciCmd('setoption name Contempt value 0');
      uciCmd('setoption name MultiPV value 3');
      uciCmd('setoption name Skill Level value 20');
      // uciCmd('setoption name Ponder value true');
      this.setSkillLevel(20);
      // uciCmd('setoption name King Safety value 0'); /// Agressive 100 (it's now symetric)
    },
    loadPgn: function(pgn) {
      game.load_pgn(pgn);
    },
    setPlayerColor: function(color) {
      playerColor = color;
      board.orientation(playerColor);
    },
    setSkillLevel: function(skill) {
      var max_err,
        err_prob,
        difficulty_slider;

      if (skill < 0) {
        skill = 0;
      }
      if (skill > 20) {
        skill = 20;
      }

      time.level = skill;

      /// Change thinking depth allowance.
      // if (skill < 5) {
      //   time.depth = "1";
      // } else if (skill < 10) {
      //   time.depth = "2";
      // } else if (skill < 15) {
      //   time.depth = "3";
      // } else {
      //   /// Let the engine decide.
      //   time.depth = "";
      // }

      uciCmd('setoption name Skill Level value ' + skill);

      ///NOTE: Stockfish level 20 does not make errors (intentially), so these numbers have no effect on level 20.
      /// Level 0 starts at 1
      err_prob = Math.round((skill * 6.35) + 1);
      /// Level 0 starts at 10
      max_err = Math.round((skill * -0.5) + 10);

      uciCmd('setoption name Skill Level Maximum Error value ' + max_err);
      uciCmd('setoption name Skill Level Probability value ' + err_prob);
    },
    setTime: function(baseTime, inc) {
      time = {
        wtime: baseTime * 1000,
        btime: baseTime * 1000,
        winc: inc * 1000,
        binc: inc * 1000
      };
    },
    setDepth: function(depth) {
      time = {
        depth: depth
      };
    },
    setNodes: function(nodes) {
      time = {
        nodes: nodes
      };
    },
    setContempt: function(contempt) {
      uciCmd('setoption name Contempt value ' + contempt);
    },
    setAggressiveness: function(value) {
      uciCmd('setoption name Aggressiveness value ' + value);
    },
    setDisplayScore: function(flag) {
      displayScore = flag;
      displayStatus();
    },
    start: function() {
      uciCmd('ucinewgame');
      uciCmd('isready');
      engineStatus.engineReady = false;
      engineStatus.search = null;
      displayStatus();
      prepareMove();
      announced_game_over = false;
    },
    undo: function() {
      game.undo();
      game.undo();
      engineStatus.search = null;
      displayStatus();
      prepareMove();
      return true;
    }
  };  
}
window.onresize = () => {
  board.resize();
}
$('input[type=number]').on('input', () => {
  var max = (event.target.getAttribute('max')) ? +event.target.getAttribute('max') : 20;
  var min = (event.target.getAttribute('min')) ? +event.target.getAttribute('min') : 0;
  if (+(event.target.value) < min) {
    event.target.value = min;
  }
  if (+(event.target.value) > max) {
    event.target.value = max;
  }
});


