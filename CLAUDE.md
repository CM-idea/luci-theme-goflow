# CLAUDE.md — 项目状态与交接文档

当在任意设备上打开此仓库时，Claude Code 会自动加载此文件。请随项目进展更新此文件。

## 项目简介

`luci-theme-goflow` — 一个现代化、可折叠**左侧边栏**的 OpenWrt LuCI 主题，支持自动/暗色/亮色三种模式，设计灵感来自 Keenetic 路由器 UI 的简洁风格。仓库：<https://github.com/dursuntokgoz/luci-theme-gokce>。

设计始于一个独立 HTML/CSS/JS 原型（位于 `demo/`），随后转化为真实的 LuCI 主题包。demo 保持同步，作为无需路由器的展示，同时也是 README 截图的来源。

## 来之不易的经验（不要重复踩坑）

- **目标平台：OpenWrt 25.12**（已验证真实存在；截至 2026-07 最新点版本为 25.12.5）。同样能在 `SNAPSHOT` 上构建。如有需要，存在 `openwrt-24.10` / `openwrt-23.05` 分支以支持更广泛的兼容性。
- **LuCI 现已基于 ucode，不再是 Lua。** 没有 `luasrc/`。模板为 ucode `.ut` 文件（`{% %}` 控制、`{{ }}` 输出、`{# #}` 注释），安装到 `/usr/share/ucode/luci/`。`htdocs/` → `/www/`，`root/` → `/`。
- **主题注册由 `root/etc/uci-defaults/30_luci-theme-goflow` 完成**，将 `luci.themes.Goflow* = /luci-static/goflow*` 写入 `/etc/config/luci`。不存在 postinst 主题扫描器。三个入口：`Goflow`（Auto，跟随系统暗色/亮色）、`GoflowDark`、`GoflowLight`。
- **包必须位于子目录中**（`luci-theme-goflow/`），不能放在仓库根目录。`gh-action-sdk` 通过 `src-link` 将整个仓库链接为一个 feed，而 OpenWrt 的 feed 扫描器只能找到 feed 根目录下一级的包。仓库根目录的 Makefile 是不可见的 → "no rule to make target package/luci-theme-goflow/download"。
- **使用 `openwrt/gh-action-sdk@v11`**（不要用 `@v1` — 它固定了一个古老提交，其入口点期望 `/home/build/openwrt/`，而当前 SDK 镜像没有此路径；每次构建都会因 `cd: /home/build/openwrt/: No such file` 而失败）。
- **包为 `arch=all`**（`LUCI_PKGARCH:=all`；无编译代码）。因此每个矩阵组合都会产生字节完全相同的包且文件名相同 → 将它们全部上传到 Release 会导致资源名冲突，只有一个能存活。Release 任务发布**一个**规范构建（`openwrt-25.12/aarch64_generic`），重命名为 `luci-theme-goflow-<tag>.apk`。CI 矩阵已精简为仅该组合（原为 6：{x86_64, aarch64_generic, arm_cortex-a7} × {openwrt-25.12, SNAPSHOT}），因为完整矩阵对字节相同的输出白白增加了 CI 时间。
- **登录界面需要主题本地支持。** `sysauth.ut` 的 `ui.instantiateView('goflow.sysauth')` 需要 `htdocs/.../view/goflow/sysauth.js`（bootstrap 主题的副本 — 它随每个主题分发，不在 luci-base 中）。登录表单在 `ui.showModal(..., 'login')` 内渲染，因此 `cascade.css` **必须**有 `.modal` / `#modal_overlay` 样式 — 这些也覆盖 LuCI 所有其他对话框（保存并应用、上传、确认）。这两者最初缺失，若未同时安装 luci-theme-bootstrap 则会导致登录在任何设备上崩溃。
- **换行符：** `.gitattributes` 强制 `eol=lf`（SVG/PNG 为二进制）。`uci-defaults` shell 脚本若含 CRLF 会在 busybox ash 下崩溃。

## 仓库结构

```
luci-theme-goflow/                  # 实际 OpenWrt 包（feed 子目录）
├── Makefile                        # LUCI_TITLE, +luci-base, LUCI_PKGARCH:=all, postrm 清理
├── root/etc/uci-defaults/30_luci-theme-goflow    # 注册 3 个主题入口
├── ucode/template/themes/goflow/   # header.ut, footer.ut, sysauth.ut
└── htdocs/luci-static/
    ├── goflow/                     # cascade.css（完整主题）+ logo.svg
    ├── goflow-dark/  goflow-light/ # 单行 @import ../goflow/cascade.css
    └── resources/
        ├── menu-goflow.js          # 侧边栏渲染器 + toggle/theme/accordion JS
        └── view/goflow/sysauth.js  # 登录模态视图（随主题分发，不在 luci-base）
demo/                               # 独立 HTML 原型（模拟主题效果）
│   ├── index.html                  #   仪表盘（卡片 + 实时流量图）
│   ├── settings.html               #   配置子页（CBI 表单：标签/行/表格/页面操作）
│   ├── login.html                  #   登录弹窗
│   ├── css/style.css               #   demo 专用样式表（--c-* 令牌；含 CBI/modal）
│   └── js/script.js                #   侧边栏/主题/手风琴/标签 + 图表（全守卫）
docs/                               # README 截图：仪表盘、设置、登录（亮色+暗色）
.github/workflows/build.yml         # CI：构建矩阵 + 标签触发 Release
```

## 架构说明

