/*
 * SRT 字幕解析 / 格式化 / 时间换算。
 * 纯逻辑、无 DOM 依赖，浏览器（window.SRT）与 Node（module.exports）双端可用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SRT = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // 允许 1~3 位小时、1~2 位分/秒（0-59）、逗号或点分隔的 1~3 位毫秒
  const TIME_RE = /^(\d{1,3}):([0-5]?\d):([0-5]?\d)[,.](\d{1,3})$/;

  /** "HH:MM:SS,mmm" -> 毫秒；非法返回 null */
  function timeToMs(str) {
    const m = TIME_RE.exec(String(str == null ? '' : str).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    let msStr = m[3 + 1];
    while (msStr.length < 3) msStr += '0'; // "5" -> 500ms
    const ms = Number(msStr);
    return ((h * 60 + min) * 60 + sec) * 1000 + ms;
  }

  /** 毫秒 -> "HH:MM:SS,mmm"（始终输出逗号、毫秒补齐 3 位） */
  function msToTime(ms) {
    if (!Number.isFinite(ms)) return '00:00:00,000';
    const sign = ms < 0 ? '-' : '';
    let v = Math.abs(Math.round(ms));
    const h = Math.floor(v / 3600000); v -= h * 3600000;
    const m = Math.floor(v / 60000); v -= m * 60000;
    const s = Math.floor(v / 1000); v -= s * 1000;
    const pad = (n, w) => String(n).padStart(w, '0');
    return sign + pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + ',' + pad(v, 3);
  }

  /**
   * 解析 SRT 文本。
   * 返回 { cues, errors }：
   *   cues   —— [{ id, index, startMs, endMs, text }]，text 保留原始多行
   *   errors —— [{ block, message }]，无法解析的块被跳过并记录原因
   */
  function parseSrt(text) {
    const cues = [];
    const errors = [];
    if (typeof text !== 'string') {
      return { cues, errors: [{ block: null, message: '输入不是文本' }] };
    }
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const blocks = normalized.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 0);

    blocks.forEach((block, i) => {
      const blockNo = i + 1;
      const lines = block.split('\n');
      let index = null;
      let timingLineIdx = 0;
      if (/^\d+$/.test(lines[0].trim())) {
        index = Number(lines[0].trim());
        timingLineIdx = 1;
      }
      if (timingLineIdx >= lines.length) {
        errors.push({ block: blockNo, message: '缺少时间行' });
        return;
      }
      const timingLine = lines[timingLineIdx];
      const m = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(timingLine);
      if (!m) {
        errors.push({ block: blockNo, message: '时间行格式无效：' + timingLine.trim() });
        return;
      }
      const startMs = timeToMs(m[1]);
      const endMs = timeToMs(m[2]);
      if (startMs === null || endMs === null) {
        errors.push({ block: blockNo, message: '时间戳无效：' + timingLine.trim() });
        return;
      }
      if (endMs < startMs) {
        errors.push({ block: blockNo, message: '结束时间早于开始时间' });
        return;
      }
      const textLines = lines.slice(timingLineIdx + 1);
      const text = textLines.join('\n');
      if (text.trim().length === 0) {
        errors.push({ block: blockNo, message: '缺少字幕正文' });
        return;
      }
      cues.push({ id: cues.length + 1, index, startMs, endMs, text });
    });
    return { cues, errors };
  }

  /** 序列化为标准 SRT 文本（序号重排，时间统一逗号毫秒） */
  function formatSrt(cues) {
    return cues.map((c, i) =>
      (i + 1) + '\n' + msToTime(c.startMs) + ' --> ' + msToTime(c.endMs) + '\n' + c.text
    ).join('\n\n') + '\n';
  }

  return { timeToMs, msToTime, parseSrt, formatSrt };
});
