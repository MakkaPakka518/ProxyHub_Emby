# Emby Doctor 测试版

`worker-emby-doctor.js` 是基于 CF 普通版明文源码生成的完整单文件 Worker，仅用于测试，不会影响根目录正式发布文件。

## 使用

1. 备份当前 Worker 代码和绑定。
2. 使用 `test/worker-emby-doctor.js` 覆盖测试 Worker，保留原有 `DB` 和 `ADMIN_TOKEN` 等绑定。
3. 管理员登录后，点击顶栏紫色烧杯图标。
4. 选择已配置节点。可留空 Token 做公开链路检查，也可临时填写普通 Emby 用户 Token 做播放检查。

普通用户 Token 只存在于单次请求内，不写入 D1、不放入 URL，也不会返回前端。播放检查只读取一个可见媒体的 `PlaybackInfo`，Range 请求最多读取两个字节并立即中止，不主动启动转码。

## 当前检查项

- 多线路公开 API 可达性、状态码和 CF 到源站延迟
- `/System/Info/Public` 与 `/emby/System/Info/Public` 自动识别
- 普通账号 Token、媒体库和 `PlaybackInfo`
- 源站与反代链路的 Range `206`
- 当前浏览器经过 CF 反代后的服务器一致性
- 主线路失败、备用线路可用、403、子路径等诊断建议

重新生成测试文件：

```bash
node test/build-emby-doctor.mjs
```
