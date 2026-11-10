/*!
 * Sudoku 100 — 数独生成与求解引擎
 * 纯前端实现：种子化随机、位运算 MRV 求解器、唯一解挖洞。
 * 同一个关卡号永远生成同一道题（可复现）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Sudoku = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 9;
  var CELLS = 81;
  var FULL_MASK = 0x1ff; // 9 位

  /* ---------- 索引表 ---------- */
  var ROW = new Uint8Array(CELLS);
  var COL = new Uint8Array(CELLS);
  var BOX = new Uint8Array(CELLS);
  for (var i = 0; i < CELLS; i++) {
    var r = (i / 9) | 0;
    var c = i % 9;
    ROW[i] = r;
    COL[i] = c;
    BOX[i] = ((r / 3) | 0) * 3 + ((c / 3) | 0);
  }

  /* ---------- 位运算小工具 ---------- */
  var POP = new Uint8Array(512);
  for (var m = 1; m < 512; m++) POP[m] = POP[m >> 1] + (m & 1);

  var BIT_INDEX = new Uint8Array(512);
  for (var b = 0; b < 9; b++) BIT_INDEX[1 << b] = b + 1;

  /* ---------- 种子随机 ---------- */
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rand() * (i + 1)) | 0;
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /* ---------- 求解器（计数，可选限制上限） ---------- */
  function countSolutions(grid, limit) {
    limit = limit || 2;
    var rows = new Int32Array(9);
    var cols = new Int32Array(9);
    var boxes = new Int32Array(9);
    var work = new Uint8Array(CELLS);
    for (var i = 0; i < CELLS; i++) {
      var v = grid[i];
      work[i] = v;
      if (v) {
        var bit = 1 << (v - 1);
        rows[ROW[i]] |= bit;
        cols[COL[i]] |= bit;
        boxes[BOX[i]] |= bit;
      }
    }

    var count = 0;

    function rec() {
      var best = -1;
      var bestMask = 0;
      var bestCount = 10;
      for (var i = 0; i < CELLS; i++) {
        if (work[i]) continue;
        var mask = FULL_MASK & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        if (mask === 0) return; // 死路
        var cnt = POP[mask];
        if (cnt < bestCount) {
          bestCount = cnt;
          best = i;
          bestMask = mask;
          if (cnt === 1) break;
        }
      }
      if (best === -1) {
        count++;
        return;
      }
      var r = ROW[best];
      var c = COL[best];
      var bx = BOX[best];
      var mask2 = bestMask;
      while (mask2) {
        var low = mask2 & -mask2;
        mask2 ^= low;
        work[best] = BIT_INDEX[low];
        rows[r] |= low;
        cols[c] |= low;
        boxes[bx] |= low;
        rec();
        rows[r] ^= low;
        cols[c] ^= low;
        boxes[bx] ^= low;
        work[best] = 0;
        if (count >= limit) return;
      }
    }

    rec();
    return count;
  }

  /** 求出一个解，返回长度 81 的数组（无解返回 null） */
  function solve(grid) {
    var rows = new Int32Array(9);
    var cols = new Int32Array(9);
    var boxes = new Int32Array(9);
    var work = new Uint8Array(CELLS);
    for (var i = 0; i < CELLS; i++) {
      var v = grid[i];
      work[i] = v;
      if (v) {
        var bit = 1 << (v - 1);
        rows[ROW[i]] |= bit;
        cols[COL[i]] |= bit;
        boxes[BOX[i]] |= bit;
      }
    }
    var done = false;

    function rec() {
      if (done) return true;
      var best = -1;
      var bestMask = 0;
      var bestCount = 10;
      for (var i = 0; i < CELLS; i++) {
        if (work[i]) continue;
        var mask = FULL_MASK & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        if (mask === 0) return false;
        var cnt = POP[mask];
        if (cnt < bestCount) {
          bestCount = cnt;
          best = i;
          bestMask = mask;
          if (cnt === 1) break;
        }
      }
      if (best === -1) {
        done = true;
        return true;
      }
      var r = ROW[best];
      var c = COL[best];
      var bx = BOX[best];
      var mask2 = bestMask;
      while (mask2) {
        var low = mask2 & -mask2;
        mask2 ^= low;
        work[best] = BIT_INDEX[low];
        rows[r] |= low;
        cols[c] |= low;
        boxes[bx] |= low;
        if (rec()) return true;
        rows[r] ^= low;
        cols[c] ^= low;
        boxes[bx] ^= low;
        work[best] = 0;
      }
      return false;
    }

    return rec() ? Array.prototype.slice.call(work) : null;
  }

  /* ---------- 生成完整解 ---------- */
  function generateSolution(rand) {
    var grid = new Uint8Array(CELLS);
    var rows = new Int32Array(9);
    var cols = new Int32Array(9);
    var boxes = new Int32Array(9);
    var digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    function rec(pos) {
      if (pos === CELLS) return true;
      var r = ROW[pos];
      var c = COL[pos];
      var bx = BOX[pos];
      var mask = FULL_MASK & ~(rows[r] | cols[c] | boxes[bx]);
      if (!mask) return false;
      var pool = [];
      for (var d = 0; d < 9; d++) if (mask & (1 << d)) pool.push(d + 1);
      // 随机顺序尝试
      for (var i = pool.length - 1; i > 0; i--) {
        var j = (rand() * (i + 1)) | 0;
        var t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
      }
      for (var k = 0; k < pool.length; k++) {
        var v = pool[k];
        var bit = 1 << (v - 1);
        grid[pos] = v;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[bx] |= bit;
        if (rec(pos + 1)) return true;
        rows[r] ^= bit;
        cols[c] ^= bit;
        boxes[bx] ^= bit;
        grid[pos] = 0;
      }
      return false;
    }

    rec(0);
    return grid;
  }

  /* ---------- 挖洞 ---------- */
  function countGivens(grid) {
    var n = 0;
    for (var i = 0; i < CELLS; i++) if (grid[i]) n++;
    return n;
  }

  function dig(solution, rand, targetGivens, symmetric) {
    var puzzle = Uint8Array.from(solution);
    var order = [];
    for (var i = 0; i < CELLS; i++) order.push(i);
    shuffle(order, rand);

    var givens = CELLS;
    for (var k = 0; k < order.length; k++) {
      if (givens <= targetGivens) break;
      var idx = order[k];
      var mate = symmetric ? CELLS - 1 - idx : -1;
      var pair = mate >= 0 && mate !== idx ? [idx, mate] : [idx];
      // 成对挖会让给定数掉到目标以下时，改为单格收尾，避免难度被挖过头
      if (pair.length === 2 && givens - 2 < targetGivens) pair = [idx];

      var skip = false;
      var saved = [];
      for (var p = 0; p < pair.length; p++) {
        if (puzzle[pair[p]] === 0) skip = true;
        saved.push(puzzle[pair[p]]);
      }
      if (skip) continue;
      for (var q = 0; q < pair.length; q++) puzzle[pair[q]] = 0;
      if (countSolutions(puzzle, 2) !== 1) {
        for (var s = 0; s < pair.length; s++) puzzle[pair[s]] = saved[s];
      } else {
        givens -= pair.length;
      }
    }
    return puzzle;
  }

  /* ---------- 关卡元数据 ---------- */
  var CHAPTERS = [
    { name: '起步庭院', subtitle: '先熟悉规则，稳住节奏', icon: '庭' },
    { name: '微风湖畔', subtitle: '开始需要一点推理顺序', icon: '湖' },
    { name: '竹影小径', subtitle: '注意区块与行列的交叉', icon: '竹' },
    { name: '苔石古井', subtitle: '单一候选逐渐变少', icon: '井' },
    { name: '迷雾回廊', subtitle: '需要主动做笔记', icon: '廊' },
    { name: '星垂高台', subtitle: '候选格开始互相牵制', icon: '台' },
    { name: '幽光深塔', subtitle: '数对与区块排除是关键', icon: '塔' },
    { name: '寒霜断崖', subtitle: '耐心，别急着猜', icon: '崖' },
    { name: '熔火地心', subtitle: '每一步都要算清后果', icon: '焰' },
    { name: '终焉天穹', subtitle: '最后十关，给你真正的挑战', icon: '穹' }
  ];

  var LEVELS = 100;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /** 关卡配置：给定数随关卡递减（45 → 26），提示次数递减 */
  function levelMeta(level) {
    var lv = clamp(Math.round(level), 1, LEVELS);
    var t = (lv - 1) / (LEVELS - 1);
    var givens = Math.round(45 - 19 * Math.pow(t, 0.92));
    var hints = lv <= 20 ? 5 : lv <= 40 ? 4 : lv <= 60 ? 3 : lv <= 80 ? 2 : 1;
    var eliteSeconds = Math.round(90 + (45 - givens) * 58);
    var chapterIndex = Math.floor((lv - 1) / 10);
    var chapter = CHAPTERS[chapterIndex];
    return {
      level: lv,
      givens: givens,
      hints: hints,
      eliteSeconds: eliteSeconds,
      chapterIndex: chapterIndex,
      chapterName: chapter.name,
      chapterSubtitle: chapter.subtitle,
      chapterIcon: chapter.icon,
      label: '第 ' + lv + ' 关'
    };
  }

  /**
   * 生成指定关卡的题目。同一 level 结果恒定。
   * 为保证难度单调，第 N 关的给定数不会超过第 N-1 关（逐关递推 + 内部缓存，
   * 因此单独生成第 100 关与依次生成 1–100 关的结果完全一致）。
   * @returns {{puzzle:number[], solution:number[], givens:number, meta:object}}
   */
  var cache = {};

  function buildOne(level, maxGivens) {
    var meta = levelMeta(level);
    var rand = mulberry32(xmur3('sudoku100::v1::' + level)());
    var symmetric = level <= 50;
    var target = Math.min(meta.givens, maxGivens);

    var best = null;
    var bestSolution = null;
    var bestGivens = CELLS + 1;

    // 同一个完整解可能挖不到目标，就换一个完整解重来；
    // 只要不超过上一关的给定数（maxGivens）就算收敛，保证难度不倒挂。
    for (var round = 0; round < 8; round++) {
      var sol = generateSolution(rand);
      for (var attempt = 0; attempt < 2; attempt++) {
        var puzzle = dig(sol, rand, target, symmetric);
        var g = countGivens(puzzle);
        if (g < bestGivens) {
          bestGivens = g;
          best = puzzle;
          bestSolution = sol;
        }
        if (g <= target) break;
      }
      if (bestGivens <= maxGivens) break;
    }

    return {
      puzzle: Array.prototype.slice.call(best),
      solution: Array.prototype.slice.call(bestSolution),
      givens: bestGivens,
      meta: meta
    };
  }

  function generate(level) {
    var lv = clamp(Math.round(level), 1, LEVELS);
    for (var i = 1; i <= lv; i++) {
      if (!cache[i]) {
        var prev = cache[i - 1];
        cache[i] = buildOne(i, prev ? prev.givens : CELLS);
      }
    }
    return cache[lv];
  }

  return {
    LEVELS: LEVELS,
    CHAPTERS: CHAPTERS,
    levelMeta: levelMeta,
    generate: generate,
    solve: solve,
    countSolutions: countSolutions,
    countGivens: countGivens,
    ROW: ROW,
    COL: COL,
    BOX: BOX
  };
});
