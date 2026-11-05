---
name: ProxyHub Emby 测试工作空间
description: 午夜蓝导航、暖白工作面与铜色操作组成的媒体线路管理界面。
colors:
  primary: "#b74424"
  primary-soft: "#f9ece5"
  on-primary: "#fff"
  bg: "#f5f4f0"
  bg-soft: "#f0f1f3"
  card: "#fff"
  text: "#202d40"
  text-sec: "#596579"
  text-faint: "#657184"
  border: "#e0e3e8"
  border-strong: "#b3bdc9"
  success: "#247049"
  warning: "#906112"
  danger: "#b33242"
  dark-primary: "#f3a580"
  dark-primary-soft: "#42312e"
  dark-on-primary: "#331e17"
  dark-bg: "#101927"
  dark-bg-soft: "#233047"
  dark-card: "#192539"
  dark-text: "#edf0f5"
  dark-text-sec: "#b1bed1"
  dark-text-faint: "#a2b1c7"
  dark-border: "#344258"
  dark-border-strong: "#62718a"
  dark-success: "#8bc5a3"
  dark-warning: "#efc784"
  dark-danger: "#ffa5b4"
  rail: "#14233a"
  rail-text: "#f0f3fa"
  rail-muted: "#b6c3d5"
  rail-hover: "#273a54"
  rail-selected: "#fff0e5"
  rail-selected-text: "#913b20"
  overview: "#20334e"
  overview-text: "#f3f5f9"
  overview-muted: "#c0cddd"
  overview-attention: "#f0b793"
  mode-off: "#df825d"
  mode-real: "#879cc3"
  mode-dual: "#7cbab1"
  mode-strict: "#d3ab65"
  mode-emos: "#b09ebd"
typography:
  headline: {fontSize: "32px", fontWeight: 650, letterSpacing: "-1px"}
  headline-mobile: {fontSize: "28px", fontWeight: 650, letterSpacing: "-1px"}
  title: {fontSize: "16px", fontWeight: 600}
  body: {fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif', fontSize: "14px", lineHeight: 1.55, letterSpacing: "0px"}
  button: {fontSize: "13px", fontWeight: 550}
  label: {fontSize: "12px", fontWeight: 500}
  metric: {fontSize: "36px", fontWeight: 550, lineHeight: 1.2, letterSpacing: "-1px"}
  metric-mobile: {fontSize: "30px", fontWeight: 550, lineHeight: 1.2, letterSpacing: "-1px"}
  route-path: {fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace", fontSize: "11px"}
rounded:
  radius-sm: "8px"
  radius-md: "10px"
  route: "12px"
  radius: "14px"
  overlay: "16px"
spacing:
  compact: "8px"
  control: "12px"
  mobile: "16px"
  inset: "20px"
  panel: "24px"
  desktop: "32px"
components:
  button-primary: {backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.radius-sm}", padding: "10px 16px"}
  button-ghost: {backgroundColor: "transparent", textColor: "{colors.text-sec}", rounded: "{rounded.radius-sm}", padding: "8px 12px"}
  button-delete: {backgroundColor: "transparent", textColor: "{colors.danger}", rounded: "{rounded.radius-sm}", padding: "8px 12px"}
  button-danger: {backgroundColor: "{colors.danger}", textColor: "{colors.card}", rounded: "{rounded.radius-sm}"}
  input: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.radius-sm}", padding: "10px 12px"}
  nav-item: {textColor: "{colors.rail-muted}", rounded: "{rounded.radius-md}", padding: "12px 16px"}
  nav-item-selected: {backgroundColor: "{colors.rail-selected}", textColor: "{colors.rail-selected-text}", rounded: "{rounded.radius-md}"}
  mode-filter: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "7px", padding: "7px 10px"}
  route-row: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.route}", padding: "18px 20px 14px"}
  retention-inbox: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.radius}"}
---

# Design System: ProxyHub Emby 测试工作空间

## Overview

**Creative North Star: "Cinematheque 媒体工作空间"**

午夜蓝导航承托暖白工作面，铜色标记操作和选择；深色主题保留相同结构。界面的辨识度来自目录式排布、清楚的数字和可直接操作的线路，而非装饰图像。系统字体服务中文管理任务。

