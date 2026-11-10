#!/usr/bin/env node
/**
 * 关卡质量校验（Node 20+）
 *
 *   node tools/verify-levels.js
 *
 * 做三件事：
 *   1. 逐关生成第 1–100 关，检查题面数字与解一致、解本身合法、解唯一；
 *   2. 用一套「朴素回溯求解器」（不复用引擎的位运算实现）交叉复核抽样关卡的解数；
 *   3. 输出给定数曲线与耗时，确认难度是单调递进的。
 */
'use strict';

const path = require('path');
const S = require(path.join(__dirname, '..', 'assets', 'sudoku.js'));

/* ---------- 独立实现的朴素求解器（仅用于交叉复核） ---------- */
function naiveCount(puzzle, limit) {
  const g = puzzle.slice();
  let count = 0;
  let nodes = 0;

  const ok = (idx, v) => {
    const r = (idx / 9) | 0;
    const c = idx % 9;
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === v) return false;
      if (g[k * 9 + c] === v) return false;
    }
    const br = ((r / 3) | 0) * 3;
    const bc = ((c / 3) | 0) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        if (g[(br + dr) * 9 + (bc + dc)] === v) return false;
      }
    }
    return true;
  };

  (function rec(pos) {
    if (count >= limit) return;
    while (pos < 81 && g[pos]) pos++;
    if (pos === 81) { count++; return; }
    for (let v = 1; v <= 9; v++) {
      nodes++;
      if (!ok(pos, v)) continue;
      g[pos] = v;
      rec(pos + 1);
      g[pos] = 0;
      if (count >= limit) return;
    }
  })(0);

  return { count, nodes };
}

/* ---------- 1. 全量生成检查 ---------- */
const problems = [];
const givens = [];
let totalMs = 0;
let worst = { ms: 0, level: 0 };

for (let lv = 1; lv <= S.LEVELS; lv++) {
  const t = Date.now();
  const { puzzle, solution, givens: g, meta } = S.generate(lv);
  const ms = Date.now() - t;
  totalMs += ms;
  if (ms > worst.ms) worst = { ms, level: lv };
  givens.push(g);

  for (let i = 0; i < 81; i++) {
    if (puzzle[i] && puzzle[i] !== solution[i]) problems.push(`第 ${lv} 关题面与解不一致（格 ${i}）`);
  }

  let legal = true;
  for (let r = 0; r < 9; r++) {
    const rs = new Set();
    const cs = new Set();
    const bs = new Set();
    for (let c = 0; c < 9; c++) {
      rs.add(solution[r * 9 + c]);
      cs.add(solution[c * 9 + r]);
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      bs.add(solution[b * 9 + ((r % 3) * 3 + (c % 3))]);
    }
    if (rs.size !== 9 || cs.size !== 9 || bs.size !== 9) legal = false;
  }
  if (!legal) problems.push(`第 ${lv} 关的解不满足数独规则`);

  if (S.countSolutions(puzzle, 3) !== 1) problems.push(`第 ${lv} 关不是唯一解`);

  const t2 = Date.now();
  const alt = naiveCount(puzzle, 2);
  if (lv % 9 === 1 || lv >= 95) {
    if (alt.count !== 1) problems.push(`第 ${lv} 关朴素求解器复核失败（解数 ${alt.count}）`);
  }
  if (Date.now() - t2 > 2000) problems.push(`第 ${lv} 关求解耗时异常`);
}

/* ---------- 2. 难度曲线 ---------- */
const monotonic = givens.every((v, i) => i === 0 || v <= givens[i - 1]);
if (!monotonic) problems.push('给定数曲线不是单调不增');

/* ---------- 输出 ---------- */
console.log('关卡总数        :', S.LEVELS);
console.log('给定数范围      :', Math.min(...givens), '→', Math.max(...givens), '（45 个最易，26 个最难）');
console.log('给定数单调不增  :', monotonic ? '是' : '否');
console.log('全部唯一解      :', problems.length === 0 ? '是' : '否');
console.log('生成总耗时      :', totalMs + 'ms', '（平均 ' + (totalMs / S.LEVELS).toFixed(1) + 'ms/关）');
console.log('最慢一关        :', '第 ' + worst.level + ' 关 ' + worst.ms + 'ms');
console.log('问题数          :', problems.length);

if (problems.length) {
  console.log('\n发现问题：');
  problems.slice(0, 20).forEach((p) => console.log('  -', p));
  process.exitCode = 1;
} else {
  console.log('\n第 1–100 关全部通过校验：题面合法、解唯一、难度递进。');
}
