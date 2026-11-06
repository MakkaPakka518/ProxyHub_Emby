---
name: ProxyHub Christmas
description: UI 2 工作台的松绿、酒红与暖金圣诞主题。
colors:
  bg: "#f7f4ec"
  card: "#fffefa"
  text: "#253b32"
  text-sec: "#596a60"
  primary: "#a73745"
  primary-soft: "#f8e9e9"
  rail: "#173c31"
  rail-text: "#fff8e9"
  overview: "#234c3d"
  overview-muted: "#d2dfce"
  gold: "#f0d699"
  selected: "#f9efd5"
  selected-text: "#723d28"
  border: "#dfe4da"
  dark-bg: "#10251d"
  dark-card: "#1a3227"
  dark-text: "#f0f0e5"
  dark-primary: "#efaab0"
  dark-on-primary: "#391a23"
typography:
  body: {fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif', fontSize: "14px", lineHeight: 1.55}
  headline: {fontSize: "32px", fontWeight: 650, letterSpacing: "-1px"}
  mobile-headline: {fontSize: "28px", fontWeight: 650}
  seasonal-title: {fontSize: "21px", fontWeight: 600, letterSpacing: ".02em"}
  metric: {fontSize: "36px", fontWeight: 550, lineHeight: 1.2}
  mobile-metric: {fontSize: "28px", fontWeight: 550}
  mobile-input: {fontSize: "16px"}
rounded:
  control: "8px"
  nav: "10px"
  route: "12px"
  panel: "14px"
  overview: "16px"
  login: "20px"
spacing:
  compact: "8px"
  inset: "20px"
  panel: "24px"
  desktop: "32px"
components:
  primary-button: {backgroundColor: "{colors.primary}", textColor: "{colors.card}", rounded: "{rounded.control}", padding: "10px 16px"}
  secondary-button: {textColor: "{colors.text-sec}", rounded: "{rounded.control}", padding: "8px 12px"}
  navigation: {backgroundColor: "{colors.rail}", textColor: "{colors.rail-text}", rounded: "{rounded.nav}"}
  input: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.control}", padding: "10px 12px"}
  node-row: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.route}", padding: "18px 20px 14px"}
---

# Design System: ProxyHub Christmas

## Overview

**Creative North Star: "圣诞放映季"**

以 UI 2 的熟悉工作台承载节日配色和小幅矢量装饰。松绿用于导航与总览，酒红突出操作，暖白保持内容清晰，浅金用于节日点缀。

**Key Characteristics:**
- UI 2 侧栏、总览、列表和保号提醒布局。
- 节日艺术集中于总览、侧栏底部与登录页。
- 控件、数据和权限保持原工作流。

## Colors

主操作色是酒红；语义告警仍由 CSS 中独立的 danger / warning / success 及文字共同表达。深色主题使用柔和莓红按钮和深色按钮文字。模式分布条使用五个独立 mode-* 色，与模式选择器的条形图例对应。

## Typography

沿用系统中文字体。标题桌面 32px、手机 28px；节日标题 21px、窄屏 18px。数字使用 tabular-nums。手机输入保持 16px；不增加外部字体依赖。

## Layout

桌面保留 216px 侧栏、72px 顶栏，主内容最大宽 1520px。≥1200px 节点区与 264px 提醒区并排，≥1500px 提醒区 300px。小于1200px 提醒位于列表上方并可折叠；≤900px 改用64px顶栏、底部导航和单列节点，批量管理可展开。

## Elevation & Depth

实色背景、细边框与柔和阴影沿用 UI 2。用户要求的雪花在固定装饰层缓慢飘落，驯鹿沿下边缘经过。桌面28片雪、手机16片；使用transform与opacity动画，不加入JS逐帧循环。减少动态效果时隐藏整层，后台标签页暂停动画。装饰层使用aria-hidden、inert与pointer-events:none。

## Shapes

控件8px、导航10px、线路12px、面板14px、总览16px圆角。圣诞树、礼物与星星是自绘内联 SVG；总览顶部的3px彩带仅表达节日主题。

## Components

- **主操作 / 次级操作：** 主按钮实心酒红，次级按钮为描边；hover和键盘焦点清晰，禁用状态降低透明度。
- **总览：** 节日标题和小树与真实统计并排，手机堆叠。无倒计时或虚构统计。
- **节点行：** 保留名称、路径、模式、延迟、流量、保号进度及原有操作。共享保号函数仍负责小数、临期和无效记录。
- **弹窗：** 原处理器保持不变，初始焦点、Tab循环、Escape与焦点返回继续可用；全局状态区域在弹窗打开时移入，避免错误提示落入inert背景。
- **动效开关：** 桌面雪花按钮、手机工具菜单与登录页可暂停动效，aria-pressed同步状态；localStorage记录proxyhub_holiday_motion。系统减少动态设置优先。

## Do's and Don'ts

### Do:
- **Do** 保留 UI 2 的结构，使用真实接口数据。
- **Do** 让装饰层点击穿透、不取得焦点，并提供暂停入口。
- **Do** 同时维护浅色、深色与手机布局。

### Don't:
- **Don't** 恢复节点展台或图库交互。
- **Don't** 用装饰色代替状态文字。
- **Don't** 将截图中的数据和 P 头像作为生产默认值。

艺术源为 panel.js 的 holidayArt 和 holidayMotion 内联SVG；动效预览为真实CSS动画暂停在固定时刻的截图，使用模拟数据。worker.js 为明文版本，真实服务行为由测试部署验证。
