/*
 * 撤销 / 重做历史栈（快照式）。
 * 纯逻辑、无 DOM 依赖，浏览器（window.SubHistory）与 Node 双端可用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SubHistory = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * 用法：
   *   const h = createHistory(200);
   *   h.init(state0);          // 载入初始状态，清空历史
   *   h.commit(state1);        // 每次修改后提交快照，并清空重做栈
   *   h.undo(); h.redo();      // 返回切换后的当前状态
   *   h.canUndo(); h.canRedo();
   *   h.state                  // 当前状态（只读）
   */
  function createHistory(limit) {
    const max = Number.isInteger(limit) && limit > 0 ? limit : 200;
    const past = [];
    const future = [];
    let present = null;

    return {
      get state() { return present; },

      init(state) {
        present = state;
        past.length = 0;
        future.length = 0;
      },

      commit(state) {
        if (present !== null) {
          past.push(present);
          if (past.length > max) past.shift();
        }
        present = state;
        future.length = 0;
      },

      undo() {
        if (past.length === 0) return present;
        future.push(present);
        present = past.pop();
        return present;
      },

      redo() {
        if (future.length === 0) return present;
        past.push(present);
        present = future.pop();
        return present;
      },

      canUndo() { return past.length > 0; },
      canRedo() { return future.length > 0; },
    };
  }

  return { createHistory };
});
