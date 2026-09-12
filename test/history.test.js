/* 撤销 / 重做历史栈测试（含与字幕操作的集成场景） */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory } = require('../public/js/history.js');
const { shiftCues } = require('../public/js/model.js');
const { parseSrt, formatSrt } = require('../public/js/srt.js');

test('commit 后可 undo 回退、redo 恢复', () => {
  const h = createHistory(10);
  h.init(['v0']);
  h.commit(['v1']);
  h.commit(['v2']);
  assert.equal(h.canUndo(), true);
  assert.deepEqual(h.undo(), ['v1']);
  assert.deepEqual(h.undo(), ['v0']);
  assert.equal(h.canUndo(), false);
  assert.deepEqual(h.redo(), ['v1']);
  assert.deepEqual(h.redo(), ['v2']);
  assert.equal(h.canRedo(), false);
});

test('undo 后再 commit 会清空重做栈', () => {
  const h = createHistory(10);
  h.init(0);
  h.commit(1);
  h.commit(2);
  h.undo(); // 回到 1
  h.commit(99);
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), 1);
});

test('空栈 undo/redo 是安全的', () => {
  const h = createHistory(10);
  h.init('only');
  assert.equal(h.undo(), 'only');
  assert.equal(h.redo(), 'only');
  assert.equal(h.state, 'only');
});

test('历史深度受 limit 限制', () => {
  const h = createHistory(3);
  h.init(0);
  for (let i = 1; i <= 10; i++) h.commit(i);
  let steps = 0;
  while (h.canUndo()) { h.undo(); steps++; }
  assert.equal(steps, 3);
});

test('集成：导入 -> 编辑 -> 平移 -> 撤销重做 -> 导出回读一致', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n00:00:03,000 --> 00:00:04,000\n世界\n';
  const { cues, errors } = parseSrt(srt);
  assert.equal(errors.length, 0);

  const h = createHistory(100);
  h.init(cues.map(c => ({ ...c })));

  // 编辑第 1 条正文
  const edited = h.state.map(c => c.id === 1 ? { ...c, text: '你好，字幕' } : { ...c });
  h.commit(edited);

  // 全部延后 500ms
  const shifted = shiftCues(h.state, null, 500);
  assert.equal(shifted.ok, true);
  h.commit(shifted.cues);

  // 当前状态：正文已改、时间已移
  assert.equal(h.state[0].text, '你好，字幕');
  assert.equal(h.state[0].startMs, 1500);

  // 撤销两步：先回滚平移，再回滚编辑
  h.undo();
  assert.equal(h.state[0].startMs, 1000);
  assert.equal(h.state[0].text, '你好，字幕');
  h.undo();
  assert.equal(h.state[0].text, '你好');

  // 重做两步
  h.redo();
  h.redo();
  assert.equal(h.state[0].startMs, 1500);
  assert.equal(h.state[0].text, '你好，字幕');

  // 导出再导入，时间与正文保持一致
  const roundTrip = parseSrt(formatSrt(h.state));
  assert.equal(roundTrip.errors.length, 0);
  assert.deepEqual(
    roundTrip.cues.map(c => [c.startMs, c.endMs, c.text]),
    [[1500, 2500, '你好，字幕'], [3500, 4500, '世界']]
  );
});
