# ProxyHub Emby 测试面板

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Cloudflare Worker 单文件，原生 HTML、CSS、JavaScript；D1 保存配置。以当前 `test/UI/worker.js` 为维护入口，必须交付可直接部署、可读、多行的完整 JavaScript。`refinements.css` 经 `build-refinements.mjs` 内嵌到 Worker。用户自行部署测试、混淆。

## Users

媒体节点管理员与只读订阅者。用户确认手机和电脑都需要重新设计，两端均须保留完整操作。

## Product Purpose

集中管理 Emby 反代节点、线路、访问权限、保号周期、测速与 DNS，并提供数据统计、签到与配置管理。

## Capabilities and Constraints

- 保留原有接口、登录鉴权、D1、反代与签到逻辑。
- 节点增删改、模式切换、搜索、复制、拖拽、批量操作和播放器导入均保留。
- 保留真实的保号状态与订阅者权限边界，不编造在线率或流量。
- 桌面和移动端分别按用户选定的 `desktop-agent-ui` 与 `mobile-design-system` 规范实现。
- 当前视觉要求是微对比分层、无卡片描边、无纯黑、暗色字重下降一档、中性双环聚焦、等宽数字、Grid 折叠和复制成功的弹簧反馈。
- 节点表单在宽屏使用右侧 Drawer，手机铺满宽度，上下固定、中间滚动；展开不得自动聚焦输入框或呼出键盘。
- 交付到同一 GitHub 仓库的 test/UI/worker.js，由用户自行部署测试。

## Brand Commitments

ProxyHub / 玛卡巴卡，保留用户头像、节点名称和自定义图标。中文界面。

## Evidence on Hand

仓库 README、4.1.3 UI 测试 Worker、现有面板与浏览器测试。测试截图中的节点数据为 fixture，生产页面只读取真实接口。
