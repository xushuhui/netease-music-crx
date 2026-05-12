# 网易云音乐

![应用截图](https://user-images.githubusercontent.com/4012553/140094889-71088388-7d10-47b2-8e2d-3c306dc0160f.png)

## 功能

- 无损音质播放
- 收藏/取消收藏歌曲
- 排行榜
- 新歌速递
- 每日推荐
- 精选歌单
- 音乐云盘
- 私人歌单

> ✨ 碰到本来不能播放的VIP、无版权歌曲居然能正常播放时，不要惊讶，感谢咪咕、酷我的公开曲库

## 安装

 - 通过[Chrome应用商店](https://chrome.google.com/webstore/detail/ekmamdknmdolmmjbgpmnkiobcnihdhhf)安装
 - 手动下载[压缩包](https://github.com/sigoden/netease-music-crx/releases/latest)安装

## 开发

```bash
bun install
bun test scripts/*.test.js
bun run lint
bun run build
```

本项目当前是 Chrome Manifest V3 扩展：

- 后台入口为 `service-worker.bundle.js`，音频播放运行在 offscreen document。
- 网易云登录态依赖 `cookies` + `declarativeNetRequestWithHostAccess`。
- `webRequestBlocking` 已不可用，不要再新增 blocking `webRequest` listener。
- 本地调试权限变更后，建议在 `chrome://extensions` 移除旧扩展，再重新加载 `build/`。

## 许可

[GNU General Public License Version 3](https://www.gnu.org/licenses/gpl.html)
