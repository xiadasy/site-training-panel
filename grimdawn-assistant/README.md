# 恐怖黎明 · 套装助手

纯静态站，可直接 GitHub Pages / 任意静态托管。  
数据版本：**Grim Tools itemdb · Game 1.3.0.6**（提取于 2026-08-14）

在线示例（挂在训练面板仓库下）：  
https://xiadasy.github.io/site-training-panel/grimdawn-assistant/

---

## 功能

| 页签 | 能力 |
|------|------|
| **职业** | 10 专精单修/双修筛选；按 +专精点 / +技能等级 / 技能强化 打分；推荐套装、散件、按部位 |
| **图鉴** | 199 套装（有效 179）；等级/DLC/件数/稀有/神话/职业分筛选；属性芯片；全文搜索 |
| **我的配装** | 本机 localStorage 收藏多套方案 |
| **对比** | 最多 3 套并排 |
| **任务** | 3DM 全 DLC 中文图文攻略索引（约 118 页）+ 任务名查询 / 任务线梳理 |
| **说明** | 计分规则与数据说明 |

部件详情含：图标精灵、神话标记、套装加成（bonusTiers）、获取来源（MI/任务/商人/裂缝箱/制作等）。

---

## 目录结构

```
grimdawn-assistant/
├── index.html              # 入口
├── app.js                  # 前端逻辑
├── styles.css
├── data_js/                # 内嵌数据（勿对 minis:// 或 file 协议 fetch JSON）
│   ├── meta.js
│   ├── sets_index.js
│   ├── sets.js
│   ├── class_guide.js
│   ├── sources.js
│   ├── item_details.js
│   ├── icon_meta.js
│   ├── quests_index.js
│   └── quest_library.js
├── icons/
│   ├── icons.css / itemdb.css
│   ├── itemdb.webp         # 装备图标精灵
│   └── bg/                 # 稀有度底图
└── quest_images_webp/      # 任务攻略配图
```

---

## 本地预览

任意静态服务器即可（不要直接双击 `file://`，部分浏览器会拦模块/路径）：

```bash
# Python
cd grimdawn-assistant && python3 -m http.server 8765

# Node
npx serve .
```

浏览器打开：http://127.0.0.1:8765/

在 Minis 内可直接打开：

`minis://workspace/grimdawn-assistant/index.html`

---

## 部署到 GitHub Pages

### 方式 A：独立仓库（推荐）

1. 新建公开仓库，例如 `grimdawn-assistant`
2. 把本目录**全部文件**推到仓库根目录（不要多包一层文件夹）
3. Settings → Pages → Source: Deploy from branch `main` / `/ (root)`
4. 访问：`https://<user>.github.io/grimdawn-assistant/`

### 方式 B：挂在已有站点子目录

把整个 `grimdawn-assistant/` 目录放进仓库，例如：

`site-training-panel/grimdawn-assistant/`

Pages 开启后访问：

`https://<user>.github.io/site-training-panel/grimdawn-assistant/`

改代码后如遇缓存，把 `index.html` 里 `?v=9` 改成新版本号。

---

## 数据说明

- 套装/散件/来源/图标：Grim Tools itemdb
- 任务图文：3DM 攻略整理为本地 webp + 索引（离线可查摘要与配图）
- 职业分：对装备绑定技能/专精点统计，**高分 ≠ 毕业最优**，只表示技能树绑定深

本仓库为静态快照，不自动跟随游戏热更。要更新数据需重新从 itemdb 提取并生成 `data_js/*`。

---

## 体积

约 **41 MB**（含图标精灵与任务配图）。纯逻辑 + 文本数据约 15 MB。

---

## License / 声明

粉丝工具，数据版权归 Crate Entertainment / 各攻略来源所有。仅供学习与私人查询，请勿商用。
