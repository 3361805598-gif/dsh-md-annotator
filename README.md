# dsh-md-annotator

在 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的 Markdown 预览中**逐项批注**，并把全部批注一键整理成结构化修改指令写入聊天对话框，以便对产出内容进行精准修改。

## 功能

- 在侧边栏直接切换「预览」与「源码编辑」模式；源码编辑支持 Cmd/Ctrl+S 或宿主保存按钮写回原 Markdown 文件，并与现有批注预览、better-sidebar 合并工具栏兼容；

- 打开任意 `.md` 文件（侧边栏预览）时，把文档解析为块：标题、段落、列表项（逐项）、表格、代码块、引用、水平线；
- 悬停任意块 / 列表项 → 「＋批注」→ 内联填写修改意见（支持增/改/删，一处可多条），并可给批注打**类型标签**（必须改 / 建议改 / 疑问）；
- **选中任意文字批注**：在预览里拖选不限字数的文字（需在同一个段落/列表项内）→ 浮出「＋批注选区」→ 填写意见；被选中的文字会持续高亮（CSS Custom Highlight API），批注引用精确到选中的字句而非整块；
- 已批注块显示琥珀色左边框 + 计数角标；底部固定栏显示总数（**可点手柄 `﹀` 收起 / `︿` 展开**），并可展开「批注清单」悬浮面板（**可拖动位置（可拖出侧边栏到页面任意位置）、可调整大小**、单条移除、一键清空），点击跳转定位；
- 点「全部发送」→ 当前会话输入框草稿写入结构化指令（按类型分组：文件路径 + 行号 + 原文引用 + 批注），回车即可发送给模型；清单内可逐条发送或勾选后批量发送；
- **设置页集成**：侧边栏「设置 → 侧边卡片」中可整体开关本预览器，并可配置「发送后自动清空批注」（**默认开启**）与「发送内容前缀」；
- 文件被重新生成时，按「块序号 + 原文」重匹配批注，失配项标注「原文已变化」，仍可按引文定位发送。

## 依赖

- DSH web profile；
- 已挂载 `dsh-better-sidebar`（本插件通过其 `ctx.betterSidebar` 服务注册 viewer）。未挂载时本插件行将一直等待服务而不会激活。

## 安装

前置：Node ≥ 20、pnpm ≥ 10，`dsh web` 可正常运行。

```sh
# 1. 打包（在包目录内；prepack 会自动重新拼接 lib/client.js，产物落到 dist/）
pnpm pack         # 产出 dist/dsh-md-annotator-<version>.tgz

# 2. 放入 profile 的 vendor 目录
cp dist/dsh-md-annotator-<version>.tgz ~/.dsh/profiles/web/vendor/

# 3. 安装并自动挂载（官方 CLI 会协调 dsh.profile.bundles）
dsh plugin --profile web add file:vendor/dsh-md-annotator-<version>.tgz

# 4. 重启 dsh web，然后硬刷新浏览器（Cmd/Ctrl+Shift+R）
```

## 更新

改完代码后：`pnpm pack` → 覆盖 `~/.dsh/profiles/web/vendor/` 下的 tgz（或放新版本号）→ 重新执行 `dsh plugin --profile web add file:vendor/...` → 重启 `dsh web` + 硬刷新。

## 开发与测试

源码按职责拆在 `lib/src/`（styles / store / parser / selection / panel / viewer / entry），由零依赖拼接脚本 `scripts/bundle.mjs` 合并为单文件 `lib/client.js`（仍为无打包器、直发的 `__ModuleLoader__` factory 形式）。修改源码后需重新拼接：

```sh
node scripts/bundle.mjs   # 重新生成 lib/client.js（pnpm pack 会经 prepack 自动执行）
node test/smoke.mjs       # 工厂物化 + 块解析冒烟
node test/unit.mjs        # 纯函数单测（解析器 / 内联渲染 / ref 编解码 / 重锚定 / 报告 / 存储有界）
npm test                  # 依次跑上面两个测试
```

## 卸载 / 停用

- 临时停用：侧边栏「设置页 → 侧边卡片」中关闭 `md-annotator` 条目，内置 Markdown 预览立即恢复；
- 完全卸载：`dsh plugin --profile web remove dsh-md-annotator`（bundle 协调会自动移除层栈条目）→ 重启 `dsh web`。

## 说明与限制

- 批注保存在浏览器内存中：切换 Tab / 会话不丢失，但重启 DSH 或停用插件后清空；清单面板与底部栏提供「导出」按钮，可把当前文件全部批注下载为 JSON 备份（localStorage 持久化与拖拽排序为后续演进方向）；
- 插件运行期间会接管 `.md` 文件的侧边栏预览（内置预览的编辑模式不可用），停用后自动恢复；
- UI 为全中文，无 i18n 层（个人插件定位）；
- 内联 Markdown 解析器为 **CommonMark 子集**：支持 ATX 标题、段落、列表（逐项）、表格、代码围栏、引用、水平线，以及 `` `code` `` / `**粗体**` / `*斜体*` / `~~删除线~~` / `[文本](链接)` 内联语法；**不支持** setext 标题、嵌套列表（缩进子项按续行拍平）、内联 HTML、列表项内代码围栏/引用、表格单元格转义管道符；
- 批注引用为**版本化 + 内容/邻接上下文签名**的 `v1:…` 格式，文件重生成后按「原文 + 上下文签名」重锚定，同名块不会静默错挂；失配项标注「原文已变化」；
- 无构建链：`lib/client.js` 为 `scripts/bundle.mjs` 从 `lib/src/*.js` 拼接出的 `__ModuleLoader__.load` factory 格式，由 `/plugins/dsh-md-annotator/client.js` 直接下发；`lib/index.js` 为 no-op 宿主半（功能纯客户端）。
