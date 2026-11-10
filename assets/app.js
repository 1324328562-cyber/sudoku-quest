/* ==========================================================================
   数独百关 · 游戏逻辑
   ========================================================================== */
(function () {
  'use strict';

  var S = window.Sudoku;
  var STORE = 'sudoku100::v1';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 进度存储 ---------------- */

  function blankProgress() {
    return { v: 1, unlocked: 1, lastLevel: 1, levels: {} };
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return blankProgress();
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return blankProgress();
      p.levels = p.levels || {};
      p.unlocked = Math.min(S.LEVELS, Math.max(1, parseInt(p.unlocked, 10) || 1));
      p.lastLevel = Math.min(S.LEVELS, Math.max(1, parseInt(p.lastLevel, 10) || 1));
      return p;
    } catch (e) {
      return blankProgress();
    }
  }

  var progress = loadProgress();

  function saveProgress() {
    try {
      localStorage.setItem(STORE, JSON.stringify(progress));
    } catch (e) { /* 隐私模式等写入失败时静默降级 */ }
  }

  function levelRecord(lv) {
    return progress.levels[lv] || null;
  }

  function isUnlocked(lv) {
    return lv === 1 || lv <= progress.unlocked;
  }

  function isCleared(lv) {
    var r = progress.levels[lv];
    return !!(r && r.stars);
  }

  function doneCount() {
    var n = 0;
    for (var k in progress.levels) {
      if (progress.levels[k] && progress.levels[k].stars) n++;
    }
    return n;
  }

  function starCount() {
    var n = 0;
    for (var k in progress.levels) {
      if (progress.levels[k] && progress.levels[k].stars) n += progress.levels[k].stars;
    }
    return n;
  }

  /* ---------------- 通用小工具 ---------------- */

  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1900);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h > 0 ? (m < 10 ? '0' + m : '' + m) : (m < 10 ? '0' + m : '' + m);
    var ss = s < 10 ? '0' + s : '' + s;
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function difficultyName(givens) {
    if (givens >= 42) return '入门';
    if (givens >= 36) return '简单';
    if (givens >= 31) return '进阶';
    if (givens >= 28) return '困难';
    return '专家';
  }

  var STAR_PATH = 'M12 2.6l2.86 5.98 6.54.9-4.78 4.6 1.2 6.52L12 17.5 6.18 20.6l1.2-6.52L2.6 9.48l6.54-.9L12 2.6z';

  /* ---------------- 对局状态 ---------------- */

  var g = null;
  var view = 'hub';
  var cells = [];
  var history = [];
  var timerId = null;

  function emptyNotes() {
    var a = [];
    for (var i = 0; i < 81; i++) a.push([]);
    return a;
  }

  function startLevel(level) {
    level = Math.max(1, Math.min(S.LEVELS, level));
    stopTimer();
    hideWin();

    var data = S.generate(level);
    var meta = data.meta;
    var rec = levelRecord(level);
    var saved = rec && rec.session;

    var notes = emptyNotes();
    var grid = data.puzzle.slice();
    var hintsLeft = meta.hints;
    var elapsed = 0;

    if (saved && saved.grid && saved.grid.length === 81) {
      grid = saved.grid.slice();
      for (var i = 0; i < 81; i++) {
        if (data.puzzle[i]) grid[i] = data.puzzle[i]; // 题面永远以生成结果为准
      }
      if (saved.notes && saved.notes.length === 81) {
        notes = saved.notes.map(function (a) { return Array.isArray(a) ? a.slice() : []; });
      }
      if (typeof saved.hintsLeft === 'number') {
        hintsLeft = Math.max(0, Math.min(meta.hints, saved.hintsLeft));
      }
      elapsed = Math.max(0, saved.elapsed || 0);
    }

    g = {
      level: level,
      meta: meta,
      puzzle: data.puzzle,
      solution: data.solution,
      given: data.puzzle.map(function (v) { return v > 0; }),
      grid: grid,
      notes: notes,
      hinted: {},
      wrong: {},
      hintsLeft: hintsLeft,
      hintsUsed: meta.hints - hintsLeft > 0 ? meta.hints - hintsLeft : 0,
      elapsed: elapsed,
      selected: -1,
      noteMode: false,
      paused: false,
      done: false
    };
    history = [];

    progress.lastLevel = level;
    saveProgress();

    renderGameChrome();
    refresh();
    renderNumpad();
    showView('game');
    startTimer();

    // 已填满但未结算（例如存档时刚好填完）
    if (isComplete()) finish();
  }

  /* ---------------- 渲染：游戏 ---------------- */

  function renderGameChrome() {
    var m = g.meta;
    $('gameLevel').textContent = '第 ' + g.level + ' 关';
    $('gameDiff').textContent = difficultyName(dataGivens());
    $('gameSub').textContent = m.chapterName + ' · ' + dataGivens() + ' 个已知数';
    $('hintBadge').textContent = g.hintsLeft;
    $('hintBadge').style.display = g.hintsLeft > 0 ? '' : 'none';
    $('toolHint').disabled = g.hintsLeft <= 0 || g.done;
    updateTimerText();
    updateNoteTool();
    updateUndoState();
  }

  function dataGivens() {
    var n = 0;
    for (var i = 0; i < 81; i++) if (g.given[i]) n++;
    return n;
  }

  function updateTimerText() {
    $('btnTimer').textContent = fmtTime(g ? g.elapsed : 0);
  }

  function updateNoteTool() {
    $('toolNote').classList.toggle('active', !!g.noteMode);
    $('footNote').textContent = g.noteMode
      ? '笔记模式：数字只写入候选，不会填入答案'
      : '点击格子后用数字键填入，支持键盘 1-9';
  }

  function updateUndoState() {
    $('toolUndo').disabled = history.length === 0;
  }

  function isPeer(a, b) {
    return S.ROW[a] === S.ROW[b] || S.COL[a] === S.COL[b] || S.BOX[a] === S.BOX[b];
  }

  function findConflicts() {
    var conf = new Uint8Array(81);
    for (var i = 0; i < 81; i++) {
      var v = g.grid[i];
      if (!v) continue;
      for (var j = i + 1; j < 81; j++) {
        if (g.grid[j] !== v) continue;
        if (S.ROW[i] === S.ROW[j] || S.COL[i] === S.COL[j] || S.BOX[i] === S.BOX[j]) {
          conf[i] = 1;
          conf[j] = 1;
        }
      }
    }
    return conf;
  }

  function initBoard() {
    var board = $('board');
    if (cells.length === 81) return;
    board.innerHTML = '';
    cells = [];
    for (var i = 0; i < 81; i++) {
      var el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = String(i);
      el.dataset.r = String(Math.floor(i / 9));
      el.dataset.c = String(i % 9);
      el.setAttribute('role', 'gridcell');

      var val = document.createElement('span');
      val.className = 'val';

      var notesGrid = document.createElement('div');
      notesGrid.className = 'notes-grid';
      var noteSpans = [];
      for (var k = 0; k < 9; k++) {
        var sp = document.createElement('span');
        notesGrid.appendChild(sp);
        noteSpans.push(sp);
      }

      el.appendChild(val);
      el.appendChild(notesGrid);
      board.appendChild(el);
      cells.push({ el: el, val: val, notes: noteSpans });
    }

    board.addEventListener('click', function (e) {
      var target = e.target.closest('.cell');
      if (!target) return;
      selectCell(parseInt(target.dataset.i, 10));
    });
  }

  function refresh() {
    if (!g || cells.length !== 81) return;
    var sel = g.selected;
    var selVal = sel >= 0 ? g.grid[sel] : 0;
    var conf = findConflicts();

    for (var i = 0; i < 81; i++) {
      var c = cells[i];
      var v = g.grid[i];
      c.val.textContent = v ? String(v) : '';

      for (var k = 0; k < 9; k++) {
        c.notes[k].textContent = (!v && g.notes[i].indexOf(k + 1) >= 0) ? String(k + 1) : '';
      }

      var el = c.el;
      el.classList.toggle('given', !!g.given[i]);
      el.classList.toggle('hinted', !!g.hinted[i]);
      el.classList.toggle('peer', sel >= 0 && i !== sel && isPeer(i, sel));
      el.classList.toggle('same', !!selVal && v === selVal && i !== sel);
      el.classList.toggle('selected', i === sel && !g.done);
      el.classList.toggle('conflict', !!conf[i]);
      el.classList.toggle('wrong', !!g.wrong[i]);
    }
  }

  function renderNumpad() {
    var pad = $('numpad');
    if (!pad.children.length) {
      for (var d = 1; d <= 9; d++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'num';
        b.dataset.d = String(d);
        b.innerHTML = '<span>' + d + '</span><small></small>';
        b.addEventListener('click', (function (digit) {
          return function () { inputDigit(digit); };
        })(d));
        pad.appendChild(b);
      }
    }
    updateNumpad();
  }

  function updateNumpad() {
    if (!g) return;
    var counts = new Array(10).fill(0);
    for (var i = 0; i < 81; i++) if (g.grid[i]) counts[g.grid[i]]++;
    Array.prototype.forEach.call($('numpad').children, function (b) {
      var d = parseInt(b.dataset.d, 10);
      var left = 9 - counts[d];
      b.querySelector('small').textContent = left > 0 ? left : '完成';
      b.classList.toggle('exhausted', left <= 0);
    });
  }

  /* ---------------- 交互 ---------------- */

  function selectCell(i) {
    if (!g || g.done || g.paused) return;
    g.selected = g.selected === i ? i : i;
    refresh();
  }

  function snapshot() {
    return {
      grid: g.grid.slice(),
      notes: g.notes.map(function (a) { return a.slice(); }),
      hinted: Object.assign({}, g.hinted),
      wrong: Object.assign({}, g.wrong)
    };
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 120) history.shift();
    updateUndoState();
  }

  function undo() {
    if (!g || g.done || !history.length) return;
    var s = history.pop();
    g.grid = s.grid;
    g.notes = s.notes;
    g.hinted = s.hinted;
    g.wrong = s.wrong;
    refresh();
    updateNumpad();
    updateUndoState();
    persistSession();
  }

  function clearPeerNotes(i, digit) {
    for (var k = 0; k < 81; k++) {
      if (k === i || !isPeer(i, k)) continue;
      var idx = g.notes[k].indexOf(digit);
      if (idx >= 0) g.notes[k].splice(idx, 1);
    }
  }

  function inputDigit(digit) {
    if (!g || g.done) return;
    if (g.paused) { toast('游戏已暂停'); return; }
    var i = g.selected;
    if (i < 0) { toast('先点选一个格子'); return; }
    if (g.given[i]) {
      cells[i].el.classList.remove('flash');
      void cells[i].el.offsetWidth;
      cells[i].el.classList.add('flash');
      toast('这是题目给定的数字');
      return;
    }

    pushHistory();

    if (g.noteMode) {
      if (g.grid[i]) {
        g.grid[i] = 0;
        delete g.wrong[i];
      }
      var idx = g.notes[i].indexOf(digit);
      if (idx >= 0) g.notes[i].splice(idx, 1);
      else {
        g.notes[i].push(digit);
        g.notes[i].sort(function (a, b) { return a - b; });
      }
    } else {
      if (g.grid[i] === digit) {
        g.grid[i] = 0;
      } else {
        g.grid[i] = digit;
        g.notes[i] = [];
        clearPeerNotes(i, digit);
      }
      delete g.wrong[i];
      delete g.hinted[i];
    }

    afterChange();
  }

  function eraseCell() {
    if (!g || g.done || g.paused) return;
    var i = g.selected;
    if (i < 0) { toast('先点选一个格子'); return; }
    if (g.given[i]) { toast('题目给定的数字不能删除'); return; }
    if (!g.grid[i] && !g.notes[i].length) return;
    pushHistory();
    g.grid[i] = 0;
    g.notes[i] = [];
    delete g.wrong[i];
    delete g.hinted[i];
    afterChange();
  }

  function afterChange() {
    refresh();
    updateNumpad();
    updateUndoState();
    persistSession();
    if (isComplete()) finish();
  }

  function isComplete() {
    for (var i = 0; i < 81; i++) if (!g.grid[i]) return false;
    var conf = findConflicts();
    for (var j = 0; j < 81; j++) if (conf[j]) return false;
    return true;
  }

  function useHint() {
    if (!g || g.done) return;
    if (g.paused) { toast('游戏已暂停'); return; }
    if (g.hintsLeft <= 0) { toast('本关提示次数已用完'); return; }

    var i = g.selected;
    var usable = i >= 0 && !g.given[i] && g.grid[i] !== g.solution[i];
    if (!usable) {
      var cands = [];
      for (var k = 0; k < 81; k++) {
        if (!g.given[k] && g.grid[k] !== g.solution[k]) cands.push(k);
      }
      if (!cands.length) { toast('已经没有需要提示的格子了'); return; }
      i = cands[0];
      g.selected = i;
    }

    pushHistory();
    g.grid[i] = g.solution[i];
    g.notes[i] = [];
    g.hinted[i] = 1;
    delete g.wrong[i];
    g.hintsLeft--;
    g.hintsUsed++;
    clearPeerNotes(i, g.grid[i]);
    renderGameChrome();
    afterChange();
    toast('提示已填入 · 还剩 ' + g.hintsLeft + ' 次');
  }

  function checkFill() {
    if (!g || g.done || g.paused) return;
    var bad = 0;
    var firstBad = -1;
    for (var i = 0; i < 81; i++) {
      if (g.given[i] || !g.grid[i]) continue;
      if (g.grid[i] !== g.solution[i]) {
        g.wrong[i] = 1;
        bad++;
        if (firstBad < 0) firstBad = i;
      } else {
        delete g.wrong[i];
      }
    }
    refresh();
    if (!bad) {
      toast('目前填入的数字都正确，继续加油');
    } else {
      toast('发现 ' + bad + ' 处错误，已标红');
      if (firstBad >= 0) g.selected = firstBad;
      refresh();
    }
  }

  /* ---------------- 计时 ---------------- */

  function startTimer() {
    stopTimer();
    g.tickBase = Date.now();
    timerId = setInterval(tick, 250);
  }

  function tick() {
    if (!g || g.paused) return;
    var now = Date.now();
    g.elapsed += (now - g.tickBase) / 1000;
    g.tickBase = now;
    updateTimerText();
    if (Math.floor(g.elapsed) % 8 === 0) persistSession();
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function togglePause() {
    if (!g || g.done) return;
    g.paused = !g.paused;
    $('pauseMask').classList.toggle('hidden', !g.paused);
    if (g.paused) {
      tick();
      stopTimer();
      persistSession();
    } else {
      startTimer();
    }
  }

  /* ---------------- 存档 ---------------- */

  function persistSession() {
    if (!g || g.done) return;
    var rec = progress.levels[g.level] || (progress.levels[g.level] = {});
    rec.session = {
      grid: g.grid.slice(),
      notes: g.notes.map(function (a) { return a.slice(); }),
      hintsLeft: g.hintsLeft,
      elapsed: Math.round(g.elapsed)
    };
    saveProgress();
  }

  /* ---------------- 结算 ---------------- */

  function finish() {
    if (g.done) return;
    g.done = true;
    tick();
    stopTimer();
    g.elapsed = Math.round(g.elapsed);

    var stars = 1;
    if (g.hintsUsed === 0) stars++;
    if (g.elapsed <= g.meta.eliteSeconds) stars++;

    var rec = progress.levels[g.level] || (progress.levels[g.level] = {});
    rec.stars = Math.max(rec.stars || 0, stars);
    rec.sec = rec.sec ? Math.min(rec.sec, g.elapsed) : g.elapsed;
    rec.session = null;
    progress.unlocked = Math.max(progress.unlocked, Math.min(S.LEVELS, g.level + 1));
    saveProgress();

    refresh();
    updateNumpad();
    $('toolHint').disabled = true;
    showWin(stars);
    renderStats();
  }

  function showWin(stars) {
    var panel = $('winPanel');
    var isLast = g.level >= S.LEVELS;
    var title = stars === 3 ? '完美通关' : stars === 2 ? '干得漂亮' : '通关成功';
    var sub = isLast ? '你打完了全部 100 关' : '第 ' + g.level + ' 关 · ' + g.meta.chapterName;

    var starHtml = '';
    for (var s = 1; s <= 3; s++) {
      starHtml += '<svg class="' + (s <= stars ? 'on' : '') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    }

    panel.innerHTML =
      '<div class="win-card">' +
        '<h2>' + title + '</h2>' +
        '<div class="lvtag">' + sub + '</div>' +
        '<div class="win-stars">' + starHtml + '</div>' +
        '<div class="win-meta">' +
          '<div><strong>' + fmtTime(g.elapsed) + '</strong><small>用时</small></div>' +
          '<div><strong>' + g.hintsUsed + '</strong><small>使用提示</small></div>' +
          '<div><strong>' + (levelRecord(g.level).sec ? fmtTime(levelRecord(g.level).sec) : '—') + '</strong><small>最佳</small></div>' +
        '</div>' +
        '<div class="win-actions">' +
          (isLast
            ? '<button class="btn" type="button" data-act="hub">回到关卡地图</button>'
            : '<button class="btn" type="button" data-act="next">进入第 ' + (g.level + 1) + ' 关</button>') +
          '<button class="btn ghost" type="button" data-act="replay">再玩一次</button>' +
          (isLast ? '' : '<button class="btn ghost" type="button" data-act="hub">回到关卡地图</button>') +
        '</div>' +
      '</div>';

    panel.classList.remove('hidden');
    panel.onclick = function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'next') startLevel(g.level + 1);
      else if (act === 'replay') startLevel(g.level);
      else showHub();
    };
  }

  function hideWin() {
    var panel = $('winPanel');
    panel.classList.add('hidden');
    panel.innerHTML = '';
    panel.onclick = null;
  }

  /* ---------------- 关卡地图 ---------------- */

  function renderStats() {
    $('statDone').textContent = doneCount();
    $('statStars').textContent = starCount();
    var pct = Math.round((doneCount() / S.LEVELS) * 100);
    $('progressRing').style.setProperty('--p', String(pct));
    $('ringValue').textContent = pct + '%';

    var next = Math.min(S.LEVELS, progress.unlocked);
    var allDone = doneCount() >= S.LEVELS;
    $('btnContinue').textContent = allDone
      ? '全部通关，重温任意一关'
      : (next === 1 && doneCount() === 0 ? '开始第 1 关' : '继续第 ' + next + ' 关');
  }

  function renderHub() {
    var wrap = $('chapters');
    var html = '';
    var currentLevel = Math.min(S.LEVELS, progress.unlocked);

    for (var ci = 0; ci < S.CHAPTERS.length; ci++) {
      var ch = S.CHAPTERS[ci];
      var start = ci * 10 + 1;
      var end = start + 9;
      var cleared = 0;
      var gridHtml = '';

      for (var lv = start; lv <= end; lv++) {
        var locked = !isUnlocked(lv);
        var done = isCleared(lv);
        var rec = levelRecord(lv);
        var cls = 'lvl';
        if (locked) cls += ' locked';
        if (done) cls += ' done';
        if (lv === currentLevel && !done) cls += ' current';

        var starsHtml = '';
        if (done) {
          starsHtml = '<span class="stars">';
          for (var s = 1; s <= 3; s++) {
            starsHtml += '<i class="' + (s <= (rec.stars || 0) ? 'on' : '') + '"></i>';
          }
          starsHtml += '</span>';
        }
        if (done) cleared++;

        gridHtml += '<button class="' + cls + '" type="button" data-level="' + lv + '" aria-label="第 ' + lv + ' 关' + (locked ? '（未解锁）' : done ? '（已通关）' : '') + '">' +
          lv + starsHtml + '</button>';
      }

      var chLocked = !isUnlocked(start);
      var chCurrent = currentLevel >= start && currentLevel <= end;

      html += '<div class="chapter' + (chLocked ? ' is-locked' : '') + (chCurrent ? ' is-current' : '') + '">' +
        '<div class="chapter-head">' +
          '<div class="chapter-icon" aria-hidden="true">' + ch.icon + '</div>' +
          '<div class="chapter-title"><h2>' + (ci + 1) + '. ' + ch.name + '</h2><p>' + ch.subtitle + '</p></div>' +
          '<div class="chapter-progress"><b>' + cleared + '</b>/10</div>' +
        '</div>' +
        '<div class="level-grid">' + gridHtml + '</div>' +
        '</div>';
    }

    wrap.innerHTML = html;
  }

  function onChapterClick(e) {
    var btn = e.target.closest('.lvl');
    if (!btn) return;
    var lv = parseInt(btn.dataset.level, 10);
    if (!isUnlocked(lv)) {
      btn.classList.remove('shake');
      void btn.offsetWidth;
      btn.classList.add('shake');
      toast('先通关第 ' + (lv - 1) + ' 关才能解锁');
      return;
    }
    openLevel(lv);
  }

  /* ---------------- 视图切换 ---------------- */

  function showView(name) {
    view = name;
    $('view-hub').classList.toggle('hidden', name !== 'hub');
    $('view-game').classList.toggle('hidden', name !== 'game');
    window.scrollTo(0, 0);
  }

  function showHub() {
    if (g && !g.done) {
      tick();
      persistSession();
      stopTimer();
      g = null;
    }
    hideWin();
    $('pauseMask').classList.add('hidden');
    renderHub();
    renderStats();
    showView('hub');
  }

  function openLevel(level) {
    if (!isUnlocked(level)) {
      toast('这一关还没解锁');
      return;
    }
    initBoard();
    startLevel(level);
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    $('chapters').addEventListener('click', onChapterClick);

    $('btnContinue').addEventListener('click', function () {
      var target = doneCount() >= S.LEVELS ? 1 : Math.min(S.LEVELS, progress.unlocked);
      openLevel(target);
    });

    $('btnReset').addEventListener('click', function () {
      if (!window.confirm('确定要清空全部 100 关的通关记录和星级吗？此操作不可恢复。')) return;
      progress = blankProgress();
      saveProgress();
      renderHub();
      renderStats();
      toast('进度已重置');
    });

    $('btnBack').addEventListener('click', function () {
      showHub();
    });

    $('btnTimer').addEventListener('click', togglePause);
    $('btnResume').addEventListener('click', togglePause);

    $('toolUndo').addEventListener('click', undo);
    $('toolErase').addEventListener('click', eraseCell);
    $('toolHint').addEventListener('click', useHint);
    $('toolCheck').addEventListener('click', checkFill);
    $('toolNote').addEventListener('click', function () {
      if (!g || g.done) return;
      g.noteMode = !g.noteMode;
      updateNoteTool();
    });

    $('btnRestart').addEventListener('click', function () {
      if (!g) return;
      if (!window.confirm('重玩本关会清空当前已填的内容，确定吗？')) return;
      var lv = g.level;
      var rec = progress.levels[lv];
      if (rec) rec.session = null;
      saveProgress();
      startLevel(lv);
    });

    document.addEventListener('keydown', function (e) {
      if (view !== 'game' || !g || g.done) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        inputDigit(parseInt(e.key, 10));
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault();
        eraseCell();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        g.noteMode = !g.noteMode;
        updateNoteTool();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        useHint();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        togglePause();
        return;
      }
      if (e.key === 'Escape') {
        showHub();
        return;
      }
      var moves = {
        ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1
      };
      if (moves[e.key] !== undefined) {
        e.preventDefault();
        if (g.selected < 0) { g.selected = 0; refresh(); return; }
        var next = g.selected + moves[e.key];
        if (next < 0 || next > 80) return;
        // 左右移动不跨行
        if (Math.abs(moves[e.key]) === 1 &&
            Math.floor(next / 9) !== Math.floor(g.selected / 9)) return;
        g.selected = next;
        refresh();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && view === 'game' && g && !g.done && !g.paused) {
        togglePause();
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    renderHub();
    renderStats();
    bind();
    showView('hub');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
