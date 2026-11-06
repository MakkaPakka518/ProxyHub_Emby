# ProxyHub · 最新 UI 测试版

本目录的 **[worker.js](worker.js)** 是完整、可直接粘贴部署的 UI 测试版，基于 4.1.3。下载完整文件，粘贴到测试 Worker，沿用环境变量与 `DB` 绑定。

**[直接下载最新 UI 测试版 worker.js](https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/main/test/UI/worker.js)**

普通功能测试版放在 `test/worker.js`；UI 修改统一交付到 `test/UI/worker.js`。

## 当前调整：节点配置 Drawer

- 新增、编辑节点共用响应式抽屉。
- 宽屏从右侧打开，最大宽度 720px。
- 手机铺满宽度，从底部展开；顶部标题与关闭按钮固定，底部取消与保存按钮固定，仅中间表单滚动。
- 手机横屏同样铺满宽度，表单高度跟随软键盘可视区域调整。
- 表单按基本信息、服务器线路、播放与转发、保号与账号分组，统一标题、输入框和操作区的对齐。
- 支持键盘焦点循环、Escape、关闭后返回原入口和减少动态效果。

## 验证

使用 Node.js 22+。`UI_TEST_TOOLS` 指向安装了 `playwright` 的目录；可通过 `CHROMIUM_PATH` 指定浏览器。

```sh
UI_TEST_TOOLS=/path/to/browser-tools UI_TEST_OUTPUT=/tmp/proxyhub-ui-preview \
  node --experimental-vm-modules test/UI/node-drawer.browser.mjs
```

检查直接读取本目录的 `worker.js`，覆盖 320–1440px 布局、明暗主题、固定标题与操作区、键盘及触屏、模拟软键盘区域、表单校验、新增/编辑保存和失败后恢复。

浏览器检查使用模拟接口；真实 Cloudflare / Emby 链路及手机软键盘由测试部署验证。

## 历史文件

`worker.js-圣诞节`、`panel.css`、`panel.js`、`build.mjs`、`verify.mjs` 和原预览图属于历史圣诞主题。`build.mjs` 会生成旧主题，不用于构建当前 Drawer 测试版。

面板的普通自动更新指向正式版本；测试此 UI 时不要点击自动更新覆盖。
