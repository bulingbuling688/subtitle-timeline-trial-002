# 字幕时间轴校准工具

一个本地使用的 SRT 字幕时间轴校准工具：导入 SRT、编辑每条字幕的起止时间与正文（支持多行）、按毫秒统一提前/延后全部或选中字幕、本地视频联动预览、撤销/重做、导出标准 SRT。

**字幕文件与视频只在浏览器本地处理，不会上传到服务器。** 服务器仅托管静态页面与内置示例。

## 技术栈

- 前端：原生 HTML / CSS / JavaScript（无任何前端框架）
- 后端：Node.js + Express（仅静态文件托管，无数据库）
- 测试：Node.js 内置测试运行器（`node:test`，无额外测试依赖）

## 安装

要求 Node.js ≥ 18（开发验证环境为 Node v22）。

```bash
npm install
```

## 启动

```bash
npm start
```

然后浏览器打开 <http://localhost:3000>（可用 `PORT=8080 npm start` 换端口）。页面打开后会自动载入内置示例字幕（`public/sample.srt`），也可点击"载入内置示例"重新载入。

## 使用说明

- **导入 SRT**：点击"导入 SRT"选择本地 `.srt` 文件（FileReader 本地读取，不上传）。无法解析的块会被跳过并在页面顶部列出原因。
- **编辑**：直接修改表格中的开始/结束时间（格式 `HH:MM:SS,mmm`，也接受 `.` 分隔毫秒）与正文（多行文本框）。负时间、结束早于开始、空正文会被拦截并提示，修改不会生效。
- **统一平移**：输入毫秒数（非负整数），选择"全部字幕 / 仅选中"，点击"提前"或"延后"。若平移会导致任一字幕出现负时间，整次操作被拒绝。
- **重叠标注**：时间互相重叠的字幕行会标红，工具栏显示重叠数量（首尾相接不算重叠）。
- **视频预览**：点击"选择本地视频"（`URL.createObjectURL` 本地加载，不上传）。播放时视频下方浮层显示当前字幕，列表中对应行高亮并自动滚动；点击字幕行空白处，视频跳转到该条起点。
- **撤销/重做**：工具栏按钮或 `Ctrl+Z` / `Ctrl+Shift+Z`（`Ctrl+Y`），最多保留 200 步。
- **导出 SRT**：点击"导出 SRT"下载 `<原名>.edited.srt`，序号重排、时间统一为逗号毫秒格式，重新导入后时间与正文保持一致（有测试保证）。

## 验证方式

```bash
npm test
```

测试位于 `test/`，直接 `require` 前端同源的核心逻辑模块（`public/js/srt.js`、`model.js`、`history.js`，浏览器/Node 双端通用），覆盖：

| 覆盖点 | 测试文件 | 内容 |
| --- | --- | --- |
| 字幕解析 | `test/srt.test.js` | 时间戳换算互逆、多行正文、BOM/CRLF、点号毫秒、时间行尾部坐标 |
| 时间调整 | `test/model.test.js` | 全部/选中平移、提前/延后、1ms 精度、恰好平移到 0 |
| 异常数据 | `test/srt.test.js`、`test/model.test.js` | 缺时间行、非法时间戳、结束早于开始、空正文、负时间拦截、非整数偏移 |
| 撤销重做 | `test/history.test.js` | 回退/恢复、重做栈清空、空栈安全、历史深度上限 |
| 导出回读 | `test/srt.test.js`、`test/history.test.js` | `formatSrt → parseSrt` 时间与正文完全一致；内置示例往返一致；导入→编辑→平移→撤销重做→导出回读集成场景 |

实际运行结果（Node v22.23.2）：**28 个测试全部通过，0 失败**。

```
1..28
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55.245434
```

另外对服务器做过手工冒烟验证：`/`、`/sample.srt`、`/js/app.js` 均返回 200。

## 未验证 / 已知限制

以下部分**没有自动化测试覆盖**，需人工在浏览器中确认：

- 前端 DOM 交互（表格编辑、勾选、按钮、快捷键）未做浏览器端自动化测试（无 Playwright 等依赖）。
- 视频播放联动（`timeupdate` 高亮、浮层显示、点击跳转）仅人工验证；不同格式视频的解码能力取决于浏览器。
- 浏览器兼容性：开发目标是现代 Chromium/Firefox，未在 Safari/旧浏览器上验证。
- 非 UTF-8 编码（如 GBK）的 SRT 文件导入可能出现乱码，未做编码嗅探。
- 超大字幕文件（数万条）下的表格渲染性能未压测；重叠检测为 O(n²) 实现。
- `npm install` 时 npm 报告 2 个 moderate 级依赖漏洞（Express 依赖链），未处理。

## 项目结构

```
server.js            Express 静态服务器（唯一起点）
package.json
public/
  index.html         页面结构
  css/style.css      样式
  js/srt.js          SRT 解析/格式化/时间换算（浏览器+Node 双端）
  js/model.js        时间校验、平移、重叠检测（双端）
  js/history.js      撤销/重做历史栈（双端）
  js/app.js          前端交互（DOM 专用）
  sample.srt         内置示例字幕
test/
  srt.test.js        解析与导出回读
  model.test.js      平移、校验、重叠
  history.test.js    撤销重做与集成场景
```
