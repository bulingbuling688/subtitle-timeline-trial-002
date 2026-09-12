/*
 * 前端交互：导入/编辑/平移/视频联动/撤销重做/导出。
 * 全部数据只存在于浏览器内存与本地文件，不向服务器发送。
 */
/* global SRT, SubModel, SubHistory */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = {
    fileInput: $('file-input'),
    loadSample: $('load-sample'),
    exportBtn: $('export-btn'),
    undoBtn: $('undo-btn'),
    redoBtn: $('redo-btn'),
    shiftAmount: $('shift-amount'),
    shiftEarlier: $('shift-earlier'),
    shiftLater: $('shift-later'),
    scopeSelected: $('scope-selected'),
    selectAll: $('select-all'),
    tbody: $('cue-tbody'),
    message: $('message'),
    overlapInfo: $('overlap-info'),
    videoInput: $('video-input'),
    video: $('video'),
    overlay: $('overlay'),
    cueCount: $('cue-count'),
  };

  const history = SubHistory.createHistory(200);
  let selected = new Set();   // 勾选的字幕 id
  let activeIds = new Set();  // 视频播放位置命中的字幕 id
  let videoUrl = null;
  let sourceName = 'edited';  // 导出文件名基名

  const clone = cues => cues.map(c => ({ ...c }));
  const currentCues = () => history.state || [];

  function showMessage(text, kind) {
    els.message.textContent = text || '';
    els.message.className = 'message ' + (kind || 'info');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // ---------- 渲染 ----------

  function render() {
    const cues = currentCues();
    const overlaps = SubModel.findOverlaps(cues);
    els.tbody.innerHTML = '';

    cues.forEach((cue, i) => {
      const tr = document.createElement('tr');
      tr.dataset.id = cue.id;
      if (overlaps.has(cue.id)) tr.classList.add('overlap');
      if (activeIds.has(cue.id)) tr.classList.add('active');

      const tdSel = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'row-select';
      cb.checked = selected.has(cue.id);
      cb.dataset.id = cue.id;
      tdSel.appendChild(cb);

      const tdIdx = document.createElement('td');
      tdIdx.className = 'idx';
      tdIdx.textContent = i + 1;

      const tdStart = document.createElement('td');
      const startInput = document.createElement('input');
      startInput.className = 'time-input';
      startInput.value = SRT.msToTime(cue.startMs);
      startInput.dataset.field = 'startMs';
      startInput.dataset.id = cue.id;
      tdStart.appendChild(startInput);

      const tdEnd = document.createElement('td');
      const endInput = document.createElement('input');
      endInput.className = 'time-input';
      endInput.value = SRT.msToTime(cue.endMs);
      endInput.dataset.field = 'endMs';
      endInput.dataset.id = cue.id;
      tdEnd.appendChild(endInput);

      const tdText = document.createElement('td');
      const ta = document.createElement('textarea');
      ta.className = 'text-input';
      ta.value = cue.text;
      ta.rows = Math.max(1, cue.text.split('\n').length);
      ta.dataset.id = cue.id;
      tdText.appendChild(ta);

      tr.append(tdSel, tdIdx, tdStart, tdEnd, tdText);
      els.tbody.appendChild(tr);
    });

    els.cueCount.textContent = '共 ' + cues.length + ' 条';
    els.overlapInfo.textContent = overlaps.size > 0
      ? '⚠ 检测到 ' + overlaps.size + ' 条字幕时间重叠（已标红）'
      : '';
    els.undoBtn.disabled = !history.canUndo();
    els.redoBtn.disabled = !history.canRedo();
    els.exportBtn.disabled = cues.length === 0;
    els.selectAll.checked = cues.length > 0 && cues.every(c => selected.has(c.id));
  }

  // ---------- 导入 ----------

  function loadText(text, name) {
    const { cues, errors } = SRT.parseSrt(text);
    if (cues.length === 0) {
      const detail = errors.map(e => '块' + e.block + ': ' + e.message).join('；');
      showMessage('导入失败：未解析到有效字幕。' + detail, 'error');
      return;
    }
    history.init(clone(cues));
    selected = new Set();
    activeIds = new Set();
    sourceName = name;
    render();
    if (errors.length > 0) {
      const detail = errors.map(e => '块' + e.block + ' ' + e.message).join('；');
      showMessage('已导入 ' + cues.length + ' 条字幕；' + errors.length + ' 个块被跳过：' + detail, 'warn');
    } else {
      showMessage('已导入 ' + cues.length + ' 条字幕（' + name + '）', 'info');
    }
  }

  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), file.name.replace(/\.srt$/i, ''));
    reader.onerror = () => showMessage('读取文件失败', 'error');
    reader.readAsText(file);
    els.fileInput.value = '';
  });

  els.loadSample.addEventListener('click', () => {
    fetch('sample.srt')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(text => loadText(text, '内置示例'))
      .catch(err => showMessage('载入示例失败：' + err.message, 'error'));
  });

  // ---------- 编辑 ----------

  els.tbody.addEventListener('change', (e) => {
    const t = e.target;
    const id = Number(t.dataset.id);
    const cues = currentCues();

    if (t.classList.contains('row-select')) {
      if (t.checked) selected.add(id); else selected.delete(id);
      els.selectAll.checked = cues.length > 0 && cues.every(c => selected.has(c.id));
      return;
    }

    if (t.classList.contains('time-input')) {
      const ms = SRT.timeToMs(t.value);
      if (ms === null) {
        showMessage('时间格式无效：' + t.value + '（应为 HH:MM:SS,mmm）', 'error');
        render();
        return;
      }
      const next = cues.map(c => c.id === id ? { ...c, [t.dataset.field]: ms } : { ...c });
      const cue = next.find(c => c.id === id);
      const err = SubModel.validateCueTimes(cue.startMs, cue.endMs);
      if (err) {
        showMessage('修改被拒绝：' + err, 'error');
        render();
        return;
      }
      history.commit(next);
      showMessage('');
      render();
      return;
    }

    if (t.classList.contains('text-input')) {
      if (t.value.trim().length === 0) {
        showMessage('修改被拒绝：正文不能为空', 'error');
        render();
        return;
      }
      const next = cues.map(c => c.id === id ? { ...c, text: t.value } : { ...c });
      history.commit(next);
      showMessage('');
      render();
    }
  });

  // 点击行空白处 -> 视频跳转到该条起点
  els.tbody.addEventListener('click', (e) => {
    if (e.target.closest('input, textarea')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const cue = currentCues().find(c => c.id === Number(tr.dataset.id));
    if (!cue) return;
    if (!els.video.src) {
      showMessage('请先选择本地视频', 'warn');
      return;
    }
    els.video.currentTime = cue.startMs / 1000;
  });

  els.selectAll.addEventListener('change', () => {
    const cues = currentCues();
    selected = els.selectAll.checked ? new Set(cues.map(c => c.id)) : new Set();
    render();
  });

  // ---------- 平移 ----------

  function applyShift(sign) {
    const cues = currentCues();
    if (cues.length === 0) {
      showMessage('请先导入字幕', 'warn');
      return;
    }
    const raw = els.shiftAmount.value.trim();
    if (!/^\d+$/.test(raw)) {
      showMessage('偏移量必须是非负整数毫秒', 'error');
      return;
    }
    const amount = Number(raw);
    const onlySelected = els.scopeSelected.checked;
    if (onlySelected && selected.size === 0) {
      showMessage('未选中任何字幕', 'warn');
      return;
    }
    const ids = onlySelected ? [...selected] : null;
    const res = SubModel.shiftCues(cues, ids, sign * amount);
    if (!res.ok) {
      showMessage(res.error, 'error');
      return;
    }
    history.commit(res.cues);
    render();
    const scope = onlySelected ? selected.size + ' 条选中字幕' : '全部字幕';
    showMessage('已将' + scope + (sign < 0 ? '提前 ' : '延后 ') + amount + ' ms', 'info');
  }

  els.shiftEarlier.addEventListener('click', () => applyShift(-1));
  els.shiftLater.addEventListener('click', () => applyShift(1));

  // ---------- 撤销 / 重做 ----------

  function doUndo() {
    history.undo();
    render();
  }

  function doRedo() {
    history.redo();
    render();
  }

  els.undoBtn.addEventListener('click', doUndo);
  els.redoBtn.addEventListener('click', doRedo);

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return; // 输入框内保留浏览器原生撤销
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
      e.preventDefault();
      doUndo();
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
      e.preventDefault();
      doRedo();
    }
  });

  // ---------- 导出 ----------

  els.exportBtn.addEventListener('click', () => {
    const cues = currentCues();
    if (cues.length === 0) return;
    const blob = new Blob([SRT.formatSrt(cues)], { type: 'application/x-subrip;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sourceName + '.edited.srt';
    a.click();
    URL.revokeObjectURL(a.href);
    showMessage('已导出 ' + a.download, 'info');
  });

  // ---------- 视频 ----------

  els.videoInput.addEventListener('change', () => {
    const file = els.videoInput.files[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    els.video.src = videoUrl;
    showMessage('已载入视频：' + file.name, 'info');
  });

  els.video.addEventListener('timeupdate', () => {
    const t = els.video.currentTime * 1000;
    const now = currentCues().filter(c => c.startMs <= t && t <= c.endMs);
    const ids = new Set(now.map(c => c.id));

    els.overlay.innerHTML = now
      .map(c => escapeHtml(c.text).replace(/\n/g, '<br>'))
      .join('<br>');

    const changed = ids.size !== activeIds.size || [...ids].some(id => !activeIds.has(id));
    if (changed) {
      activeIds = ids;
      els.tbody.querySelectorAll('tr').forEach(tr => {
        tr.classList.toggle('active', ids.has(Number(tr.dataset.id)));
      });
      const firstActive = els.tbody.querySelector('tr.active');
      if (firstActive) firstActive.scrollIntoView({ block: 'nearest' });
    }
  });

  // ---------- 启动 ----------

  render();
  els.loadSample.click(); // 启动即载入内置示例，便于直接体验
})();
