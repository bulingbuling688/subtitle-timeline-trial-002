/* SRT 解析与导出回读测试 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { timeToMs, msToTime, parseSrt, formatSrt } = require('../public/js/srt.js');

test('timeToMs 解析标准时间戳', () => {
  assert.equal(timeToMs('00:00:00,000'), 0);
  assert.equal(timeToMs('00:00:01,500'), 1500);
  assert.equal(timeToMs('01:02:03,004'), 3723004);
  assert.equal(timeToMs('10:00:00,000'), 36000000);
});

test('timeToMs 兼容点号毫秒与短毫秒位', () => {
  assert.equal(timeToMs('00:00:01.500'), 1500);
  assert.equal(timeToMs('00:00:01,5'), 1500);
  assert.equal(timeToMs('00:00:01,05'), 1050);
});

test('timeToMs 拒绝非法输入', () => {
  assert.equal(timeToMs('abc'), null);
  assert.equal(timeToMs('00:61:00,000'), null); // 分钟超界
  assert.equal(timeToMs('00:00:60,000'), null); // 秒超界
  assert.equal(timeToMs('00:00:01'), null);     // 缺毫秒
  assert.equal(timeToMs(''), null);
  assert.equal(timeToMs(null), null);
});

test('msToTime 输出标准格式', () => {
  assert.equal(msToTime(0), '00:00:00,000');
  assert.equal(msToTime(1500), '00:00:01,500');
  assert.equal(msToTime(3723004), '01:02:03,004');
  assert.equal(msToTime(359999999), '99:59:59,999');
});

test('timeToMs 与 msToTime 互逆', () => {
  for (const ms of [0, 1, 999, 61000, 3723004, 360000000]) {
    assert.equal(timeToMs(msToTime(ms)), ms);
  }
});

test('parseSrt 解析基本块与多行正文', () => {
  const text = [
    '1',
    '00:00:01,000 --> 00:00:03,500',
    '第一行',
    '第二行',
    '',
    '2',
    '00:00:04,000 --> 00:00:05,000',
    '单行',
    '',
  ].join('\n');
  const { cues, errors } = parseSrt(text);
  assert.equal(errors.length, 0);
  assert.equal(cues.length, 2);
  assert.deepEqual(
    cues.map(c => [c.startMs, c.endMs]),
    [[1000, 3500], [4000, 5000]]
  );
  assert.equal(cues[0].text, '第一行\n第二行');
  assert.equal(cues[1].text, '单行');
});

test('parseSrt 处理 BOM 与 CRLF', () => {
  const text = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\n你好\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n世界\r\n';
  const { cues, errors } = parseSrt(text);
  assert.equal(errors.length, 0);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '你好');
});

test('parseSrt 忽略时间行尾部的坐标信息', () => {
  const text = '1\n00:00:01,000 --> 00:00:02,000 X1:100 X2:200\n带坐标\n';
  const { cues, errors } = parseSrt(text);
  assert.equal(errors.length, 0);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].endMs, 2000);
});

test('parseSrt 异常数据：坏块被跳过并记录，好块保留', () => {
  const text = [
    '1',
    '00:00:01,000 --> 00:00:02,000',
    '正常块',
    '',
    '2',
    '这不是时间行',
    '缺时间行的块',
    '',
    '3',
    '00:00:aa,000 --> 00:00:02,000',
    '时间戳非法',
    '',
    '4',
    '00:00:05,000 --> 00:00:04,000',
    '结束早于开始',
    '',
    '5',
    '00:00:06,000 --> 00:00:07,000',
    '',
    '6',
    '00:00:08,000 --> 00:00:09,000',
    '又一个正常块',
    '',
  ].join('\n');
  const { cues, errors } = parseSrt(text);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '正常块');
  assert.equal(cues[1].text, '又一个正常块');
  assert.equal(errors.length, 4);
  assert.ok(errors.some(e => e.message.includes('时间行格式无效')));
  assert.ok(errors.some(e => e.message.includes('时间戳无效')));
  assert.ok(errors.some(e => e.message.includes('结束时间早于开始时间')));
  assert.ok(errors.some(e => e.message.includes('缺少字幕正文')));
});

test('parseSrt 对完全非法输入返回空结果与错误', () => {
  const { cues, errors } = parseSrt('垃圾内容\n没有字幕');
  assert.equal(cues.length, 0);
  assert.ok(errors.length > 0);
  const nonString = parseSrt(null);
  assert.equal(nonString.cues.length, 0);
  assert.equal(nonString.errors.length, 1);
});

test('导出回读：formatSrt -> parseSrt 时间与正文完全一致', () => {
  const cues = [
    { id: 1, startMs: 0, endMs: 1500, text: '开头' },
    { id: 2, startMs: 61001, endMs: 63500, text: '多行\n字幕\n三行' },
    { id: 3, startMs: 3723004, endMs: 3723999, text: '含标点，测试 —— 「」' },
  ];
  const roundTrip = parseSrt(formatSrt(cues));
  assert.equal(roundTrip.errors.length, 0);
  assert.equal(roundTrip.cues.length, cues.length);
  roundTrip.cues.forEach((c, i) => {
    assert.equal(c.startMs, cues[i].startMs);
    assert.equal(c.endMs, cues[i].endMs);
    assert.equal(c.text, cues[i].text);
  });
});

test('导出回读：内置示例 sample.srt 往返一致', () => {
  const samplePath = path.join(__dirname, '..', 'public', 'sample.srt');
  const original = fs.readFileSync(samplePath, 'utf8');
  const first = parseSrt(original);
  assert.equal(first.errors.length, 0, '内置示例本身应无解析错误');
  assert.ok(first.cues.length >= 5);
  assert.ok(first.cues.some(c => c.text.includes('\n')), '示例应包含多行字幕');
  const second = parseSrt(formatSrt(first.cues));
  assert.equal(second.errors.length, 0);
  assert.deepEqual(
    second.cues.map(c => [c.startMs, c.endMs, c.text]),
    first.cues.map(c => [c.startMs, c.endMs, c.text])
  );
});