这是独立构建的 `test/UI` 预览系统。依据 `panel.css`、`panel.js`、构建模板及三张 `preview-*.png` 记录已实现规则；`DIRECTION.md` 保存页面方向与构图约定。用户已否定轻量换肤，当前实现采用侧栏、总览带与分区工作空间。

**Key Characteristics:**
- 固定午夜蓝导航，暖色工作面与铜色交互。
- 桌面线路行与保号收件箱并列，手机保留完整操作入口。
- 总览、模式分布与保号提醒由实际线路数据派生。
- 不新增图片资产；用文字、原有 SVG 图标和克制的状态反馈组织任务。

## Colors

### Primary

铜色 `primary` 用于主操作、链接、焦点与筛选选择；`primary-soft` 承接浅色选择背景。深色主题使用 `dark-primary` 与深铜色文字 `dark-on-primary`，避免直接把浅色按钮反白搬过去。

### Neutral

`bg` 是暖白工作底，`card` 是实色面板，略冷的 `bg-soft` 区分工具条与次级信息。`text`、`text-sec`、`text-faint` 分工为主文、说明与占位文字；`border-strong` 用于可输入控件。`dark-*` 对应 `body.ui-studio.dark` 的实际覆盖值；组件随同名 CSS 变量切换。

午夜蓝 `rail` 和总览蓝 `overview` 在两种主题下不变。桌面当前导航项保持奶油底与深铜文字；手机当前项改用主题内的 `primary-soft` / `primary`。

语义色 `success` / `warning` / `danger` 表示正常、临期、逾期或危险操作，柔和背景沿用 CSS 中各自的 `*-soft` 变量。五个 `mode-*` 色区分 off、realip_only、dual、strict、emos；它们是类别编码，不是健康评级。

**The Semantic Separation Rule.** 铜色表示交互，模式色表示类别，保号状态同时提供文字；不可仅靠颜色传达状态。

## Typography

沿用前置 token 中的系统中文无衬线栈；不加载字体文件。路径使用等宽栈，测量值使用等宽数字（`tabular-nums`）。

- 页面标题使用 headline；手机切换 headline-mobile。普通面板标题使用 title，媒体库区标题为桌面（19px）/ 手机（18px）。
- 正文（14px）、按钮（13px）、筛选标签与说明（12px）构成紧凑层级；路径与次级数据（11px），局部辅助信息（10px）。这些小字不应推广为正文尺寸。
- 总览数字使用 metric / metric-mobile；字体大小按断点切换，不使用流体展示字。

## Layout

- **桌面骨架：** 固定导航轨（216px）；右侧工具栏高（72px）。内容最大宽（1520px），内边距（104px 32px 32px），计入顶部工具栏留空。
- **宽屏工作区：** 在（≥1200px）时，线路占剩余宽度，右侧保号区宽（264px），间距（24px）；在（≥1500px）时右区增至（300px），间距（32px）。路线始终是一列可展开行，不恢复多列卡片墙。
- **1200px 分界：** CSS 的（≤1199px）规则将保号区移到线路上方，收件箱默认折叠，隐藏边缘连接说明；RTT 移到工具栏。总览收起介绍文案、保留数字。中间宽度下提醒列表为两列。
- **900px 分界：** 在（≤900px）时取消侧栏占位，改为（64px）顶栏、带安全区留白的底部导航；内容内边距（84px 20px 28px）。工具进入带文字的菜单，批量管理默认折叠，模式筛选横向滚动。
- 手机线路行重排为全宽卡片（16px 内边距）；搜索独占一行，两个次级操作并列。提醒、设置、测速配置均转单列。页脚为底部导航预留（96px + safe-area）空间。
- 节点编辑器是右侧全高面板，最大宽（760px），桌面左角圆角（20px）；手机去圆角并堆叠字段。登录面板最大宽（440px）。

## Elevation & Depth

实色表面与细边框承担层级，不使用玻璃模糊或霓虹光晕。静止卡片用 `--shadow-sm`，线路悬停用 `--shadow`，菜单、弹窗、登录与 toast 用 `--shadow-lg`；两种主题的准确值保存在侧车 `extensions.shadows`。

按钮颜色过渡为（180ms），不位移、不缩放；页面切换与弹窗入场取消动画。焦点即时呈现。`prefers-reduced-motion: reduce` 关闭动画、过渡并恢复即时滚动。

