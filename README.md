# dsh-md-annotator

面向 DeepSeek Harness Web UI 的 Markdown 批注插件。通过 The Better Sidebar 打开 `.md` / `.markdown` 文件后，可进行 Markdown 预览、块级批注、选区批注、源码编辑、保存和批注报告整理。0.9.0 起重新接入 `dsh-better-sidebar`，由其负责文件路由与面板承载。

## 功能

- 通过 The Better Sidebar 打开 Markdown 文件，切换「预览」与「源码」模式；源码支持 Cmd/Ctrl+S 保存；
- 解析标题、段落、列表项（逐项）、表格、代码块、引用和水平线；支持常用内联 Markdown；
- 悬停块或列表项后添加批注，也可以在同一段落或列表项内选中文字添加选区批注；批注支持「必须改 / 建议改 / 疑问」类型；
- 批注以右侧卡片显示，按原文位置排列并自动避让；橙色虚线从被批注的文字或段落连接到对应卡片，悬停时加粗；支持原文引用、复制、编辑、删除及单条写入草稿。保留批注高亮、计数和可拖动的批注清单，支持清空和 JSON 导出；
- 批注栏与正文一起滚动，侧栏宽度变化时重新排列；窄侧栏可横向滚动，也可使用官方分栏放大或全屏查看；
- 将全部、所选或单条批注整理为结构化报告，写入该文件所属会话的输入框草稿，不自动发送；
- 独立设置「增强预览」「写入草稿后清空批注」和「报告前缀」；设置保存在本插件自己的版本化 localStorage 空间；
- 文件重新生成后按块内容与邻接上下文重定位批注，失配项标记为「原文已变化」；
- 同一会话和文件的多个视图共享文档草稿、版本和批注；不同会话隔离。

## 依赖与兼容

- DSH Web profile；
- `dsh-better-sidebar >=0.19.1 <0.20.0`，以及 DSH `0.1.5-rc.1+`；旧 alpha 环境需先升级；
- Node.js ≥ 20，pnpm ≥ 10（仅用于源码构建、测试和打包）；
- 通过 `ctx.betterSidebar.registerFileViewer` 注册 Markdown 预览器，优先级 20；右侧栏与底部工作台共用；
- Better Sidebar 声明为 optional peer，避免重复实例；客户端通过 inject 等待其服务，未安装或被禁用时不激活预览器。

## 安装

前置：已安装可正常运行的 DSH Web profile 和上述兼容版本的 The Better Sidebar。

### 从本地 tgz 安装

仓库当前不提供已发布下载地址。先在项目目录打包，再把生成的 tgz 放入 Web profile 的 `vendor` 目录：

```sh
cd dsh-md-annotator
pnpm run pack
mkdir -p ~/.dsh/profiles/web/vendor
cp dist/dsh-md-annotator-<version>.tgz ~/.dsh/profiles/web/vendor/
dsh plugin --profile web add file:vendor/dsh-md-annotator-<version>.tgz
```

安装后重启 `dsh web`，并在浏览器中硬刷新（Cmd/Ctrl+Shift+R）。安装时应使用与实际文件名一致的版本号；本 README 不预设下载链接或校验值。

### 更新

修改代码后重新执行 `pnpm run pack`，将新的 tgz 放入 `~/.dsh/profiles/web/vendor/`，再次执行 `dsh plugin --profile web add file:vendor/dsh-md-annotator-<version>.tgz`，然后重启 `dsh web` 并硬刷新浏览器。

## 开发、测试与打包

源码位于 `lib/src/`，由 `scripts/bundle.mjs` 拼接为 `lib/client.js`。在插件目录执行：

```sh
pnpm install
pnpm build       # 重新生成 lib/client.js
pnpm test        # 运行 smoke、unit、integration、host 测试
pnpm run pack        # prepack 自动构建，产出 dist/dsh-md-annotator-<version>.tgz
```

也可以分别运行：

```sh
node test/smoke.mjs
node test/unit.mjs
```

测试覆盖模块物化、解析、内联渲染、引用编解码、批注重锚定、报告和有界存储等行为；真实 DSH 浏览器集成仍应在目标版本的独立测试 profile 中验收。

## 保存、冲突和生命周期限制

- 单文件完整读取上限为 **2 MiB**。超限文件不会以截断内容进入可保存编辑器；
- 保存使用官方文件版本条件。外部修改导致版本冲突时保留本地源码草稿并提示处理，不自动覆盖；
- 文件草稿、批注和视图状态保存在本次插件运行期内；刷新、重启 DSH 或停用插件前应先保存源码并导出批注 JSON；
- 本插件不提供批注持久化、JSON 导入、富文本编辑、完整 GFM 或自动发送；
- 卸载时撤销 viewer 注册，重新打开文件后由 Better Sidebar 内置预览接管；
- 每 3 秒检查文件版本，保护未保存草稿；未保存标记显示在编辑器内；
- 停用或卸载：

```sh
dsh plugin --profile web remove dsh-md-annotator
```

## 解析与引用说明

内联解析器为 CommonMark 子集，支持 ATX 标题、段落、列表、表格、代码围栏、引用、水平线，以及 `` `code` ``、`**粗体**`、`*斜体*`、`~~删除线~~` 和 `[文本](链接)`。不支持 setext 标题、嵌套列表、内联 HTML、列表项内代码围栏或引用、表格单元格转义管道符。

批注引用采用版本化 `v1:…` 格式，包含内容和邻接上下文签名。文件重新生成后按原文与上下文重锚定，同名块不会静默错挂；无法匹配时保留批注并标记「原文已变化」。
