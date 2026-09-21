# Tonia's Travel Journal · 旅行手记

## 内容

| 旅行 | 类型 | 时间 | 地址 |
|------|------|------|------|
| 🌉 大连·烟台跨海 | 飞机+轮渡+夜车 | 2026.10.02-06 | [dalian-yantai-20261001/](dalian-yantai-20261001/) |
| 🏝️ 烟台养马岛 | 高铁 | 2026.06.19-20 | [yantai/](yantai/) |
| 🍖 淄博烧烤 | 自驾 | 待定 | [zibo/](zibo/) |

其他页面：[版本更新记录](changelog/)

## 公网地址

**GitHub Pages**：https://ToniaXuu.github.io/tonia-travel-guide/

## 如何更新

1. 编辑对应页面文件
2. 告诉 WorkBuddy "更新旅行手记"
3. 自动推送到 GitHub Pages

> 每次发布新版本时，同步在 [changelog/index.html](changelog/index.html) 顶部新增一个 `<article class="release">` 区块
> （版本号、日期、标题、条目列表，条目标注 `data-type="feat|impr|fix"`）。
> 筛选计数与版本总数由 JS 自动统计，无需手工改数字。

## 技术

- HTML + CSS + JavaScript
- Canvas 粒子动画（主页 / 版本页）
- 腾讯地图 API（烟台页 / 大连·烟台页）
- Open-Meteo 实时天气（`assets/weather.js` 共享模块，全站接入）

