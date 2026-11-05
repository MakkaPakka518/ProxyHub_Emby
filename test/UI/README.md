# ProxyHub 面板 UI 测试版

基于仓库根目录的 `4.1.2` 发布版。下载本目录的 **worker.js**，按原来的方式粘贴到测试 Worker 即可使用；沿用现有环境变量与 `DB` 绑定。

## 界面调整

- 石墨色 / 浅灰双主题，深绿色操作强调，清晰的文字层级。
- 桌面顶部分页导航、手机底部导航；保留所有原有入口。
- 移除霓虹、背景标语与装饰动画，模式区收敛为紧凑选择区。
- 节点独立展开，保号进度与临期提醒更易扫读。
- 统一登录页、表单、弹窗、按钮和键盘焦点。

此构建仅替换发布文件的登录页和主面板 HTML 常量，反代、鉴权、D1、签到与 API 代码沿用原版。

重新生成（Node.js 22+）：

```sh
node --experimental-vm-modules test/UI/build.mjs
```

`panel.css`、`panel.js` 是界面来源，构建时内嵌到单文件 Worker。普通自动更新仍指向主版本；测试界面期间请勿点击更新覆盖。

## 检查记录

- 320、390、768、1280、1920px 布局与浅色 / 深色主题；核心文字对比度 ≥ 4.5:1。
- 原业务脚本、DOM ID、代理 / 鉴权 / 数据库处理代码完整性。
- 键盘打开模式菜单、页面切换、手机弹窗保存按钮可达、登录页。
- 模拟接口下的节点编辑与 Bot 保存、Bark 配置、保号刷新、订阅者只读权限显示。
- Impeccable 对新增 CSS / JS 的静态检查通过。

浏览器检查使用模拟数据，不访问真实源站。复现时将 `UI_TEST_TOOLS` 指向已安装 `playwright-core` 与 `@sparticuz/chromium` 的工具目录，`UI_TEST_OUTPUT` 指向截图目录：

```sh
UI_TEST_TOOLS=/path/to/browser-tools UI_TEST_OUTPUT=/tmp/proxyhub-ui-preview \
  node --experimental-vm-modules test/UI/verify.mjs
```

真实 Cloudflare / Emby 播放链路由测试部署验证。