- **侧边栏**在运行时由 `menu-goflow.js` 从 LuCI 真实动态管理菜单树（`ui.menu.load()`）构建，而非硬编码列表。它渲染**两级**：顶层分区变为手风琴分组（一次只展开一个，活跃分区预展开），包含其二级页面；三级及以上保留在 `#tabmenu` 横向标签栏（与 bootstrap 下拉导航深度相同）。叶子节点（如注销）保持为纯链接。`renderModeMenu`/`renderTabMenu` 完全保留上游 `menu-bootstrap.js` 代码；仅 `renderMainMenu` 替换为 `renderSidebarMenu`。
- **图标**为 `header.ut` 中的内联 SVG 符号（无 FontAwesome/CDN — 必须在路由器离线环境下工作）。侧边栏图标通过顶层菜单节点名查找（`status/system/network/services/vpn/firewall`），其他显示通用圆点图标。
- **暗色模式：** `header.ut` 在 CSS 加载前设置 `<html>` 的 `data-darkmode`（无 FOUC）。`Goflow`/Auto 读取系统偏好 + 通过头部太阳/月亮按钮切换的 `localStorage` 覆盖值；`GoflowDark`/`GoflowLight` 强制指定。`cascade.css` 通过 `:root` 和 `:root[data-darkmode="true"]` 下的 CSS 自定义属性驱动一切。
- **`cascade.css` 中的 CBI 样式**针对 LuCI 真实生成的类名（已与上游验证，不要猜测）：`.cbi-value`（flex 行，200px 标题 + 弹性字段）、`.table/.tr/.td`（经典 `display:table`，非 grid/flex）、`.cbi-dropdown`（自定义 `<ul>` 小部件，通过 `[open]` 属性打开）、`.cbi-page-actions`（非 sticky）、`.tabs/.cbi-tabmenu`、`.alert-message`、`.spinning`（SVG 动画，非 CSS 关键帧）、自定义 checkbox/radio。

## 环境 / 新设备恢复指南

- 克隆仓库；在新设备上打开 Claude Code 会自动加载此文件。
- **本仓库的 git 身份：** `user.name=dursuntokgoz`、`user.email=dursuntokgoz@users.noreply.github.com`（按仓库本地设置）。
- **GitHub CLI (`gh`)** 用于检查 CI。Windows 下位于 `/c/Program Files/GitHub CLI` — 每次 Bash 调用前添加到 PATH：`export PATH="/c/Program Files/GitHub CLI:$PATH"`。通过 `gh auth login --web -h github.com` 认证（设备流程；用户在浏览器中完成）。如果 `gh` 调用运行中返回 "Bad credentials"，通常是暂时性的密钥环读取 — 重新运行即可。`git push` 偶尔在此处返回 "Empty reply from server"；重试即可。
- **截图**使用无头 Edge：`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=1600,1000 --hide-scrollbars --screenshot=OUT URL`。demo 接受 `?theme=dark|light` 参数以强制指定模式，实现可重现的截图。

## CI / Release 流程

- `.github/workflows/build.yml`：push/PR/手动触发时，构建**一个**组合（`aarch64_generic` / `openwrt-25.12` — 匹配 BPI-R4 测试设备）并上传为 artifact。包是架构无关的，因此一个构建即可完全验证。
- **发布：** 推送 `v*` 标签。`release` 任务（由 `refs/tags/v` 守卫）下载规范构建的 artifact，重命名为 `luci-theme-goflow-<tag>.apk`，并附加到 GitHub Release。发布方式：`git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`。

## 提交历史

1. `ba2f43e` 初始主题包 + demo + CI
2. `db56850` ci: gh-action-sdk @v1 → @v11
3. `c512f54` fix: 包嵌套至 luci-theme-gokce/ 下 (+ ARM 矩阵)
4. `7cfecdc` ci: 仅发布规范构建产物
5. `8e88b03` feat: 侧边栏手风琴子菜单; PKGARCH; 标签命名资源
6. `06dc577` docs: demo 模拟 LuCI; README 截图
7. `e501691` fix: 独立登录界面 (view JS + modal CSS)

`v1.0.0` 标签存在（在开发中期创建，用于测试 release 任务）。

## 当前状态与下一步

- `main` 分支所有 6 个 CI 构建组合全部**通过**。主题功能完整，可进行首次正式发布：侧边栏+手风琴、3 个主题 + 头部切换、完整 CBI 重设计、登录/modal 工作正常、ARM/x86 构建。
- **尚未完成：在真实 OpenWrt 25.12 设备/VM 上实机测试。** 所有 CBI 页面、`.cbi-dropdown` 小部件、div 表格和登录弹窗的 CSS 都是根据上游选择器结构编写的，仅通过静态截图验证 — 从未在真实运行的 LuCI 页面上见过。这是发布 v1.1.0 之前的**首要剩余任务**。
- **然后：发布 `v1.1.0`**（侧边栏手风琴 + 登录修复 + modal 支持）— 待实机测试通过后。如有需要，可将 demo 截图替换为真实的 LuCI 内截图。
- 后续可能的改进：三级导航嵌套侧边栏；更丰富的图标集；提交到 `openwrt/luci` 的 `themes/` 上游。

## 已知限制

- 侧边栏显示 2 级菜单；3 级导航保留为横向标签栏。
- 图标集仅涵盖知名分区；其他 `luci-app-*` 显示为圆点。

## 致谢

- 原作者 **Dursun Tokgoz** 创作了 Gökçe 主题：[luci-theme-gokce](https://github.com/dursuntokgoz/luci-theme-gokce)
- 登录页面设计参考自 **eamonxg** 的 [luci-theme-outline](https://github.com/eamonxg/luci-theme-outline)（Copyright 2025 eamonxg）
- `luci-theme-bootstrap`：LuCI Team（Apache-2.0）
