# 独立聊天记录查看器

一个用于 SillyTavern 的第三方扩展。它从当前聊天上下文读取消息，在独立弹窗中显示，不依赖主聊天区的渲染结果，因此适合快速查看被正则、插件 UI 或长页面滚动影响的历史记录。

## 功能

- 从输入框右侧的魔法棒菜单打开；同时在扩展设置面板提供备用入口。
- 左侧目录按楼层显示角色名和消息预览，点击后定位对应楼层。
- 顶部百分比进度条支持拖动，也可以直接输入 0–100 的百分比。
- 当前聊天切换、发送、接收、编辑、删除和 swipe 后，已打开的查看器会自动刷新。
- 消息内容以安全的纯文本方式显示，不执行聊天记录中的 HTML、脚本或插件内容。
- 自适应手机屏幕。

## 安装

把整个 `sillytavern-chat-viewer` 文件夹复制到以下任一位置：

- 当前用户安装：`data/<用户名>/extensions/third-party/sillytavern-chat-viewer/`
- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-viewer/`

确认文件夹中直接包含 `manifest.json`、`index.js` 和 `style.css`，然后重启 SillyTavern，或在扩展管理中刷新/重新加载扩展。

安装并启用后，点击输入框右侧魔法棒，选择“独立查看聊天记录”。

## 兼容说明

插件使用 SillyTavern 官方扩展清单格式和 `SillyTavern.getContext().chat` API。它不会修改、删除或保存聊天内容，也不会参与提示词生成。
