# ProxyHub 面板 UI 3 · 明文测试版

基于 **`明文/worker.js`（4.1.2）** 生成，交付文件为保留换行的可读明文 JavaScript。下载本目录的 **worker.js**，按原来的方式粘贴到测试 Worker；沿用环境变量与 `DB` 绑定。测试通过后可自行混淆。

## 界面调整

- **节点展台 + 媒体图库**：选中节点成为主工作区，名称、入口、周期和用量同步更新。
- 快捷复制入口、编辑节点、导入播放器与查看详情，复用原功能；节点所有者保持编辑权限。
- Apple 风格悬浮导航、分段选择、排版和即时按压反馈；毛玻璃仅用于功能导航层。
- 午夜蓝、暖白与铜色双主题；保号环沿用原提醒的小数口径和“时间待确认”状态。
- 手机保持首屏快捷操作，提醒与批量操作按需展开；选择节点后转到展台。
- 支持减少动态效果、减少透明度；编辑 / 导入弹窗支持键盘焦点隔离、Escape 关闭与焦点返回。

## 预览

预览使用模拟节点与头像，实际部署显示你自己的数据。

![桌面浅色](preview-desktop.png)

<img src="preview-mobile.png" alt="390×844 手机界面" width="390">

![桌面深色](preview-dark.png)

此构建替换明文底稿的登录页和主面板 HTML 常量，反代、鉴权、D1、签到与 API 代码与明文底稿保持一致。

重新生成（Node.js 22+）：

```sh
node --experimental-vm-modules test/UI/build.mjs
```

`panel.css`、`panel.js` 是界面来源，构建时内嵌到单文件 Worker。普通自动更新仍指向主版本；测试界面期间请勿点击更新覆盖。

## 检查记录

- 320、390、768、1280、1920px 布局与浅色 / 深色主题；390px 使用 844px 高度，核心文字对比度 ≥ 4.5:1。
- 对比明文底稿的原业务脚本、DOM ID、代理 / 鉴权 / 数据库处理代码完整性；输出多行，无 `_0x` 混淆声明。
- 键盘打开模式菜单、页面切换、手机弹窗保存按钮可达、登录页。
- 模拟接口下的展台选中、复制、编辑、导入、详情重复打开、图库折叠恢复、筛选和空搜索、保存后刷新。
- 节点所有者与订阅者权限、0.1 天 / 逾期小数 / 无效时间记录、主题菜单连续切换。
- 弹窗初始焦点、Tab 循环、Escape 与焦点返回；减少动态和透明度模式。
- Impeccable 静态扫描已执行；用户要求的新圆角与材质变更记录在 DESIGN.md。

浏览器检查使用模拟数据，不访问真实源站。复现时将 `UI_TEST_TOOLS` 指向已安装 `playwright-core` 与 `@sparticuz/chromium` 的工具目录，`UI_TEST_OUTPUT` 指向截图目录：

```sh
UI_TEST_TOOLS=/path/to/browser-tools UI_TEST_OUTPUT=/tmp/proxyhub-ui-preview \
  node --experimental-vm-modules test/UI/verify.mjs
```

真实 Cloudflare / Emby 播放链路由测试部署验证。
