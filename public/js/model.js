/*
 * 字幕模型操作：时间校验、整体/选中平移、重叠检测。
 * 纯逻辑、无 DOM 依赖，浏览器（window.SubModel）与 Node 双端可用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SubModel = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * 校验单条字幕时间。合法返回 null，否则返回中文错误信息。
   * 规则：必须为整数毫秒；不允许负时间；不允许结束早于开始。
   */
  function validateCueTimes(startMs, endMs) {
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs)) {
      return '时间必须是整数毫秒';
    }
    if (startMs < 0) return '开始时间不能为负';
    if (endMs < 0) return '结束时间不能为负';
    if (endMs < startMs) return '结束时间早于开始时间';
    return null;
  }

  /**
   * 平移字幕时间（不修改入参）。
   * @param cues  [{ id, startMs, endMs, text }]
   * @param ids   要平移的字幕 id 数组；传 null 表示全部
   * @param deltaMs 偏移毫秒（正=延后，负=提前），必须为整数
   * @returns { ok:true, cues } 或 { ok:false, error, problems } —— 任一结果非法则整体拒绝
   */
  function shiftCues(cues, ids, deltaMs) {
    if (!Number.isInteger(deltaMs)) {
      return { ok: false, error: '偏移量必须是整数毫秒', problems: [] };
    }
    const idSet = ids === null ? null : new Set(ids);
    const next = cues.map(c => {
      if (idSet && !idSet.has(c.id)) return { ...c };
      return { ...c, startMs: c.startMs + deltaMs, endMs: c.endMs + deltaMs };
    });
    const problems = [];
    for (const c of next) {
      const err = validateCueTimes(c.startMs, c.endMs);
      if (err) problems.push({ id: c.id, message: err });
    }
    if (problems.length > 0) {
      return {
        ok: false,
        error: '平移会导致 ' + problems.length + ' 条字幕时间非法（' + problems[0].message + ' 等），已取消',
        problems,
      };
    }
    return { ok: true, cues: next };
  }

  /**
   * 找出时间上互相重叠的字幕，返回重叠字幕 id 的 Set。
   * 判定：按开始时间排序后，后一条开始时间 < 前一条结束时间即重叠（首尾相接不算）。
   */
  function findOverlaps(cues) {
    const sorted = [...cues].sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs));
    const overlapping = new Set();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startMs < sorted[i].endMs) {
          overlapping.add(sorted[i].id);
          overlapping.add(sorted[j].id);
        } else {
          break;
        }
      }
    }
    return overlapping;
  }

  return { validateCueTimes, shiftCues, findOverlaps };
});
