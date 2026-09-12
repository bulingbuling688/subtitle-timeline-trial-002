/* 时间平移、校验与重叠检测测试 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCueTimes, shiftCues, findOverlaps } = require('../public/js/model.js');

function makeCues() {
  return [
    { id: 1, startMs: 1000, endMs: 2000, text: 'a' },
    { id: 2, startMs: 3000, endMs: 4000, text: 'b' },
    { id: 3, startMs: 5000, endMs: 6000, text: 'c' },
  ];
}

test('shiftCues 全部延后，毫秒级精确', () => {
  const res = shiftCues(makeCues(), null, 1234);
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.cues.map(c => [c.startMs, c.endMs]),
    [[2234, 3234], [4234, 5234], [6234, 7234]]
  );
});

test('shiftCues 全部提前', () => {
  const res = shiftCues(makeCues(), null, -500);
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.cues.map(c => [c.startMs, c.endMs]),
    [[500, 1500], [2500, 3500], [4500, 5500]]
  );
});

test('shiftCues 1 毫秒精度', () => {
  const res = shiftCues(makeCues(), null, 1);
  assert.equal(res.ok, true);
  assert.equal(res.cues[0].startMs, 1001);
  assert.equal(res.cues[0].endMs, 2001);
});

test('shiftCues 只平移选中的字幕', () => {
  const res = shiftCues(makeCues(), [1, 3], 250);
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.cues.map(c => [c.id, c.startMs, c.endMs]),
    [[1, 1250, 2250], [2, 3000, 4000], [3, 5250, 6250]]
  );
});

test('shiftCues 产生负时间时整体拒绝且不修改原数据', () => {
  const cues = makeCues();
  const res = shiftCues(cues, null, -1500); // 第一条会变成 -500
  assert.equal(res.ok, false);
  assert.match(res.error, /非法/);
  assert.equal(res.problems.length, 1);
  assert.equal(res.problems[0].id, 1);
  // 原数组未被改动
  assert.deepEqual(
    cues.map(c => [c.startMs, c.endMs]),
    [[1000, 2000], [3000, 4000], [5000, 6000]]
  );
});

test('shiftCues 恰好平移到 0 是允许的', () => {
  const res = shiftCues(makeCues(), null, -1000);
  assert.equal(res.ok, true);
  assert.equal(res.cues[0].startMs, 0);
});

test('shiftCues 拒绝非整数偏移量', () => {
  assert.equal(shiftCues(makeCues(), null, 1.5).ok, false);
  assert.equal(shiftCues(makeCues(), null, NaN).ok, false);
});

test('validateCueTimes 拦截负时间与结束早于开始', () => {
  assert.equal(validateCueTimes(0, 1000), null);
  assert.equal(validateCueTimes(1000, 1000), null); // 零时长允许
  assert.match(validateCueTimes(-1, 1000), /负/);
  assert.match(validateCueTimes(1000, -1), /负/);
  assert.match(validateCueTimes(2000, 1000), /早于/);
  assert.match(validateCueTimes(0.5, 1000), /整数/);
});

test('findOverlaps 标出互相重叠的字幕', () => {
  const cues = [
    { id: 1, startMs: 1000, endMs: 3000, text: '' },
    { id: 2, startMs: 2500, endMs: 4000, text: '' }, // 与 1 重叠
    { id: 3, startMs: 4000, endMs: 5000, text: '' }, // 与 2 首尾相接，不算重叠
    { id: 4, startMs: 6000, endMs: 7000, text: '' },
  ];
  const overlaps = findOverlaps(cues);
  assert.deepEqual([...overlaps].sort(), [1, 2]);
});

test('findOverlaps 处理包含与链式重叠', () => {
  const cues = [
    { id: 1, startMs: 0, endMs: 10000, text: '' },
    { id: 2, startMs: 2000, endMs: 3000, text: '' }, // 被 1 包含
    { id: 3, startMs: 2500, endMs: 4000, text: '' }, // 与 1、2 重叠
    { id: 4, startMs: 20000, endMs: 21000, text: '' },
  ];
  const overlaps = findOverlaps(cues);
  assert.deepEqual([...overlaps].sort(), [1, 2, 3]);
});

test('findOverlaps 无重叠时返回空集合', () => {
  const cues = [
    { id: 1, startMs: 0, endMs: 1000, text: '' },
    { id: 2, startMs: 1000, endMs: 2000, text: '' }, // 首尾相接不算重叠
  ];
  assert.equal(findOverlaps(cues).size, 0);
  assert.equal(findOverlaps([]).size, 0);
});
