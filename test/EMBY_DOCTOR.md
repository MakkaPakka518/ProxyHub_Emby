# Emby Doctor 测试版

`worker-emby-doctor.js` 是基于 CF 普通版明文源码生成的完整单文件 Worker，仅用于测试，不会影响根目录正式发布文件。

## 使用

1. 备份当前 Worker 代码和绑定。
2. 使用 `test/worker-emby-doctor.js` 覆盖测试 Worker，保留原有 `DB` 和 `ADMIN_TOKEN` 等绑定。
3. 管理员登录后，点击顶栏紫色烧杯图标。
4. 选择已配置节点。可留空账号做公开链路检查，也可临时填写普通 Emby 用户的账号和密码做播放检查。

账号和密码只存在于单次请求内，不写入 D1、URL 或浏览器存储。Worker 会临时登录获取 Token，完成账号与播放检测后在同一个请求内调用 `/Sessions/Logout` 注销；播放检查只读取一个可见媒体的 `PlaybackInfo`，Range 请求最多读取两个字节并立即中止，不主动启动转码。

Doctor 的账号与播放请求临时模拟 Pro 版默认的 SenPlayer 6.2.2 iPhone 客户端画像，包括 `User-Agent`、`X-Emby-Authorization` 和 `Accept-Language`；浏览器经过面板反代的探测还会由 Worker 补上源站 `Origin` 与 `Referer`。该画像只在管理员发起的 Doctor 体检请求中生效，不保存到节点，也不改变普通版的实际反代请求。

账号检测按伪装版保活流程优先请求 `/emby/Users/AuthenticateByName`，失败再回退根路径；直接使用登录响应中的 `User.Id`，避免共享服的 `/Users/Me` 返回 403/500。

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
