# 独立聊天记录查看器

一个用于 SillyTavern 的第三方扩展。它从当前聊天上下文读取消息，在独立弹窗中显示，不依赖主聊天区的渲染结果，因此适合快速查看被正则、插件 UI 或长页面滚动影响的历史记录。

## 功能

- 从输入框右侧的魔法棒菜单打开（唯一的入口，不再占用扩展设置页空间）。
- 左侧目录按楼层显示角色名和消息预览，点击后定位对应楼层。
- 顶部百分比进度条支持拖动，也可以直接输入 0–100 的百分比。
- 三种显示模式开关，可自由组合：
  - **只看正文**：剥离 HTML 标签和酒馆助手美化内容（`<body>` 美化块、脚本、样式），只显示纯文本正文；开启时另外两个开关自动关闭。
  - **HTML 渲染**：在查看器内部安全渲染消息中的 HTML、链接、图片、代码块和基础排版。
  - **酒馆助手美化**：在沙盒 iframe 中渲染消息里酒馆助手（TavernHelper / JS-slash-runner）的 `<body>` 美化块，还原美化排版；iframe 未授予脚本权限，其中的 JavaScript 一律不执行。
- 当前聊天切换、发送、接收、编辑、删除和 swipe 后，已打开的查看器会自动刷新。
- 纯文本模式下，被美化楼层在目录中的预览也会自动提取正文，而不是显示代码。
- 查看器使用独立的深色玻璃质感主题，不依赖酒馆当前的美化主题。
- 开关状态保存在浏览器本地，标题栏会显示当前渲染模式。
- 自适应手机屏幕。

## 安装

把整个 `sillytavern-chat-viewer` 文件夹复制到以下任一位置：

- 当前用户安装：`data/<用户名>/extensions/third-party/sillytavern-chat-viewer/`
- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-viewer/`

确认文件夹中直接包含 `manifest.json`、`index.js` 和 `style.css`，然后重启 SillyTavern，或在扩展管理中刷新/重新加载扩展。

安装并启用后，点击输入框右侧魔法棒，选择“独立查看聊天记录”。

## 国内加速访问

如果访问 GitHub 较慢，可以通过以下国内加速方式获取本插件（内容与 GitHub 仓库实时同步）：

- **jsDelivr CDN（浏览/下载单个文件）**：
  - <https://cdn.jsdelivr.net/gh/w1516970/sillytavern-chat-viewer@main/manifest.json>
  - <https://cdn.jsdelivr.net/gh/w1516970/sillytavern-chat-viewer@main/index.js>
  - <https://cdn.jsdelivr.net/gh/w1516970/sillytavern-chat-viewer@main/style.css>
- **GitHub 加速代理（克隆 / 扩展管理器安装用）**：
  - `https://ghproxy.net/https://github.com/w1516970/sillytavern-chat-viewer`
  - `https://gh-proxy.com/https://github.com/w1516970/sillytavern-chat-viewer`
  - 在 SillyTavern 扩展管理中"通过 Git URL 安装"时，填入上面带代理前缀的地址即可。

## 兼容说明

插件使用 SillyTavern 官方扩展清单格式和 `SillyTavern.getContext().chat` API。它不会修改、删除或保存聊天内容，也不会参与提示词生成。HTML 模式会通过 SillyTavern 提供的 DOMPurify 清理脚本、iframe、表单和事件属性；“酒馆助手美化”模式在未授予脚本权限的沙盒 iframe 中渲染；插件不会执行聊天记录中的任何 JavaScript。
