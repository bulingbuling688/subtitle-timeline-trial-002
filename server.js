/*
 * 仅提供静态文件托管：页面、前端脚本与内置示例字幕。
 * 字幕文件与视频均在浏览器本地处理，本服务器不接收、不存储任何用户数据。
 */
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`字幕时间轴校准工具已启动: http://localhost:${PORT}`);
});
