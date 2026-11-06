---
name: ProxyHub Graphite
description: 以微对比建立层次的双主题节点管理界面。
colors:
  surface-0: "hsl(220 10% 94%)"
  surface-1: "hsl(220 10% 96%)"
  surface-2: "hsl(220 10% 98%)"
  ink: "hsl(220 12% 23%)"
  ink-muted: "hsl(220 8% 42%)"
  ink-quiet: "hsl(220 6% 46%)"
  accent: "hsl(214 35% 37%)"
  positive: "hsl(153 35% 32%)"
  negative: "hsl(353 42% 42%)"
  caution: "hsl(32 54% 35%)"
  overlay: "hsl(220 12% 10% / .42)"
  field-edge: "hsl(220 10% 50% / .06)"
  menu-shadow: "hsl(220 15% 10% / .16)"
  login-shadow: "hsl(220 15% 20% / .1)"
  dark-surface-0: "hsl(220 12% 13%)"
  dark-surface-1: "hsl(220 12% 15%)"
  dark-surface-2: "hsl(220 12% 17%)"
  dark-ink: "hsl(220 10% 89%)"
  dark-ink-muted: "hsl(220 8% 72%)"
  dark-ink-quiet: "hsl(220 6% 66%)"
  dark-accent: "hsl(214 38% 74%)"
typography:
  metadata: {fontSize: "12px", lineHeight: 1.6}
  body: {fontSize: "14px", lineHeight: 1.6, fontWeight: 400}
  section: {fontSize: "16px", lineHeight: 1.6, fontWeight: 600}
  heading: {fontSize: "20px", lineHeight: 1.4, fontWeight: 600}
rounded:
  compact: "8px"
  control: "10px"
  item: "12px"
  section: "16px"
  drawer: "20px"
spacing:
  small: "8px"
  control: "12px"
  mobile: "16px"
  item: "20px"
  section: "24px"
---

# ProxyHub UI 设计规范

## 适用范围与来源

当前模式为 Operate：用户查看节点状态、管理线路、测速、配置权限与通知。以当前 `worker.js` 为完整交付物；共享样式维护在 `refinements.css`，执行 `node test/UI/build-refinements.mjs` 后内嵌。

桌面遵循 `desktop-agent-ui`，移动端遵循 `mobile-design-system`。用户明确要求的微对比、无描边与交互模式优先。历史圣诞主题文件不构成当前视觉依据。

## 分层与颜色

- 浅色背景/内容面/上层表面的 HSL 明度分别为 94%/96%/98%；暗色为 13%/15%/17%。相邻层级相差 2%，暗色基底为石墨灰。
- 以背景色阶、间距和分组建立秩序，卡片不使用可见外框、霓虹光晕或彩条。
- 投影用于抽屉与浮动菜单。菜单阴影半径控制在边缘留白以内；普通卡片不做漂浮效果。
- 成功、警告、失败仍有独立语义色和文字，不靠背景色代替业务状态。

## 文字与排版

- 系统字体，四档尺寸 12/14/16/20px；手机输入框至少 16px。
- 常规、中等、强调字重为 400/500/600；暗色对应 300/400/500。字重不参与主题补间，避免在切换中出现错误的中间层级。
- 全局 `font-variant-numeric: tabular-nums`。数字变化保留相同数字宽度，技术路径仍可用等宽字体。
- 正文 `text-wrap: pretty`；标题与节点名称 `text-wrap: balance`。长名称可换行，容器允许收缩。
- 标题、字段和页脚操作共享内边距；表单长标签采用底部对齐输入控件。

## 输入与抽屉

- 输入框默认有极轻的内阴影，聚焦时中性双环整体加深。键盘焦点使用较清晰的中性外环，不用亮蓝色边线。
- 宽屏节点编辑器从右侧展开，最大宽度 720px；手机及手机横屏铺满宽度，从底部展开。
- 标题/关闭和取消/保存固定，中部独立滚动。安全区与 VisualViewport 负责键盘空间。
- 初始焦点放在非输入标题，手动点按后才开始填写；校验错误仍可定位对应字段。

## 折叠与反馈

- `ui-fold` 使用 `grid-template-rows: 0fr → 1fr`；内层 `min-height: 0` 与裁切容器承载真实内容，不用 JavaScript 测量高度。
- 节点列表、节点详情、测速分区、账户设置区和 IP 设置使用同一披露行为。收起时同步 `inert`、`aria-hidden` 和触发器 `aria-expanded`。
- 支持快速反向操作；减少动态效果时瞬时完成布局切换。
- 复制只在 `clipboard.writeText()` 成功后显示对勾。采用阻尼比 0.5、自然频率 22rad/s 的解析弹簧，650ms 收敛，2.5 秒后撤去。
- 连续复制复用单个确认标记；失败移除旧成功标记。减少动态效果时保持静态成功反馈。

## 移动与验证

- 手机顶部使用“工具”菜单收纳低频操作；底部导航避让安全区。触控按钮至少 48px。
- 沿用原生焦点、键盘导航、表单校验和用户的显式操作。
- `node-drawer.browser.mjs` 调用 `refinements.browser.mjs`，检查真实渲染的色阶、对比度、暗色字重差、焦点、折叠、复制、抽屉与保存恢复。
- `UI_CLIP_AUDIT` 指向桌面 Skill 的裁切脚本时，验证默认、聚焦、展开与悬停状态。截图使用模拟节点；真机软键盘与真实 Emby 链路由测试部署确认。
