# 小老虎训练中心

马拉松训练面板：Garmin 真实数据 + 训练聊天索引 + 日期搜索 + 最近三天翻转卡片。

## 在线地址
- GitHub Pages: https://xiadasy.github.io/site-training-panel/

## 本地预览
直接打开 `index.html`，或：

```bash
python3 -m http.server 8765
```

## 数据刷新
更新本地 Garmin / 聊天合并源后：

```bash
python3 build_merged_data.py
```

然后提交 `merged_data.js` 与 `index.html`。

## 数据口径
- 职业生涯全马 PB：2019 北京马拉松 2:38:07
- 2026 当前周期基准赛：无锡马拉松 2:42:17
- 累计里程来自悦跑圈：44,932.08 km
- 跑鞋精确里程从 2026-07-19 起算