## Shapes

控件使用小圆角（8px），导航与次级面板使用中圆角（10px），线路（12px）、卡片与收件箱（14px）、总览和弹窗（16px）依次区分层级。细线划分行内保号计量、展开详情与提醒条目；不靠厚边或重复嵌套卡片制造结构。

## Components

### Buttons and inputs

- 主按钮实心铜色、最小高（40px）；次级按钮透明底加细边、最小高（36px）。行内删除用危险色文字，确认危险操作使用危险色实底。
- 主按钮悬停亮度（0.95）；普通次级按钮悬停采用 `bg-soft` 与主文色。键盘焦点统一为铜色外描边（2px，偏移 3px），禁用按钮透明度（0.5）并显示禁用指针。
- 输入框采用 `border-strong`、实色面、可读占位文字。桌面输入字（14px），手机输入、选择和多行文本统一（16px）；登录密钥输入始终（16px），最小高（48px）。
- 请求中、失败和保存反馈沿用既有业务处理器；toast 设置为 `role=status` / `aria-live=polite`。这里不把未逐项验证的加载、错误或按压样式记为通用组件状态。

### Navigation and filters

- 导航项最小高（48px），当前页通过 `aria-current` 同步。桌面图标与文字同行，手机垂直排列；强制色模式下当前项增加系统 Highlight 边框。
- 手机工具菜单按钮同步 `aria-expanded`；点击操作、外部区域或 Escape 收起。主题按钮的可访问名称和可见标签随主题变化。
- 模式筛选以 `aria-pressed` 表示选择，Enter / Space 复用现有点击操作。清除搜索、显示全部、提醒定位与保存刷新同步筛选选择状态。批量管理入口遵循管理员角色限制。

### Route rows and retention inbox

- 线路行集中展示名称、等宽路径、模式、测量值、复制和展开入口；下方保号计量带提供期限与剩余天数，详情在本行展开。名称允许换行，沿用用户自定义图标。
- 保号收件箱使用原生 `details` / `summary`，列出需关注节点与可用操作；点击节点沿用原定位行为，刷新沿用保号处理器。无待关注节点时隐藏整个收件箱。
- 总览初始显示破折号；读取 `window.globalRoutesData` 后，节点数为数组长度，今日播放为 `todayReqs` 数值之和，待关注数来自 `getWatchState()` 的 overdue / warning / unknown。统计口径覆盖已加载线路，不随当前搜索裁剪。
- 五类分布条按实际模式计数分配宽度，零计数类别不绘制；空数据时总览归零、分布条为空。分布条是 `aria-hidden` 的辅助图形，文字模式筛选和计数承载可读信息。
- RTT 表示设备到 Cloudflare 的往返延迟，节点测速是独立操作；不将 RTT 当作源站健康或在线率。

## Do's and Don'ts

### Do:
- **Do** 沿用主题变量、系统中文字体与统一焦点，保持手机输入文字至少 16px。
- **Do** 让线路、保号文字和实际数据主导层级，同时保留订阅者权限边界。
- **Do** 保留用户已有头像、Logo 和自定义节点图标，使用原有内联 SVG 表达控件。

### Don't:
- **Don't** 将截图中的 6 / 12 / 3、延迟或 P 头像当作生产数据和新品牌资产。
- **Don't** 为此工作空间添加 sprite、emoji 图标、装饰栅格图、霓虹或电影胶片边框。
- **Don't** 将缺失数据包装成在线率、流量趋势或其它虚构遥测。

**资产与验证边界：** 新 UI 没有新增 sprite、emoji 或栅格资产；现有用户 Logo / 头像 / 自定义图标仍可由原页面加载。截图左上角的绿色 P 头像是 `verify.mjs` 拦截图片请求时返回的 SVG fixture，不是生产资产；侧栏底部的 P 是文字。三张 PNG 是测试证据，不是界面依赖。侧车合成色阶只供文档面板预览，不是实现 token。`verify.mjs` 使用 mock APIs、模拟路由数据及第三方脚本替身，覆盖多宽度、双主题、部分对比度与操作；不能据此宣称真实 Cloudflare、Emby、D1 或播放链路已验证。
