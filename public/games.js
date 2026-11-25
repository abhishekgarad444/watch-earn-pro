/* ============================================================
   WATCH & EARN PRO — Mini Games (games.js)
   Plain browser JS, no dependencies, no build step.
   Exposes: window.MiniGames = { list, mount, unmount }
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Styles (scoped with .mg- prefix) ---------------- */
  var CSS = `
  .mg-wrap{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:linear-gradient(160deg,#2a1052,#1c0b38);color:#fff;border-radius:18px;padding:14px;max-width:460px;margin:0 auto;box-shadow:0 8px 30px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
  .mg-wrap *{box-sizing:border-box}
  .mg-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .mg-title{font-size:20px;font-weight:800;flex:1 1 auto;letter-spacing:.3px}
  .mg-scorebox{background:rgba(255,255,255,.08);border:1px solid rgba(245,197,66,.5);border-radius:10px;padding:4px 10px;font-size:13px;line-height:1.25;text-align:center}
  .mg-scorebox b{display:block;font-size:16px;color:#f5c542}
  .mg-iconbtn{background:#3a1a6e;border:1px solid #f5c542;color:#fff;border-radius:10px;font-size:17px;min-width:42px;height:42px;cursor:pointer;padding:0 8px}
  .mg-iconbtn:active{transform:scale(.94)}
  .mg-restart{background:linear-gradient(180deg,#ffd968,#f5c542);color:#2a1052;border:none;font-weight:800}
  .mg-help{background:rgba(245,197,66,.12);border-left:4px solid #f5c542;border-radius:8px;padding:8px 10px;font-size:13.5px;margin:10px 0;color:#ffeec2}
  .mg-status{text-align:center;font-size:15px;font-weight:700;min-height:22px;margin:6px 0;color:#f5c542}
  .mg-area{position:relative}
  .mg-bigbtn{display:block;width:100%;padding:14px;font-size:17px;font-weight:800;border:none;border-radius:12px;background:linear-gradient(180deg,#ffd968,#f5c542);color:#2a1052;cursor:pointer;margin:10px 0;box-shadow:0 4px 0 #b8860b}
  .mg-bigbtn:active{transform:translateY(2px);box-shadow:0 2px 0 #b8860b}
  .mg-bigbtn:disabled{opacity:.45;box-shadow:none}
  .mg-ghostbtn{display:block;width:100%;padding:11px;font-size:15px;font-weight:700;border:2px solid #f5c542;border-radius:12px;background:transparent;color:#f5c542;cursor:pointer;margin:8px 0}
  /* tic tac toe */
  .mg-ttt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:320px;margin:8px auto}
  .mg-ttt button{height:92px;font-size:44px;font-weight:900;border:none;border-radius:14px;background:#3a1a6e;color:#fff;cursor:pointer;transition:transform .12s,background .2s}
  .mg-ttt button:active{transform:scale(.95)}
  .mg-ttt button.mg-x{color:#f5c542}.mg-ttt button.mg-o{color:#7ee2ff}
  .mg-ttt button.mg-win{background:#f5c542;color:#2a1052}
  /* memory */
  .mg-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:340px;margin:8px auto;perspective:600px}
  .mg-card{height:72px;border:none;border-radius:12px;background:#3a1a6e;font-size:32px;cursor:pointer;position:relative;transform-style:preserve-3d;transition:transform .35s;padding:0}
  .mg-card .mg-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:12px}
  .mg-card .mg-back{background:linear-gradient(145deg,#4a2390,#2a1052);border:2px solid #f5c542;color:#f5c542;font-size:24px}
  .mg-card .mg-front{background:#fff;transform:rotateY(180deg)}
  .mg-card.mg-flip{transform:rotateY(180deg)}
  .mg-card.mg-done{opacity:.55;cursor:default}
  /* sliding puzzle */
  .mg-slide{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:300px;margin:8px auto}
  .mg-tile{height:88px;font-size:34px;font-weight:900;border:none;border-radius:12px;background:linear-gradient(160deg,#4a2390,#3a1a6e);color:#f5c542;cursor:pointer;transition:transform .1s}
  .mg-tile:active{transform:scale(.95)}
  .mg-tile.mg-blank{background:rgba(255,255,255,.05);cursor:default}
  .mg-tile.mg-right{background:linear-gradient(160deg,#ffd968,#f5c542);color:#2a1052}
  /* snake */
  .mg-canvaswrap{text-align:center}
  .mg-canvas{background:#160830;border:2px solid #f5c542;border-radius:12px;max-width:100%;height:auto;touch-action:none}
  .mg-pad{display:grid;grid-template-columns:repeat(3,64px);gap:6px;justify-content:center;margin:10px auto 2px}
  .mg-pad button{height:52px;font-size:22px;border-radius:12px;border:1px solid #f5c542;background:#3a1a6e;color:#f5c542;cursor:pointer}
  .mg-pad button:active{background:#f5c542;color:#2a1052}
  .mg-pad .mg-sp{visibility:hidden}
  /* tap challenge */
  .mg-taparena{position:relative;height:280px;background:rgba(255,255,255,.05);border:1px dashed rgba(245,197,66,.6);border-radius:14px;overflow:hidden}
  .mg-coin{position:absolute;width:68px;height:68px;border-radius:50%;border:3px solid #b8860b;background:radial-gradient(circle at 35% 30%,#fff2b0,#f5c542 60%,#d99a06);font-size:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:left .15s,top .15s;padding:0}
  .mg-coin:active{transform:scale(.9)}
  .mg-timerbar{height:10px;background:rgba(255,255,255,.12);border-radius:6px;overflow:hidden;margin:8px 0}
  .mg-timerfill{height:100%;background:linear-gradient(90deg,#f5c542,#ff9d2e);width:100%;transition:width .1s linear}
  /* color match */
  .mg-stroop{text-align:center;padding:14px 6px}
  .mg-stroopword{font-size:46px;font-weight:900;letter-spacing:2px;margin:8px 0 2px;text-shadow:0 2px 8px rgba(0,0,0,.5)}
  .mg-mode{font-size:15px;font-weight:700;color:#ffeec2;background:rgba(255,255,255,.08);display:inline-block;padding:5px 14px;border-radius:20px}
  .mg-colors{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
  .mg-colors button{height:58px;border-radius:12px;border:3px solid rgba(255,255,255,.35);cursor:pointer;font-size:0}
  .mg-colors button:active{transform:scale(.94)}
  /* quick math */
  .mg-math{text-align:center}
  .mg-mathq{font-size:42px;font-weight:900;margin:12px 0;color:#fff}
  .mg-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .mg-opts button{padding:16px;font-size:24px;font-weight:800;border-radius:12px;border:2px solid #f5c542;background:#3a1a6e;color:#fff;cursor:pointer}
  .mg-opts button:active{transform:scale(.96)}
  .mg-opts button.mg-good{background:#2e9e5b;border-color:#2e9e5b}
  .mg-opts button.mg-bad{background:#c0392b;border-color:#c0392b}
  /* word puzzle */
  .mg-answer{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;min-height:52px;margin:10px 0}
  .mg-slot{min-width:44px;height:50px;padding:0 4px;border-radius:10px;border:2px dashed rgba(245,197,66,.6);background:rgba(255,255,255,.05);color:#f5c542;font-size:24px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .mg-slot.mg-filled{border-style:solid;background:#3a1a6e}
  .mg-tiles{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:8px 0}
  .mg-tiles button{width:46px;height:50px;font-size:23px;font-weight:900;border:none;border-radius:10px;background:linear-gradient(180deg,#ffd968,#f5c542);color:#2a1052;cursor:pointer}
  .mg-tiles button:disabled{opacity:.25}
  .mg-tiles button:active{transform:scale(.93)}
  .mg-hint{text-align:center;font-size:14.5px;color:#ffeec2}
  .mg-wordinput{width:100%;padding:12px;font-size:19px;border-radius:10px;border:2px solid #f5c542;background:#1c0b38;color:#fff;text-align:center;text-transform:uppercase;margin:8px 0}
  /* block puzzle */
  .mg-blocks{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;max-width:336px;margin:8px auto;background:rgba(255,255,255,.06);padding:6px;border-radius:12px}
  .mg-cell{aspect-ratio:1;border-radius:5px;background:rgba(255,255,255,.09)}
  .mg-cell.mg-ghostok{background:rgba(126,255,150,.45)}
  .mg-cell.mg-ghostbad{background:rgba(255,90,90,.45)}
  .mg-tray{display:flex;gap:10px;justify-content:center;margin-top:10px;min-height:96px}
  .mg-piece{background:rgba(255,255,255,.06);border:2px solid transparent;border-radius:12px;padding:8px;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .mg-piece.mg-sel{border-color:#f5c542;background:rgba(245,197,66,.15)}
  .mg-piece.mg-used{opacity:.18;pointer-events:none}
  .mg-minigrid{display:grid;gap:2px}
  .mg-minicell{width:17px;height:17px;border-radius:3px}
  @keyframes mg-pop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
  .mg-pop{animation:mg-pop .25s ease}
  @keyframes mg-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
  .mg-shake{animation:mg-shake .25s ease}
  .mg-over{text-align:center;font-size:19px;font-weight:800;color:#f5c542;padding:10px 4px}
  `;
  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.id = 'mg-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- Helpers ---------------- */
  function $(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rand(n) { return Math.floor(Math.random() * n); }
  function loadBest(id) {
    try { return parseInt(localStorage.getItem('wep_best_' + id), 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(id, v) {
    try { localStorage.setItem('wep_best_' + id, String(v)); } catch (e) {}
  }

  /* ---------------- Sound (WebAudio beeps) ---------------- */
  var audioCtx = null;
  function tone(on, freq, dur, type, vol, delay) {
    if (!on) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime + (delay || 0);
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(vol || 0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  /* ---------------- Scope: tracks timers/listeners for cleanup ---------------- */
  function createScope() {
    var timeouts = {}, intervals = {}, rafs = {}, listeners = [];
    var seq = 1;
    return {
      setTimeout: function (fn, ms) {
        var k = seq++;
        var id = setTimeout(function () { delete timeouts[k]; fn(); }, ms);
        timeouts[k] = id; return k;
      },
      setInterval: function (fn, ms) {
        var k = seq++;
        intervals[k] = setInterval(fn, ms); return k;
      },
      clear: function (k) {
        if (timeouts[k]) { clearTimeout(timeouts[k]); delete timeouts[k]; }
        if (intervals[k]) { clearInterval(intervals[k]); delete intervals[k]; }
        if (rafs[k]) { cancelAnimationFrame(rafs[k]); delete rafs[k]; }
      },
      raf: function (fn) {
        var k = seq++;
        rafs[k] = requestAnimationFrame(function () { delete rafs[k]; fn(); });
        return k;
      },
      listen: function (target, ev, fn, opts) {
        target.addEventListener(ev, fn, opts);
        listeners.push([target, ev, fn, opts]);
      },
      cleanup: function () {
        Object.keys(timeouts).forEach(function (k) { clearTimeout(timeouts[k]); });
        Object.keys(intervals).forEach(function (k) { clearInterval(intervals[k]); });
        Object.keys(rafs).forEach(function (k) { cancelAnimationFrame(rafs[k]); });
        timeouts = {}; intervals = {}; rafs = {};
        listeners.forEach(function (L) { L[0].removeEventListener(L[1], L[2], L[3]); });
        listeners = [];
      }
    };
  }

  /* ---------------- Game definitions registry ---------------- */
  var GAMES = {}; // id -> {id,name,icon,help,setup(api)}

  function define(def) { GAMES[def.id] = def; }

  /* ---------------- Scaffold: builds shared chrome, returns api ---------------- */
  function buildGame(def, container, ctx) {
    injectStyle();
    var scope = createScope();
    var soundOn = !(ctx && ctx.sound === false);
    var score = 0;
    var best = loadBest(def.id);

    var wrap = $('' +
      '<div class="mg-wrap">' +
        '<div class="mg-head">' +
          '<div class="mg-title">' + def.icon + ' ' + def.name + '</div>' +
          '<div class="mg-scorebox">Score<b class="mg-score">0</b></div>' +
          '<div class="mg-scorebox">Best<b class="mg-best">' + best + '</b></div>' +
          '<button class="mg-iconbtn mg-snd" type="button" title="Sound on/off">' + (soundOn ? '🔊' : '🔇') + '</button>' +
          '<button class="mg-iconbtn mg-restart" type="button" title="Restart">↻</button>' +
        '</div>' +
        '<div class="mg-help">📖 ' + def.help + '</div>' +
        '<div class="mg-status"></div>' +
        '<div class="mg-area"></div>' +
      '</div>');

    container.innerHTML = '';
    container.appendChild(wrap);

    var scoreEl = wrap.querySelector('.mg-score');
    var bestEl = wrap.querySelector('.mg-best');
    var statusEl = wrap.querySelector('.mg-status');
    var areaEl = wrap.querySelector('.mg-area');
    var sndBtn = wrap.querySelector('.mg-snd');
    var rstBtn = wrap.querySelector('.mg-restart');

    function report(v) {
      if (ctx && typeof ctx.reportScore === 'function') {
        try { ctx.reportScore(v); } catch (e) {}
      }
    }

    var api = {
      area: areaEl,
      scope: scope,
      ctx: ctx || {},
      say: function (t) { statusEl.textContent = t || ''; },
      getScore: function () { return score; },
      setScore: function (v) {
        score = Math.max(0, Math.floor(v));
        scoreEl.textContent = score;
        if (score > best) {
          best = score;
          saveBest(def.id, best);
          bestEl.textContent = best;
          report(score); // new best achieved -> report
        }
      },
      addScore: function (d) { api.setScore(score + d); },
      reportFinal: function () { report(score); },
      soundOn: function () { return soundOn; },
      beep: function (f, d, ty, v) { tone(soundOn, f || 600, d || 0.08, ty, v); },
      sndClick: function () { tone(soundOn, 620, 0.06, 'sine', 0.12); },
      sndGood: function () { tone(soundOn, 760, 0.09, 'sine', 0.15); tone(soundOn, 1040, 0.12, 'sine', 0.15, 0.08); },
      sndBad: function () { tone(soundOn, 170, 0.18, 'sawtooth', 0.10); },
      sndWin: function () {
        [523, 659, 784, 1046].forEach(function (f, i) { tone(soundOn, f, 0.14, 'triangle', 0.16, i * 0.11); });
      }
    };

    sndBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      sndBtn.textContent = soundOn ? '🔊' : '🔇';
      if (soundOn) api.sndClick();
    });

    var game = def.setup(api) || {};
    rstBtn.addEventListener('click', function () {
      api.sndClick();
      if (typeof game.restart === 'function') game.restart();
    });

    return function cleanup() {
      scope.cleanup();
      if (typeof game.cleanup === 'function') { try { game.cleanup(); } catch (e) {} }
      container.innerHTML = '';
    };
  }

  /* ============================================================
     1. TIC TAC TOE — player X vs computer O
     Score = 100 per win. Round-based with Next Round.
     ============================================================ */
  define({
    id: 'tic-tac-toe', name: 'Tic Tac Toe', icon: '❌',
    help: 'You are X. Tap any empty box to place your X. Get 3 in a row (line, column or diagonal) before the computer. Every win = 100 points!',
    setup: function (api) {
      var board, wins, roundActive, playerStarts, busy;
      var grid = $('<div class="mg-ttt"></div>');
      var nextBtn = $('<button class="mg-bigbtn" type="button" style="display:none">▶ Next Round</button>');
      api.area.appendChild(grid);
      api.area.appendChild(nextBtn);
      var cells = [];
      for (var i = 0; i < 9; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.addEventListener('click', function () { onTap(idx); });
          grid.appendChild(b); cells.push(b);
        })(i);
      }
      nextBtn.addEventListener('click', function () { api.sndClick(); startRound(); });

      var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      function winner(b) {
        for (var i = 0; i < LINES.length; i++) {
          var L = LINES[i];
          if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return { who: b[L[0]], line: L };
        }
        return null;
      }
      function emptyIdx(b) { var r = []; for (var i = 0; i < 9; i++) if (!b[i]) r.push(i); return r; }
      function aiMove() {
        var e = emptyIdx(board); if (!e.length) return -1;
        var i, L, c;
        // 1) win
        for (i = 0; i < e.length; i++) { board[e[i]] = 'O'; if (winner(board)) { board[e[i]] = ''; return e[i]; } board[e[i]] = ''; }
        // 2) block
        for (i = 0; i < e.length; i++) { board[e[i]] = 'X'; if (winner(board)) { board[e[i]] = ''; return e[i]; } board[e[i]] = ''; }
        // 3) center
        if (!board[4]) return 4;
        // 4) corner, else random
        var corners = [0, 2, 6, 8].filter(function (x) { return !board[x]; });
        if (corners.length && Math.random() < 0.8) return corners[rand(corners.length)];
        return e[rand(e.length)];
      }
      function draw() {
        for (var i = 0; i < 9; i++) {
          cells[i].textContent = board[i] || '';
          cells[i].className = board[i] === 'X' ? 'mg-x' : (board[i] === 'O' ? 'mg-o' : '');
        }
      }
      function finishRound(w) {
        roundActive = false;
        if (w) {
          w.line.forEach(function (i) { cells[i].classList.add('mg-win'); });
          if (w.who === 'X') {
            wins++;
            api.addScore(100);
            api.say('🎉 You WIN! +100 points. Total wins: ' + wins);
            api.sndWin();
          } else {
            api.say('🤖 Computer wins this round. Try again!');
            api.sndBad();
          }
        } else {
          api.say('🤝 Draw! Nobody wins this round.');
          api.beep(440, 0.12);
        }
        api.reportFinal();
        nextBtn.style.display = 'block';
      }
      function checkEnd() {
        var w = winner(board);
        if (w) { finishRound(w); return true; }
        if (!emptyIdx(board).length) { finishRound(null); return true; }
        return false;
      }
      function computerTurn() {
        if (!roundActive) return;
        busy = true;
        api.scope.setTimeout(function () {
          busy = false;
          if (!roundActive) return;
          var m = aiMove();
          if (m >= 0) { board[m] = 'O'; draw(); api.beep(420, 0.07); }
          if (!checkEnd()) api.say('Your turn — tap a box!');
        }, 380);
      }
      function onTap(idx) {
        if (!roundActive || busy || board[idx]) return;
        board[idx] = 'X'; draw(); api.sndClick();
        if (!checkEnd()) computerTurn();
      }
      function startRound() {
        board = ['', '', '', '', '', '', '', '', ''];
        roundActive = true; busy = false;
        nextBtn.style.display = 'none';
        draw();
        if (playerStarts) {
          api.say('Round started! Your turn — tap a box!');
        } else {
          api.say('Round started! Computer plays first…');
          computerTurn();
        }
        playerStarts = !playerStarts;
      }
      function restart() {
        wins = 0; playerStarts = true;
        api.setScore(0);
        startRound();
      }
      wins = 0; playerStarts = true;
      startRound();
      return { restart: restart };
    }
  });

  /* ============================================================
     2. MEMORY MATCH — 4x4, 8 emoji pairs
     Score on finish = max(0, 1000 - moves*20 - seconds*5)
     ============================================================ */
  define({
    id: 'memory-match', name: 'Memory Match', icon: '🃏',
    help: 'Tap cards to flip them. Find and match all 8 pairs of same pictures. Fewer moves and faster time = more points!',
    setup: function (api) {
      var EMO = ['🍕', '🚗', '🐶', '🎸', '⚽', '🍩', '🚀', '🎧'];
      var grid = $('<div class="mg-mem"></div>');
      api.area.appendChild(grid);
      var first, lock, matched, moves, timerK, startAt, started, finished;

      function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
      function seconds() { return started ? Math.floor((Date.now() - startAt) / 1000) : 0; }
      function status() {
        api.say('Moves: ' + moves + ' • Matched: ' + matched + '/8 • Time: ' + fmt(seconds()));
      }
      function startTimer() {
        timerK = api.scope.setInterval(status, 500);
      }
      function finish() {
        finished = true;
        if (timerK) api.scope.clear(timerK);
        var sc = Math.max(0, 1000 - moves * 20 - seconds() * 5);
        api.setScore(sc);
        api.reportFinal();
        api.say('🏆 All pairs found! Score: ' + sc + ' (Moves ' + moves + ', Time ' + fmt(seconds()) + ')');
        api.sndWin();
        var again = $('<button class="mg-bigbtn" type="button">🔁 Play Again</button>');
        again.addEventListener('click', function () { api.sndClick(); build(); });
        api.area.appendChild(again);
      }
      function build() {
        var old = api.area.querySelector('.mg-bigbtn'); if (old) old.remove();
        grid.innerHTML = '';
        first = null; lock = false; matched = 0; moves = 0;
        started = false; finished = false;
        if (timerK) { api.scope.clear(timerK); timerK = null; }
        api.setScore(0);
        var deck = shuffle(EMO.concat(EMO));
        deck.forEach(function (emo) {
          var card = document.createElement('button');
          card.type = 'button';
          card.className = 'mg-card';
          card.innerHTML = '<span class="mg-face mg-back">⭐</span><span class="mg-face mg-front">' + emo + '</span>';
          card.addEventListener('click', function () {
            if (lock || finished || card.classList.contains('mg-flip')) return;
            if (!started) { started = true; startAt = Date.now(); startTimer(); }
            card.classList.add('mg-flip');
            api.sndClick();
            if (!first) { first = { card: card, emo: emo }; return; }
            moves++;
            var f = first; first = null;
            if (f.emo === emo) {
              matched++;
              f.card.classList.add('mg-done'); card.classList.add('mg-done');
              api.sndGood();
              status();
              if (matched === 8) finish();
            } else {
              lock = true;
              api.scope.setTimeout(function () {
                f.card.classList.remove('mg-flip');
                card.classList.remove('mg-flip');
                lock = false; status();
              }, 650);
              api.beep(300, 0.08);
              status();
            }
          });
          grid.appendChild(card);
        });
        api.say('Find all 8 matching pairs!');
      }
      build();
      return { restart: build };
    }
  });

  /* ============================================================
     3. NUMBER PUZZLE — 3x3 sliding puzzle (1-8 + blank)
     Score on solve = max(100, 1000 - moves*10)
     ============================================================ */
  define({
    id: 'number-puzzle', name: 'Number Puzzle', icon: '🔢',
    help: 'Tap a number tile next to the empty box to slide it. Arrange numbers in order 1 to 8, with the empty box last. Fewer moves = more points!',
    setup: function (api) {
      var grid = $('<div class="mg-slide"></div>');
      api.area.appendChild(grid);
      var tiles, moves, solved, tileEls = [];

      for (var i = 0; i < 9; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.addEventListener('click', function () { onTap(idx); });
          grid.appendChild(b); tileEls.push(b);
        })(i);
      }
      function blank() { return tiles.indexOf(0); }
      function adjacent(a, b) {
        var ra = Math.floor(a / 3), ca = a % 3, rb = Math.floor(b / 3), cb = b % 3;
        return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
      }
      function draw() {
        for (var i = 0; i < 9; i++) {
          var v = tiles[i];
          tileEls[i].textContent = v === 0 ? '' : v;
          tileEls[i].className = 'mg-tile' + (v === 0 ? ' mg-blank' : (v === i + 1 ? ' mg-right' : ''));
        }
      }
      function isSolved() {
        for (var i = 0; i < 8; i++) if (tiles[i] !== i + 1) return false;
        return tiles[8] === 0;
      }
      function onTap(idx) {
        if (solved) return;
        var bl = blank();
        if (!adjacent(idx, bl)) { api.beep(220, 0.06); return; }
        tiles[bl] = tiles[idx]; tiles[idx] = 0;
        moves++;
        draw();
        api.sndClick();
        if (isSolved()) {
          solved = true;
          var sc = Math.max(100, 1000 - moves * 10);
          api.setScore(sc);
          api.reportFinal();
          api.say('🏆 Puzzle solved in ' + moves + ' moves! Score: ' + sc);
          api.sndWin();
        } else {
          api.say('Moves: ' + moves);
        }
      }
      function build() {
        tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
        moves = 0; solved = false;
        // Shuffle by random legal moves from solved state => always solvable.
        var last = -1;
        for (var s = 0; s < 120; s++) {
          var bl = blank();
          var opts = [];
          for (var i = 0; i < 9; i++) if (adjacent(i, bl) && i !== last) opts.push(i);
          var pick = opts[rand(opts.length)];
          tiles[bl] = tiles[pick]; tiles[pick] = 0; last = bl;
        }
        if (isSolved()) { // extremely unlikely; nudge once more
          var b2 = blank(); tiles[b2] = tiles[1]; tiles[1] = 0;
        }
        api.setScore(0);
        draw();
        api.say('Moves: 0 — tap a tile next to the empty box!');
      }
      build();
      return { restart: build };
    }
  });

  /* ============================================================
     4. SNAKE — canvas, swipe + arrows + keyboard
     Score = food eaten x 10. Speeds up slowly.
     ============================================================ */
  define({
    id: 'snake', name: 'Snake Game', icon: '🐍',
    help: 'Guide the snake to eat the red apples. Use arrow buttons, swipe on the board, or keyboard arrows. Do not hit the walls or yourself!',
    setup: function (api) {
      var wrap = $('<div class="mg-canvaswrap"></div>');
      var canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 320;
      canvas.className = 'mg-canvas';
      wrap.appendChild(canvas);
      var pad = $('' +
        '<div class="mg-pad">' +
          '<button type="button" class="mg-sp"></button><button type="button" data-d="up">⬆️</button><button type="button" class="mg-sp"></button>' +
          '<button type="button" data-d="left">⬅️</button><button type="button" data-d="down">⬇️</button><button type="button" data-d="right">➡️</button>' +
        '</div>');
      wrap.appendChild(pad);
      var startBtn = $('<button class="mg-bigbtn" type="button">▶ Start Game</button>');
      wrap.appendChild(startBtn);
      api.area.appendChild(wrap);

      var ctx2 = canvas.getContext('2d');
      var N = 16, CELL = 20;
      var snake, dir, nextDir, food, loopK, delay, alive, started;

      function placeFood() {
        while (true) {
          var f = { x: rand(N), y: rand(N) };
          if (!snake.some(function (s) { return s.x === f.x && s.y === f.y; })) { food = f; return; }
        }
      }
      function draw() {
        ctx2.fillStyle = '#160830'; ctx2.fillRect(0, 0, 320, 320);
        ctx2.strokeStyle = 'rgba(255,255,255,.05)';
        for (var i = 1; i < N; i++) {
          ctx2.beginPath(); ctx2.moveTo(i * CELL, 0); ctx2.lineTo(i * CELL, 320); ctx2.stroke();
          ctx2.beginPath(); ctx2.moveTo(0, i * CELL); ctx2.lineTo(320, i * CELL); ctx2.stroke();
        }
        ctx2.font = '17px serif'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
        ctx2.fillText('🍎', food.x * CELL + 10, food.y * CELL + 11);
        snake.forEach(function (s, i) {
          ctx2.fillStyle = i === 0 ? '#f5c542' : '#8a5cf6';
          var p = i === 0 ? 1 : 2;
          ctx2.beginPath();
          ctx2.roundRect(s.x * CELL + p, s.y * CELL + p, CELL - p * 2, CELL - p * 2, 5);
          ctx2.fill();
          if (i === 0) {
            ctx2.fillStyle = '#2a1052';
            ctx2.fillRect(s.x * CELL + 5, s.y * CELL + 6, 3, 3);
            ctx2.fillRect(s.x * CELL + 12, s.y * CELL + 6, 3, 3);
          }
        });
      }
      function step() {
        dir = nextDir;
        var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
            snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
          gameOver(); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          api.addScore(10);
          api.sndGood();
          placeFood();
          if (delay > 70) { delay -= 4; restartLoop(); }
          api.say('Yum! 🍎 Score: ' + api.getScore());
        } else {
          snake.pop();
        }
        draw();
      }
      function restartLoop() {
        if (loopK) api.scope.clear(loopK);
        loopK = api.scope.setInterval(step, delay);
      }
      function gameOver() {
        alive = false;
        if (loopK) { api.scope.clear(loopK); loopK = null; }
        api.reportFinal();
        api.say('💥 Game Over! Final score: ' + api.getScore() + '. Press Start to play again.');
        api.sndBad();
        startBtn.textContent = '🔁 Play Again';
        startBtn.style.display = 'block';
        draw();
      }
      function setDir(d) {
        var nd = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[d];
        if (!nd) return;
        if (snake.length > 1 && nd.x === -dir.x && nd.y === -dir.y) return; // no reverse
        if (nd.x === -nextDir.x && nd.y === -nextDir.y && snake.length > 1) return;
        nextDir = nd;
      }
      pad.querySelectorAll('button[data-d]').forEach(function (b) {
        b.addEventListener('click', function () { setDir(b.getAttribute('data-d')); });
      });
      var touchStart = null;
      canvas.addEventListener('touchstart', function (e) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (!touchStart) return;
        var dx = e.touches[0].clientX - touchStart.x, dy = e.touches[0].clientY - touchStart.y;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        touchStart = null;
        e.preventDefault();
      }, { passive: false });
      api.scope.listen(window, 'keydown', function (e) {
        var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        if (map[e.key] && alive) { setDir(map[e.key]); e.preventDefault(); }
      });
      function start() {
        snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
        dir = { x: 1, y: 0 }; nextDir = dir;
        delay = 160; alive = true; started = true;
        api.setScore(0);
        placeFood(); draw();
        startBtn.style.display = 'none';
        api.say('Go! Eat the apples 🍎');
        restartLoop();
        api.sndClick();
      }
      startBtn.addEventListener('click', start);
      // initial idle board
      snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
      dir = { x: 1, y: 0 }; nextDir = dir; food = { x: 12, y: 8 }; alive = false;
      draw();
      api.say('Press Start, then steer the snake!');
      return {
        restart: function () { if (loopK) { api.scope.clear(loopK); loopK = null; } startBtn.style.display = 'block'; startBtn.textContent = '▶ Start Game'; start(); },
        cleanup: function () { if (loopK) api.scope.clear(loopK); }
      };
    }
  });

  /* ============================================================
     5. BUBBLE SHOOTER — canvas, aim with pointer, match 3+ pops
     Score = popped x 10 (+500 clear-all bonus)
     ============================================================ */
  define({
    id: 'bubble-shooter', name: 'Bubble Shooter', icon: '🫧',
    help: 'Move your finger/mouse to aim, tap to shoot the bubble. Match 3 or more bubbles of the same colour to pop them. Do not let bubbles cross the line!',
    setup: function (api) {
      var W = 340, H = 440, R = 16, LINE_Y = H - 78;
      var wrap = $('<div class="mg-canvaswrap"></div>');
      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H; canvas.className = 'mg-canvas';
      wrap.appendChild(canvas);
      api.area.appendChild(wrap);
      var c = canvas.getContext('2d');

      var COLORS = ['#e74c3c', '#f5c542', '#2ecc71', '#3498db', '#9b59b6'];
      var NAMES = ['red', 'gold', 'green', 'blue', 'purple'];
      var grid, cur, nxt, flying, popped, over, aimAngle, rafK;

      function rowLen(r) { return r % 2 === 0 ? 10 : 9; }
      function cellXY(r, col) {
        return { x: R + col * 2 * R + (r % 2 === 1 ? R : 0), y: R + 4 + r * (R * 1.72) };
      }
      function neighbors(r, col) {
        var res = [];
        var cand = [[r, col - 1], [r, col + 1]];
        if (r % 2 === 0) cand.push([r - 1, col - 1], [r - 1, col], [r + 1, col - 1], [r + 1, col]);
        else cand.push([r - 1, col], [r - 1, col + 1], [r + 1, col], [r + 1, col + 1]);
        cand.forEach(function (p) {
          if (p[0] >= 0 && p[0] < grid.length && p[1] >= 0 && p[1] < rowLen(p[0])) res.push(p);
        });
        return res;
      }
      function presentColors() {
        var set = {};
        grid.forEach(function (row) { row.forEach(function (v) { if (v !== null) set[v] = true; }); });
        return Object.keys(set).map(Number);
      }
      function anyBubbles() { return presentColors().length > 0; }
      function newBubble() {
        var pc = presentColors();
        if (!pc.length) return rand(COLORS.length);
        return pc[rand(pc.length)];
      }
      function drawBubble(x, y, ci, rr) {
        rr = rr || R;
        var g = c.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.2, x, y, rr);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, COLORS[ci]);
        g.addColorStop(1, COLORS[ci]);
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = 'rgba(255,255,255,.75)';
        c.beginPath(); c.arc(x - rr * 0.35, y - rr * 0.4, rr * 0.18, 0, Math.PI * 2); c.fill();
      }
      function draw() {
        c.fillStyle = '#160830'; c.fillRect(0, 0, W, H);
        // danger line
        c.strokeStyle = '#ff5252'; c.lineWidth = 2; c.setLineDash([6, 5]);
        c.beginPath(); c.moveTo(0, LINE_Y); c.lineTo(W, LINE_Y); c.stroke(); c.setLineDash([]);
        grid.forEach(function (row, r) {
          row.forEach(function (v, col) { if (v !== null) { var p = cellXY(r, col); drawBubble(p.x, p.y, v); } });
        });
        // launcher base
        c.fillStyle = '#f5c542';
        c.beginPath(); c.arc(W / 2, H - 26, 22, 0, Math.PI * 2); c.fill();
        // aim line
        if (!flying && !over) {
          c.strokeStyle = 'rgba(245,197,66,.7)'; c.lineWidth = 2; c.setLineDash([4, 6]);
          c.beginPath(); c.moveTo(W / 2, H - 26);
          c.lineTo(W / 2 + Math.cos(aimAngle) * 70, H - 26 + Math.sin(aimAngle) * 70); c.stroke(); c.setLineDash([]);
          drawBubble(W / 2, H - 26, cur, R - 2);
          // next bubble preview
          c.fillStyle = '#ffeec2'; c.font = '11px sans-serif'; c.textAlign = 'left';
          c.fillText('NEXT', 8, H - 40);
          drawBubble(24, H - 20, nxt, 10);
        }
        if (flying) drawBubble(flying.x, flying.y, flying.ci);
      }
      function snapAndResolve() {
        // find nearest empty cell to flying bubble
        var bestCell = null, bestD = 1e9;
        var maxR = grid.length; // allow one extra row
        for (var r = 0; r <= maxR; r++) {
          var len = rowLen(r);
          for (var col = 0; col < len; col++) {
            var occupied = r < grid.length && grid[r][col] !== null;
            if (occupied) continue;
            var p = cellXY(r, col);
            var d = Math.hypot(p.x - flying.x, p.y - flying.y);
            if (d < bestD) { bestD = d; bestCell = { r: r, col: col }; }
          }
        }
        if (!bestCell) { flying = null; return; }
        while (grid.length <= bestCell.r) grid.push(new Array(rowLen(grid.length)).fill(null));
        grid[bestCell.r][bestCell.col] = flying.ci;
        var placed = bestCell;
        flying = null;
        // cluster match
        var color = grid[placed.r][placed.col];
        var seen = {}, stack = [[placed.r, placed.col]], cluster = [];
        while (stack.length) {
          var cur2 = stack.pop(), key = cur2[0] + ',' + cur2[1];
          if (seen[key]) continue; seen[key] = true;
          if (grid[cur2[0]][cur2[1]] !== color) continue;
          cluster.push(cur2);
          neighbors(cur2[0], cur2[1]).forEach(function (n) { stack.push(n); });
        }
        if (cluster.length >= 3) {
          cluster.forEach(function (p) { grid[p[0]][p[1]] = null; });
          popped += cluster.length;
          // drop floating bubbles
          var connected = {}, st = [];
          grid[0].forEach(function (v, col) { if (v !== null) st.push([0, col]); });
          while (st.length) {
            var q = st.pop(), k2 = q[0] + ',' + q[1];
            if (connected[k2] || grid[q[0]][q[1]] === null) continue;
            connected[k2] = true;
            neighbors(q[0], q[1]).forEach(function (n) { st.push(n); });
          }
          var dropped = 0;
          grid.forEach(function (row, r) {
            row.forEach(function (v, col) { if (v !== null && !connected[r + ',' + col]) { grid[r][col] = null; dropped++; } });
          });
          popped += dropped;
          api.setScore(popped * 10 + (api._bonus || 0));
          api.sndGood();
          api.say('💥 Popped ' + (cluster.length + dropped) + '! Total popped: ' + popped);
        } else {
          api.beep(500, 0.06);
        }
        // trim empty bottom rows
        while (grid.length > 1 && grid[grid.length - 1].every(function (v) { return v === null; })) grid.pop();
        // lose check
        var lost = false;
        grid.forEach(function (row, r) {
          row.forEach(function (v, col) { if (v !== null && cellXY(r, col).y + R > LINE_Y) lost = true; });
        });
        if (lost) { endGame(false); return; }
        if (!anyBubbles()) { endGame(true); return; }
        cur = nxt; nxt = newBubble();
        draw();
      }
      function endGame(won) {
        over = true;
        if (won) {
          api._bonus = 500;
          api.setScore(popped * 10 + 500);
          api.say('🏆 Board cleared! +500 bonus. Final score: ' + api.getScore());
          api.sndWin();
        } else {
          api.say('💥 Bubbles crossed the line! Final score: ' + api.getScore());
          api.sndBad();
        }
        api.reportFinal();
        draw();
        var again = $('<button class="mg-bigbtn" type="button">🔁 Play Again</button>');
        again.addEventListener('click', function () { api.sndClick(); build(); });
        api.area.appendChild(again);
      }
      function tick() {
        if (flying) {
          flying.x += flying.vx; flying.y += flying.vy;
          if (flying.x < R) { flying.x = R; flying.vx *= -1; }
          if (flying.x > W - R) { flying.x = W - R; flying.vx *= -1; }
          var hit = flying.y - R <= 4;
          if (!hit) {
            outer:
            for (var r = 0; r < grid.length; r++) {
              for (var col = 0; col < grid[r].length; col++) {
                if (grid[r][col] === null) continue;
                var p = cellXY(r, col);
                if (Math.hypot(p.x - flying.x, p.y - flying.y) < 2 * R - 3) { hit = true; break outer; }
              }
            }
          }
          if (hit) snapAndResolve();
          draw();
        }
        rafK = api.scope.raf(tick);
      }
      function pointerPos(e) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (W / rect.width),
          y: (e.clientY - rect.top) * (H / rect.height)
        };
      }
      canvas.addEventListener('pointermove', function (e) {
        var p = pointerPos(e);
        var a = Math.atan2(p.y - (H - 26), p.x - W / 2);
        if (a > -Math.PI + 0.15 && a < -0.15) aimAngle = a;
        else if (a <= -Math.PI + 0.15) aimAngle = -Math.PI + 0.15;
        else if (a >= -0.15 && a < 0) aimAngle = -0.15;
        if (!flying) draw();
      });
      canvas.addEventListener('pointerdown', function (e) {
        if (over || flying) return;
        var p = pointerPos(e);
        var a = Math.atan2(p.y - (H - 26), p.x - W / 2);
        if (a < 0) aimAngle = Math.max(-Math.PI + 0.15, Math.min(-0.15, a));
        var sp = 9;
        flying = { x: W / 2, y: H - 26, ci: cur, vx: Math.cos(aimAngle) * sp, vy: Math.sin(aimAngle) * sp };
        api.sndClick();
      });
      function build() {
        var old = api.area.querySelector('.mg-bigbtn'); if (old) old.remove();
        grid = [];
        var useColors = 4;
        for (var r = 0; r < 5; r++) {
          var row = [];
          for (var col = 0; col < rowLen(r); col++) row.push(rand(useColors));
          grid.push(row);
        }
        popped = 0; over = false; flying = null; api._bonus = 0;
        aimAngle = -Math.PI / 2;
        api.setScore(0);
        cur = newBubble(); nxt = newBubble();
        if (rafK) api.scope.clear(rafK);
        rafK = api.scope.raf(tick);
        draw();
        api.say('Aim and shoot — match 3+ of a colour!');
      }
      build();
      return {
        restart: build,
        cleanup: function () { if (rafK) api.scope.clear(rafK); }
      };
    }
  });

  /* ============================================================
     6. TAP CHALLENGE — 30 seconds, tap the moving gold coin
     Score = number of taps
     ============================================================ */
  define({
    id: 'tap-challenge', name: 'Tap Challenge', icon: '🪙',
    help: 'When the game starts, tap the gold coin as many times as you can in 30 seconds. The coin keeps jumping to a new place!',
    setup: function (api) {
      var bar = $('<div class="mg-timerbar"><div class="mg-timerfill"></div></div>');
      var fill = bar.querySelector('.mg-timerfill');
      var arena = $('<div class="mg-taparena"></div>');
      var coin = $('<button class="mg-coin" type="button" style="display:none">🪙</button>');
      arena.appendChild(coin);
      var startBtn = $('<button class="mg-bigbtn" type="button">▶ Start (30 seconds)</button>');
      api.area.appendChild(bar);
      api.area.appendChild(arena);
      api.area.appendChild(startBtn);

      var taps, timeLeft, tickK, moveK, running;

      function moveCoin() {
        var w = arena.clientWidth || 320, h = arena.clientHeight || 280;
        var x = Math.max(4, rand(Math.max(10, w - 76)));
        var y = Math.max(4, rand(Math.max(10, h - 76)));
        coin.style.left = x + 'px';
        coin.style.top = y + 'px';
      }
      coin.addEventListener('click', function () {
        if (!running) return;
        taps++;
        api.setScore(taps);
        api.beep(900 + (taps % 5) * 60, 0.05, 'sine', 0.12);
        coin.classList.remove('mg-pop'); void coin.offsetWidth; coin.classList.add('mg-pop');
        moveCoin();
      });
      function endGame() {
        running = false;
        if (tickK) api.scope.clear(tickK);
        if (moveK) api.scope.clear(moveK);
        coin.style.display = 'none';
        fill.style.width = '0%';
        api.reportFinal();
        api.say('⏰ Time up! You tapped the coin ' + taps + ' times. Score: ' + taps);
        api.sndWin();
        startBtn.textContent = '🔁 Play Again';
        startBtn.style.display = 'block';
      }
      function start() {
        taps = 0; timeLeft = 30; running = true;
        api.setScore(0);
        startBtn.style.display = 'none';
        coin.style.display = 'flex';
        moveCoin();
        api.say('TAP THE COIN! 🪙 30 seconds…');
        api.sndClick();
        moveK = api.scope.setInterval(moveCoin, 1000);
        var startAt = Date.now();
        tickK = api.scope.setInterval(function () {
          var elapsed = (Date.now() - startAt) / 1000;
          timeLeft = Math.max(0, 30 - elapsed);
          fill.style.width = (timeLeft / 30 * 100) + '%';
          api.say('⏱️ ' + Math.ceil(timeLeft) + 's left • Taps: ' + taps);
          if (timeLeft <= 0) endGame();
        }, 100);
      }
      startBtn.addEventListener('click', start);
      api.say('Tap Start, then tap the coin as fast as you can!');
      return {
        restart: function () {
          if (tickK) api.scope.clear(tickK);
          if (moveK) api.scope.clear(moveK);
          running = false; coin.style.display = 'none';
          fill.style.width = '100%'; api.setScore(0);
          startBtn.textContent = '▶ Start (30 seconds)'; startBtn.style.display = 'block';
          api.say('Tap Start, then tap the coin as fast as you can!');
        }
      };
    }
  });

  /* ============================================================
     7. COLOR MATCH — Stroop game, 30s rounds
     Mode alternates: tap the INK colour / tap the WORD meaning
     Score = correct*10 - wrong*5 (min 0)
     ============================================================ */
  define({
    id: 'color-match', name: 'Color Match', icon: '🎨',
    help: 'A colour name is shown. Sometimes you must tap the INK colour (the colour of the letters), sometimes the WORD meaning. Read the instruction on each turn carefully!',
    setup: function (api) {
      var COLORS = [
        { name: 'RED', val: '#e74c3c' }, { name: 'BLUE', val: '#3498db' },
        { name: 'GREEN', val: '#2ecc71' }, { name: 'YELLOW', val: '#f5c542' },
        { name: 'PURPLE', val: '#9b59b6' }, { name: 'ORANGE', val: '#e67e22' },
        { name: 'PINK', val: '#fd79a8' }
      ];
      var bar = $('<div class="mg-timerbar"><div class="mg-timerfill"></div></div>');
      var fill = bar.querySelector('.mg-timerfill');
      var stage = $('<div class="mg-stroop"></div>');
      var modeEl = $('<div class="mg-mode">Get Ready</div>');
      var wordEl = $('<div class="mg-stroopword">🎨</div>');
      stage.appendChild(modeEl); stage.appendChild(wordEl);
      var btnWrap = $('<div class="mg-colors"></div>');
      var startBtn = $('<button class="mg-bigbtn" type="button">▶ Start (30 seconds)</button>');
      api.area.appendChild(bar);
      api.area.appendChild(stage);
      api.area.appendChild(btnWrap);
      api.area.appendChild(startBtn);

      var correct, wrong, running, tickK, answerIdx, questionNo;

      function newQuestion() {
        if (!running) return;
        questionNo++;
        var word = COLORS[rand(COLORS.length)];
        var ink = Math.random() < 0.4 ? word : COLORS[rand(COLORS.length)];
        var inkMode = questionNo % 2 === 1; // alternate modes every question
        answerIdx = inkMode ? COLORS.indexOf(ink) : COLORS.indexOf(word);
        modeEl.textContent = inkMode ? '👉 Tap the INK colour' : '👉 Tap the WORD meaning';
        wordEl.textContent = word.name;
        wordEl.style.color = ink.val;
        // build 4 option buttons including the answer
        var opts = [answerIdx];
        while (opts.length < 4) {
          var o = rand(COLORS.length);
          if (opts.indexOf(o) === -1) opts.push(o);
        }
        shuffle(opts);
        btnWrap.innerHTML = '';
        opts.forEach(function (ci) {
          var b = document.createElement('button');
          b.type = 'button';
          b.style.background = COLORS[ci].val;
          b.setAttribute('aria-label', COLORS[ci].name);
          b.addEventListener('click', function () { answer(ci, b); });
          btnWrap.appendChild(b);
        });
      }
      function answer(ci, btn) {
        if (!running) return;
        if (ci === answerIdx) {
          correct++; api.sndGood();
          btn.style.borderColor = '#7eff96';
        } else {
          wrong++; api.sndBad();
          btn.classList.add('mg-shake');
          btn.style.borderColor = '#ff5252';
        }
        api.setScore(Math.max(0, correct * 10 - wrong * 5));
        api.scope.setTimeout(newQuestion, 160);
        api.say('✔ ' + correct + ' correct • ✘ ' + wrong + ' wrong');
      }
      function endGame() {
        running = false;
        if (tickK) api.scope.clear(tickK);
        fill.style.width = '0%';
        btnWrap.innerHTML = '';
        wordEl.textContent = '🏁';
        wordEl.style.color = '#f5c542';
        modeEl.textContent = 'Time Up!';
        api.reportFinal();
        api.say('🏁 Finished! ' + correct + ' correct, ' + wrong + ' wrong. Score: ' + api.getScore());
        if (correct >= wrong) api.sndWin();
        startBtn.textContent = '🔁 Play Again';
        startBtn.style.display = 'block';
      }
      function start() {
        correct = 0; wrong = 0; questionNo = 0; running = true;
        api.setScore(0);
        startBtn.style.display = 'none';
        api.sndClick();
        newQuestion();
        api.say('✔ 0 correct • ✘ 0 wrong');
        var startAt = Date.now();
        tickK = api.scope.setInterval(function () {
          var left = Math.max(0, 30 - (Date.now() - startAt) / 1000);
          fill.style.width = (left / 30 * 100) + '%';
          if (left <= 0) endGame();
        }, 100);
      }
      startBtn.addEventListener('click', start);
      api.say('Tap Start — be fast and careful!');
      return {
        restart: function () {
          if (tickK) api.scope.clear(tickK);
          running = false; btnWrap.innerHTML = ''; fill.style.width = '100%';
          wordEl.textContent = '🎨'; modeEl.textContent = 'Get Ready';
          api.setScore(0);
          startBtn.textContent = '▶ Start (30 seconds)'; startBtn.style.display = 'block';
          api.say('Tap Start — be fast and careful!');
        }
      };
    }
  });

  /* ============================================================
     8. QUICK MATH — 60 seconds, 4 options
     Score = correct*10 + streak bonuses (+5 at every 5-streak)
     ============================================================ */
  define({
    id: 'quick-math', name: 'Quick Math', icon: '🧮',
    help: 'Solve the maths question and tap the correct answer from 4 options. You have 60 seconds. Correct = 10 points, and every 5 answers in a row gives a +5 streak bonus!',
    setup: function (api) {
      var bar = $('<div class="mg-timerbar"><div class="mg-timerfill"></div></div>');
      var fill = bar.querySelector('.mg-timerfill');
      var stage = $('<div class="mg-math"></div>');
      var qEl = $('<div class="mg-mathq">🧮</div>');
      stage.appendChild(qEl);
      var optsEl = $('<div class="mg-opts"></div>');
      var startBtn = $('<button class="mg-bigbtn" type="button">▶ Start (60 seconds)</button>');
      api.area.appendChild(bar);
      api.area.appendChild(stage);
      api.area.appendChild(optsEl);
      api.area.appendChild(startBtn);

      var correctCount, streak, running, tickK, answer, lock;

      function genQuestion() {
        var ops = ['+', '−', '×', '÷'];
        var op = ops[rand(ops.length)];
        var a, b, ans;
        if (op === '+') { a = 3 + rand(48); b = 3 + rand(48); ans = a + b; }
        else if (op === '−') { a = 10 + rand(60); b = rand(a); ans = a - b; }
        else if (op === '×') { a = 2 + rand(11); b = 2 + rand(9); ans = a * b; }
        else { b = 2 + rand(11); ans = 2 + rand(11); a = b * ans; }
        answer = ans;
        qEl.textContent = a + ' ' + op + ' ' + b + ' = ?';
        var opts = [ans];
        var tries = 0;
        while (opts.length < 4 && tries < 60) {
          tries++;
          var d = ans + [1, -1, 2, -2, 10, -10, 5, -5, 3][rand(9)];
          if (d !== ans && d >= 0 && opts.indexOf(d) === -1) opts.push(d);
        }
        var extra = 11;
        while (opts.length < 4) { var f = ans + extra; extra += 3; if (f >= 0 && opts.indexOf(f) === -1) opts.push(f); }
        shuffle(opts);
        optsEl.innerHTML = '';
        lock = false;
        opts.forEach(function (v) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = v;
          btn.addEventListener('click', function () { choose(v, btn); });
          optsEl.appendChild(btn);
        });
      }
      function choose(v, btn) {
        if (!running || lock) return;
        lock = true;
        if (v === answer) {
          correctCount++; streak++;
          api.addScore(10);
          if (streak % 5 === 0) { api.addScore(5); api.say('🔥 ' + streak + ' in a row! +5 streak bonus!'); }
          else api.say('✔ Correct! Streak: ' + streak + ' • Solved: ' + correctCount);
          btn.classList.add('mg-good');
          api.sndGood();
        } else {
          streak = 0;
          btn.classList.add('mg-bad');
          api.say('✘ Wrong — answer was ' + answer + '. Streak reset.');
          api.sndBad();
        }
        api.scope.setTimeout(function () { if (running) genQuestion(); }, 420);
      }
      function endGame() {
        running = false;
        if (tickK) api.scope.clear(tickK);
        fill.style.width = '0%';
        optsEl.innerHTML = '';
        qEl.textContent = '🏁';
        api.reportFinal();
        api.say('🏁 Time up! You solved ' + correctCount + ' questions. Final score: ' + api.getScore());
        api.sndWin();
        startBtn.textContent = '🔁 Play Again';
        startBtn.style.display = 'block';
      }
      function start() {
        correctCount = 0; streak = 0; running = true;
        api.setScore(0);
        startBtn.style.display = 'none';
        api.sndClick();
        genQuestion();
        api.say('Solve as many as you can!');
        var startAt = Date.now();
        tickK = api.scope.setInterval(function () {
          var left = Math.max(0, 60 - (Date.now() - startAt) / 1000);
          fill.style.width = (left / 60 * 100) + '%';
          if (left <= 0) endGame();
        }, 100);
      }
      startBtn.addEventListener('click', start);
      api.say('Tap Start to begin the 60-second challenge!');
      return {
        restart: function () {
          if (tickK) api.scope.clear(tickK);
          running = false; optsEl.innerHTML = ''; fill.style.width = '100%';
          qEl.textContent = '🧮'; api.setScore(0);
          startBtn.textContent = '▶ Start (60 seconds)'; startBtn.style.display = 'block';
          api.say('Tap Start to begin the 60-second challenge!');
        }
      };
    }
  });

  /* ============================================================
     9. WORD PUZZLE — anagram with letter tiles + text input
     Score per word = 50 + length*5 + speed bonus (up to +30)
     ============================================================ */
  define({
    id: 'word-puzzle', name: 'Word Puzzle', icon: '🔤',
    help: 'The letters of a word are mixed up! Tap the letter tiles in the right order (or type the word) to make the correct word. Use the hint if you are stuck.',
    setup: function (api) {
      var WORDS = [
        ['APPLE', 'A sweet red or green fruit'], ['BANANA', 'A long yellow fruit'],
        ['ORANGE', 'A fruit and a colour'], ['MANGO', 'King of fruits, loved in summer'],
        ['LEMON', 'Sour yellow fruit'], ['PEACH', 'Soft pink-orange fruit'],
        ['TIGER', 'Big wild cat with stripes'], ['LION', 'King of the jungle'],
        ['ZEBRA', 'Horse-like animal with black and white stripes'],
        ['MONKEY', 'Animal that loves bananas and climbing trees'],
        ['RABBIT', 'Small animal with long ears'], ['HORSE', 'Animal used for riding'],
        ['CAMEL', 'Ship of the desert'], ['RIVER', 'Flowing water towards the sea'],
        ['OCEAN', 'Very big sea'], ['FOREST', 'Place full of trees'],
        ['DESERT', 'Hot sandy place with very little water'], ['RAINBOW', 'Colourful arc in the sky after rain'],
        ['FLOWER', 'Beautiful part of a plant'], ['GARDEN', 'Place where flowers and plants grow'],
        ['SCHOOL', 'Place where children study'], ['PENCIL', 'Used for writing and drawing'],
        ['BOOK', 'You read it to gain knowledge'], ['TABLE', 'We keep things and eat on it'],
        ['CHAIR', 'You sit on it'], ['CLOCK', 'It tells the time'],
        ['PHONE', 'You call and message with it'], ['TRAIN', 'Runs on railway tracks'],
        ['PLANE', 'Flies in the sky with passengers'], ['HOUSE', 'Place where a family lives'],
        ['WATER', 'We drink it every day'], ['EARTH', 'The planet we live on'],
        ['MUSIC', 'Songs and tunes'], ['DANCE', 'Moving your body to music'],
        ['HAPPY', 'Feeling of joy'], ['SMILE', 'What you do when you are happy'],
        ['STAR', 'It shines in the night sky'], ['MOON', 'It glows at night in the sky'],
        ['CLOUD', 'White soft shape in the sky'], ['BREAD', 'Baked food eaten with meals'],
        ['CHEESE', 'Made from milk, loved on pizza'], ['COFFEE', 'Hot drink that wakes you up'],
        ['MOUNTAIN', 'Very high land, like the Himalayas'], ['ELEPHANT', 'Biggest land animal with a trunk'],
        ['SUNSHINE', 'Bright light from the sun']
      ];
      var hintEl = $('<div class="mg-hint"></div>');
      var answerEl = $('<div class="mg-answer"></div>');
      var tilesEl = $('<div class="mg-tiles"></div>');
      var input = $('<input class="mg-wordinput" type="text" placeholder="…or type the word here" autocomplete="off">');
      var btnRow = $('<div></div>');
      var checkBtn = $('<button class="mg-bigbtn" type="button">✔ Check Answer</button>');
      var skipBtn = $('<button class="mg-ghostbtn" type="button">⏭ Skip Word</button>');
      btnRow.appendChild(checkBtn); btnRow.appendChild(skipBtn);
      api.area.appendChild(hintEl);
      api.area.appendChild(answerEl);
      api.area.appendChild(tilesEl);
      api.area.appendChild(input);
      api.area.appendChild(btnRow);

      var word, hint, order, placed, solvedCount, wordStartAt, usedWords;

      function scramble(w) {
        var arr = w.split('');
        for (var t = 0; t < 20; t++) {
          shuffle(arr);
          if (arr.join('') !== w) break;
        }
        return arr;
      }
      function render() {
        answerEl.innerHTML = '';
        placed.forEach(function (p, i) {
          var s = document.createElement('div');
          s.className = 'mg-slot mg-filled';
          s.textContent = p.ch;
          s.title = 'Tap to remove';
          s.addEventListener('click', function () {
            // remove this and all letters after it back to tiles
            var removed = placed.splice(i);
            removed.forEach(function (r) { order[r.tileIdx].used = false; });
            placed = placed.slice(0, i);
            api.beep(300, 0.05);
            render();
          });
          answerEl.appendChild(s);
        });
        for (var k = placed.length; k < word.length; k++) {
          var e = document.createElement('div');
          e.className = 'mg-slot'; e.textContent = '·';
          answerEl.appendChild(e);
        }
        tilesEl.innerHTML = '';
        order.forEach(function (t, ti) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = t.ch;
          b.disabled = t.used;
          b.addEventListener('click', function () {
            if (t.used || placed.length >= word.length) return;
            t.used = true;
            placed.push({ ch: t.ch, tileIdx: ti });
            api.sndClick();
            render();
            if (placed.length === word.length) checkTiles();
          });
          tilesEl.appendChild(b);
        });
        input.value = '';
      }
      function currentGuess() { return placed.map(function (p) { return p.ch; }).join(''); }
      function solved() {
        solvedCount++;
        var secs = Math.floor((Date.now() - wordStartAt) / 1000);
        var pts = 50 + word.length * 5 + Math.max(0, 30 - secs);
        api.addScore(pts);
        api.say('🎉 Correct! "' + word + '" solved in ' + secs + 's — +' + pts + ' points! Next word…');
        api.sndWin();
        api.scope.setTimeout(nextWord, 1300);
      }
      function checkTiles() {
        if (currentGuess() === word) solved();
        else {
          api.say('❌ Not correct yet. Tap letters in the answer to remove them and try again!');
          api.sndBad();
          answerEl.classList.remove('mg-shake'); void answerEl.offsetWidth; answerEl.classList.add('mg-shake');
        }
      }
      checkBtn.addEventListener('click', function () {
        var typed = (input.value || '').trim().toUpperCase();
        if (typed) {
          if (typed === word) solved();
          else { api.say('❌ "' + typed + '" is not the word. Try again!'); api.sndBad(); }
        } else if (placed.length === word.length) {
          checkTiles();
        } else {
          api.say('First tap all the letter tiles, or type the word!');
          api.beep(300, 0.06);
        }
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
      skipBtn.addEventListener('click', function () {
        api.say('The word was "' + word + '". Here is a new word!');
        api.beep(350, 0.08);
        nextWord();
      });
      function nextWord() {
        if (usedWords.length >= WORDS.length) usedWords = [];
        var idx;
        do { idx = rand(WORDS.length); } while (usedWords.indexOf(idx) !== -1);
        usedWords.push(idx);
        word = WORDS[idx][0]; hint = WORDS[idx][1];
        order = scramble(word).map(function (ch) { return { ch: ch, used: false }; });
        placed = [];
        wordStartAt = Date.now();
        hintEl.textContent = '💡 Hint: ' + hint + '  (' + word.length + ' letters)';
        render();
        api.say('Unscramble the word! Words solved: ' + solvedCount);
      }
      function restart() {
        usedWords = []; solvedCount = 0;
        api.setScore(0);
        nextWord();
      }
      usedWords = []; solvedCount = 0;
      nextWord();
      return { restart: restart };
    }
  });

  /* ============================================================
     10. BLOCK PUZZLE — 8x8 grid, place 3 shapes, clear lines
     Score = cells placed + lines cleared x 20
     ============================================================ */
  define({
    id: 'block-puzzle', name: 'Block Puzzle', icon: '🧱',
    help: 'Tap a block shape below, then tap the board to place it. Fill a full line or column to clear it. Game ends when no shape can fit!',
    setup: function (api) {
      var SHAPES = [
        [[0, 0]],
        [[0, 0], [0, 1]],
        [[0, 0], [1, 0]],
        [[0, 0], [0, 1], [0, 2]],
        [[0, 0], [1, 0], [2, 0]],
        [[0, 0], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 0]],
        [[0, 0], [0, 1], [1, 1]],
        [[0, 1], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [0, 2], [0, 3]],
        [[0, 0], [1, 0], [2, 0], [3, 0]],
        [[0, 0], [1, 0], [2, 0], [2, 1]],
        [[0, 0], [0, 1], [0, 2], [1, 1]],
        [[0, 1], [1, 0], [1, 1], [1, 2]],
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[0, 1], [0, 2], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]
      ];
      var PALETTE = ['#e74c3c', '#f5c542', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c'];
      var boardEl = $('<div class="mg-blocks"></div>');
      var trayEl = $('<div class="mg-tray"></div>');
      api.area.appendChild(boardEl);
      api.area.appendChild(trayEl);

      var board, pieces, selected, cellEls, over;

      function canPlace(shape, r, c) {
        return shape.every(function (cell) {
          var rr = r + cell[0], cc = c + cell[1];
          return rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && !board[rr][cc];
        });
      }
      function fitsAnywhere(shape) {
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (canPlace(shape, r, c)) return true;
        return false;
      }
      function draw() {
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
          var el = cellEls[r][c];
          el.style.background = board[r][c] ? board[r][c] : '';
          el.className = 'mg-cell';
        }
        trayEl.innerHTML = '';
        pieces.forEach(function (p, i) {
          var d = document.createElement('div');
          d.className = 'mg-piece' + (selected === i ? ' mg-sel' : '') + (p.used ? ' mg-used' : '');
          var maxR = 0, maxC = 0;
          p.shape.forEach(function (cell) { maxR = Math.max(maxR, cell[0]); maxC = Math.max(maxC, cell[1]); });
          var mini = document.createElement('div');
          mini.className = 'mg-minigrid';
          mini.style.gridTemplateColumns = 'repeat(' + (maxC + 1) + ',17px)';
          var map = {};
          p.shape.forEach(function (cell) { map[cell[0] + ',' + cell[1]] = true; });
          for (var rr = 0; rr <= maxR; rr++) for (var cc = 0; cc <= maxC; cc++) {
            var mc = document.createElement('div');
            mc.className = 'mg-minicell';
            mc.style.background = map[rr + ',' + cc] ? p.color : 'transparent';
            mini.appendChild(mc);
          }
          d.appendChild(mini);
          (function (idx) {
            d.addEventListener('click', function () {
              if (over || pieces[idx].used) return;
              selected = selected === idx ? -1 : idx;
              api.sndClick();
              draw();
              api.say(selected >= 0 ? 'Now tap the board where you want to place it!' : 'Tap a shape to select it.');
            });
          })(i);
          trayEl.appendChild(d);
        });
      }
      function ghost(r, c, on) {
        if (selected < 0 || pieces[selected].used) return;
        var shape = pieces[selected].shape;
        var ok = canPlace(shape, r, c);
        shape.forEach(function (cell) {
          var rr = r + cell[0], cc = c + cell[1];
          if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && !board[rr][cc]) {
            cellEls[rr][cc].classList.add(on ? (ok ? 'mg-ghostok' : 'mg-ghostbad') : 'mg-cell');
            if (!on) { cellEls[rr][cc].className = 'mg-cell'; }
          }
        });
      }
      function tryPlace(r, c) {
        if (over || selected < 0 || pieces[selected].used) {
          if (!over) api.say('First tap a shape below to select it!');
          return;
        }
        var p = pieces[selected];
        if (!canPlace(p.shape, r, c)) {
          api.sndBad();
          api.say('❌ The shape does not fit there. Try another place!');
          return;
        }
        p.shape.forEach(function (cell) { board[r + cell[0]][c + cell[1]] = p.color; });
        var gained = p.shape.length;
        p.used = true;
        api.sndGood();
        // clear full rows/cols
        var rows = [], cols = [], rr, cc;
        for (rr = 0; rr < 8; rr++) if (board[rr].every(function (v) { return v; })) rows.push(rr);
        for (cc = 0; cc < 8; cc++) {
          var full = true;
          for (rr = 0; rr < 8; rr++) if (!board[rr][cc]) { full = false; break; }
          if (full) cols.push(cc);
        }
        var lines = rows.length + cols.length;
        rows.forEach(function (r2) { for (var c2 = 0; c2 < 8; c2++) board[r2][c2] = null; });
        cols.forEach(function (c2) { for (var r2 = 0; r2 < 8; r2++) board[r2][c2] = null; });
        if (lines) { gained += lines * 20; api.sndWin(); }
        api.addScore(gained);
        api.say(lines ? '✨ ' + lines + ' line' + (lines > 1 ? 's' : '') + ' cleared! +' + gained + ' points' : 'Placed! +' + gained + ' points');
        selected = -1;
        if (pieces.every(function (x) { return x.used; })) newPieces();
        draw();
        checkGameOver();
      }
      function newPieces() {
        pieces = [0, 1, 2].map(function () {
          return { shape: SHAPES[rand(SHAPES.length)], color: PALETTE[rand(PALETTE.length)], used: false };
        });
        selected = -1;
      }
      function checkGameOver() {
        var anyFit = pieces.some(function (p) { return !p.used && fitsAnywhere(p.shape); });
        if (!anyFit) {
          over = true;
          api.reportFinal();
          api.say('🏁 No more moves! Final score: ' + api.getScore());
          api.sndBad();
          var again = $('<button class="mg-bigbtn" type="button">🔁 Play Again</button>');
          again.addEventListener('click', function () { api.sndClick(); build(); });
          api.area.appendChild(again);
        }
      }
      function build() {
        var old = api.area.querySelector('.mg-bigbtn'); if (old) old.remove();
        board = [];
        cellEls = [];
        boardEl.innerHTML = '';
        for (var r = 0; r < 8; r++) {
          board.push(new Array(8).fill(null));
          cellEls.push([]);
          for (var c = 0; c < 8; c++) {
            (function (rr, cc) {
              var cell = document.createElement('div');
              cell.className = 'mg-cell';
              cell.addEventListener('click', function () { tryPlace(rr, cc); });
              cell.addEventListener('pointerenter', function () { ghost(rr, cc, true); });
              cell.addEventListener('pointerleave', function () { ghost(rr, cc, false); });
              boardEl.appendChild(cell);
              cellEls[rr].push(cell);
            })(r, c);
          }
        }
        over = false;
        api.setScore(0);
        newPieces();
        draw();
        api.say('Tap a shape, then tap the board to place it!');
      }
      build();
      return { restart: build };
    }
  });

  /* ============================================================
     Public interface
     ============================================================ */
  var mounted = new Map(); // container -> cleanup fn

  var MiniGames = {
    list: Object.keys(GAMES).map(function (id) {
      return { id: GAMES[id].id, name: GAMES[id].name, icon: GAMES[id].icon };
    }),
    mount: function (gameId, container, ctx) {
      if (!container) return;
      if (mounted.has(container)) { // clean any previous game in this container
        try { mounted.get(container)(); } catch (e) {}
        mounted.delete(container);
      }
      var def = GAMES[gameId];
      if (!def) {
        container.innerHTML = '<div class="mg-wrap"><div class="mg-over">Game not found: ' + gameId + '</div></div>';
        return;
      }
      var cleanup = buildGame(def, container, ctx || {});
      mounted.set(container, cleanup);
    },
    unmount: function (gameId, container) {
      if (container && mounted.has(container)) {
        try { mounted.get(container)(); } catch (e) {}
        mounted.delete(container);
      } else if (container) {
        container.innerHTML = '';
      }
    }
  };

  window.MiniGames = MiniGames;
})();
