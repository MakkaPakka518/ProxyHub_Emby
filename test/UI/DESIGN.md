---
name: ProxyHub 媒体空间
description: 午夜蓝节点展台、媒体图库与 Apple 式功能材质。
colors:
  bg: "#f5f4f1"
  card: "#ffffff"
  card-glass: "#ffffffdf"
  text: "#202d40"
  text-sec: "#596579"
  primary: "#b74424"
  primary-soft: "#f9ece5"
  border: "#dce1e8"
  border-strong: "#a8b3c2"
  dark-bg: "#101824"
  dark-card: "#1a2638"
  dark-card-glass: "#1a2638ed"
  dark-text: "#edf0f5"
  dark-text-sec: "#b1bed1"
  dark-primary: "#f3a580"
  dark-on-primary: "#331e17"
  stage: "#1d3049"
  dark-stage: "#20334d"
  stage-text: "#f4f6fa"
  stage-muted: "#bfcbda"
  stage-button: "#fff0e6"
  stage-button-text: "#74361e"
  stage-button-hover: "#fff7f1"
  cycle: "#8dceac"
  cycle-warning: "#eaca92"
  cycle-overdue: "#ffb2bb"
typography:
  body: {fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif', fontSize: "14px", lineHeight: 1.6}
  headline: {fontSize: "2.375rem", fontWeight: 650, letterSpacing: "-.035em", lineHeight: 1.18}
  node-title: {fontSize: "2.5rem", fontWeight: 600, letterSpacing: "-.035em", lineHeight: 1.22}
  mobile-headline: {fontSize: "1.875rem", fontWeight: 650}
  mobile-node-title: {fontSize: "1.625rem", fontWeight: 600}
  label: {fontSize: "12px", fontWeight: 500}
  mobile-input: {fontSize: "16px"}
  route-path: {fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace", fontSize: "11px"}
rounded:
  badge: "6px"
  control: "10px"
  selected-tab: "11px"
  action: "12px"
  panel: "14px"
  menu: "18px"
  card: "20px"
  bar: "22px"
  sheet: "24px"
  stage: "28px"
  pill: "99px"
spacing:
  compact: "8px"
  control: "12px"
  inset: "20px"
  panel: "24px"
  desktop: "48px"
components:
  button-primary: {backgroundColor: "{colors.primary}", textColor: "{colors.card}", rounded: "{rounded.action}", padding: "11px 18px"}
  stage-action: {backgroundColor: "{colors.stage-button}", textColor: "{colors.stage-button-text}", rounded: "{rounded.action}", padding: "10px 15px"}
  input: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.control}", padding: "11px 12px"}
  navigation: {backgroundColor: "{colors.card-glass}", textColor: "{colors.text-sec}", rounded: "{rounded.bar}"}
  mode-chip: {textColor: "{colors.text-sec}", rounded: "{rounded.pill}", padding: "8px 14px"}
  node-card: {backgroundColor: "{colors.card}", textColor: "{colors.text}", rounded: "{rounded.card}", padding: "20px"}
---

# Design System: ProxyHub 媒体空间

## Overview

**Creative North Star: "节点展台与媒体图库"**

在午夜蓝与铜色主题上，用 Apple 式功能材质、系统排版与直接反馈建立层级。选中的真实节点拥有主工作区，图库负责浏览和切换；工作区构图详见 DIRECTION.md。

**Key Characteristics:**
- 透明材质只用于悬浮导航，媒体内容使用实色表面。
- 节点选择、状态和快捷操作始终对应同一条真实线路。
- 明暗主题、键盘操作及减少动态 / 透明度均有明确状态。

## Colors

### Primary
铜色用于主要操作、焦点与选中状态；展台的浅铜按钮在深色内容上突出复制入口。深色主题用明亮铜色与深色按钮文字。

### Neutral
暖白底、实色卡片和蓝灰文字构成浅色空间；深色空间使用海军蓝层级。展台使用独立的 stage 色组，文字和分隔线不依赖背景模糊。

周期环以 cycle、cycle-warning、cycle-overdue 区分状态，并始终附带文字。其余普通状态控件沿用 CSS 的 success、warning、danger 双主题变量。

## Typography

中文系统无衬线贯穿页面；路径用等宽体，数据用 tabular-nums。页面标题与选中节点使用 rem 单位，移动端分别缩至 mobile-headline、mobile-node-title。手机输入固定为 16px；倒计时保留共享函数的小数精度，长数值标签缩小以避免挤出环形区域。

## Layout

内容最大宽 1440px，桌面左右内边距 48px。导航距顶部 16px、侧边 24px。桌面导航位于顶栏中央；≤760px 时同一导航节点移到 body 底部，避免 backdrop-filter 创建的定位容器影响固定导航。

展台以可变宽身份区和 360px 状态区并排；≤1100px 状态区收为 300px，≤760px 两区上下排列。图库按最小 290px 卡片自适应，手机为单列。选择卡片会更新展台、移动焦点并滚动至留有 104px 顶部空间的位置。提醒是顶部展开面板，不占据固定侧栏。

## Elevation & Depth

导航使用 24px blur 与 130% saturation，内容卡片没有玻璃材质。菜单、弹窗与浮动导航的阴影承担遮挡层级。减少透明度或提高对比度时导航改为实色；减少动态时跳转立即完成且不播放选择动画。

选中节点切换使用 220ms、可中断的透明度过渡；按压时局部 scale(.97/.98) 即时反馈，没有常驻装饰动画。

## Shapes

节点卡片使用 card 圆角，展台用 stage 圆角；浮动导航与弹窗分别采用 bar、sheet。胶囊只用于模式选择和提醒入口，小状态标签使用 badge。边框表示分区与选中，不使用霓虹光晕。

## Components

- **快捷操作：** 复制入口是展台主操作，其他操作为深色面上的描边按钮；最小高度 44px。管理员与节点所有者沿用原编辑 / 导入处理器，订阅者保持只读。
- **图库：** 图标和名称组成原生选择按钮，aria-pressed 与所选展台同步；拖拽、批量选择、原卡片详情和搜索仍使用原处理器。
- **保号环：** 仅表达真实周期；数值与提示均使用原共享格式化函数，无效记录显示“观看时间待确认”。
- **模式与工具：** 分段导航同步 aria-current；工具菜单和原生 details 具有可访问名称，支持 Escape。切换主题后标签持续准确。
- **编辑 / 导入弹窗：** 使用 dialog 语义、初始焦点、Tab 循环、背景 inert 和关闭后焦点恢复。全局状态提示移入当前弹窗，确保保存失败仍能被朗读；关闭时恢复原位置。

## Do's and Don'ts

### Do:
- **Do** 用真实节点数据驱动展台与周期，保持原接口和所有者权限。
- **Do** 使用系统字体、明确焦点和 44px 手机主要操作目标。
- **Do** 只在导航功能层使用透明材质，并提供实色回退。

### Don't:
- **Don't** 把截图里的 P 头像、统计数字当作新生产素材；它们是 fixture。
- **Don't** 用整数向上取整替代原保号小数规则，或把无效时间当作首次观看。
- **Don't** 把面板包装成模仿 OS 窗口的外壳。

测试文件基于明文/worker.js，未混淆；预览 PNG 仅为模拟接口的检查证据。真实 Cloudflare / Emby 播放及物理 iPhone 尚未实测。
