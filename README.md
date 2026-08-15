# dsh-md-annotator

在 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的 Markdown 预览中**逐项批注**，并把全部批注一键整理成结构化修改指令写入聊天对话框，以便对产出内容进行精准修改。

## 功能

- 打开任意 `.md` 文件（侧边栏预览）时，把文档解析为块：标题、段落、列表项（逐项）、表格、代码块、引用、水平线；
- 悬停任意块 / 列表项 → 「＋批注」→ 内联填写修改意见（支持增/改/删，一处可多条），并可给批注打**类型标签**（必须改 / 建议改 / 疑问）；
- 已批注块显示琥珀色左边框 + 计数角标；底部粘性栏显示总数，并可展开「批注清单」悬浮面板（**可拖动位置、可调整大小**、单条移除、一键清空），点击跳转定位；
- 点「发送全部批注到对话框」→ 当前会话输入框草稿写入结构化指令（按类型分组：文件路径 + 行号 + 原文引用 + 批注），回车即可发送给模型；
- **设置页集成**：侧边栏「设置 → 侧边卡片」中可整体开关本预览器，并可配置「发送后自动清空批注」「发送内容前缀」；
- 文件被重新生成时，按「块序号 + 原文」重匹配批注，失配项标注「原文已变化」，仍可按引文定位发送。

## 依赖

- DSH web profile；
- 已挂载 `dsh-better-sidebar`（本插件通过其 `ctx.betterSidebar` 服务注册 viewer）。未挂载时本插件行将一直等待服务而不会激活。

## 安装

前置：Node ≥ 20、pnpm ≥ 10，`dsh web` 可正常运行。

```sh
# 1. 打包（在包目录内）
pnpm pack         # 产出 dsh-md-annotator-<version>.tgz

# 2. 放入 profile 的 vendor 目录
cp dsh-md-annotator-<version>.tgz ~/.dsh/profiles/web/vendor/

# 3. 安装并自动挂载（官方 CLI 会协调 dsh.profile.bundles）
dsh plugin --profile web add file:vendor/dsh-md-annotator-<version>.tgz

# 4. 重启 dsh web，然后硬刷新浏览器（Cmd/Ctrl+Shift+R）
```

## 更新

改完代码后：`pnpm pack` → 覆盖 `~/.dsh/profiles/web/vendor/` 下的 tgz（或放新版本号）→ 重新执行 `dsh plugin --profile web add file:vendor/...` → 重启 `dsh web` + 硬刷新。

## 卸载 / 停用

- 临时停用：侧边栏「设置页 → 侧边卡片」中关闭 `md-annotator` 条目，内置 Markdown 预览立即恢复；
- 完全卸载：`dsh plugin --profile web remove dsh-md-annotator`（bundle 协调会自动移除层栈条目）→ 重启 `dsh web`。

## 说明与限制

- 批注保存在浏览器内存中：切换 Tab / 会话不丢失，但重启 DSH 或停用插件后清空；
- 插件运行期间会接管 `.md` 文件的侧边栏预览（内置预览的编辑模式不可用），停用后自动恢复；
- 无构建链：`lib/client.js` 为手写的 `__ModuleLoader__.load` factory 格式，由 `/plugins/dsh-md-annotator/client.js` 直接下发；`lib/index.js` 为 no-op 宿主半（功能纯客户端）。
