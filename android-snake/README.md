# 贪吃蛇（荣耀平板 / Android）

一个离线运行的中文贪吃蛇游戏：Java 写的极薄 WebView 外壳 + `app/src/main/assets/` 里的 HTML5 Canvas 游戏。
不联网、不申请网络权限，APK 由 GitHub Actions 云端构建。

- 应用名：贪吃蛇　包名：`com.abffweh.snake`
- minSdk 26（Android 8.0）/ targetSdk 34，AGP 8.5.2，Gradle 8.9，JDK 17
- 唯一申请的权限：`VIBRATE`（震动反馈）

---

## 一、下载 APK

1. 打开 GitHub 仓库页面 → 顶部 **Actions** 标签页。
2. 左侧选择 **Build APK** 工作流，点开最新一次（绿色 ✓）的运行记录。
3. 页面最下方 **Artifacts** 区域，点击 **snake-debug-apk** 下载（需要登录 GitHub）。
4. 得到的是一个 zip 压缩包，**解压**后里面是 `snake-<提交号>-debug.apk`。

说明：
- Artifact 保留 30 天，过期后可在 Actions → Build APK → **Run workflow** 手动重新构建一次。
- 每次运行的 **Summary** 页面会列出 APK 大小、SHA-256、权限和签名指纹，可用来核对下载的文件。

## 二、在荣耀 MagicOS 上安装

1. 把 apk 传到平板（数据线、蓝牙、荣耀分享、网盘均可），用 **文件管理** 找到它并点击安装。
2. 如果提示"纯净模式已开启，无法安装"或类似拦截：
   进入 **设置 → 安全**，关闭 **纯净模式**；或在提示框里选择 **允许安装外部来源应用**（授权给文件管理）。
   不同 MagicOS 版本的菜单位置可能不同，找不到时可以在设置顶部搜索"纯净模式"或"外部来源"。
3. 安装时可能出现"未经应用市场检测"的风险提示，确认来源是你自己的仓库后选择继续安装。
4. 装完后建议把纯净模式重新打开（不影响已安装的应用）。

## 三、关于签名（务必阅读）

- 这个 APK 使用的是 **debug 签名**，**只适合个人自用，不能上架任何应用市场**。
- 为了让以后新构建的版本可以**直接覆盖安装、保留本地最高分和排行榜**，仓库里固定了一份 debug 密钥
  `keystore/debug.keystore`（Android 通用的公开口令 `android`）。CI 会校验每个 APK 的签名证书指纹都是：
  `8b0b824fb7eedd108b5ca40090811663f0bcebf2dcbcd459f25ae524126a2759`（SHA-256）。
  如果不固定，CI 每次都会在全新机器上生成新的 debug 密钥，每个版本签名都不同，每次更新都得先卸载。
- 这份密钥是公开的：任何能看到仓库的人都能用它签一个"同签名"的 APK。只从你自己仓库的 Actions 下载安装即可。
- **以后如果换成正式签名（release 密钥），系统会认为签名冲突，必须先卸载旧版**再安装（本地记录会随之清空）。

---

## 四、游戏功能

| 类别 | 内容 |
| --- | --- |
| 模式 | **经典**（可选穿墙、慢/中/快三档速度）· **闯关**（6 关，各有障碍布局，达到目标长度过关，自动记录已解锁关卡）· **演示**（AI 自动玩） |
| 操作 | 滑动屏幕（滑动中可连续转弯）· 屏幕方向键（设置里可关）· 实体键盘方向键 / WASD · 空格或 P 暂停 · Esc 返回 |
| 道具 | 加速、减速、双倍分数、短暂穿墙：随机刷新、7 秒后消失；拾取后 HUD 显示剩余秒数和进度条，暂停时计时冻结 |
| 反馈 | 吃食物粒子 + 飘字，死亡屏幕震动 + 手机震动；音效用 WebAudio 实时合成（无音频文件）；音效、震动都可在设置里关 |
| 数据 | 各模式最高分、本地排行榜前 10（含日期）、设置、已解锁关卡都存在 localStorage；所有读写有 try/catch，存储不可用时退回内存照常运行 |
| 界面 | 开始菜单、经典选项、关卡选择、设置、排行榜、暂停层、过关层、结束层；适配 16:10 横竖屏；浅色 / 深色 / 跟随系统主题 |

**闯关关卡**：初出茅庐（空地）→ 四方石柱 → 城门（四面城墙，从城门穿到对面）→ 十字路口 → 回廊 → 迷宫，目标长度 8～18。
关卡按"长边 × 短边"定义，竖屏时自动转置，横竖屏布局一致。

**旋转屏幕**：Activity 不会重建，正在进行的一局保持原棋盘尺寸并自动暂停、重新适配大小；新开一局会按当前方向选择
横向（26×16）或竖向（16×26）棋盘。

**返回键**：游戏中按一次 → 暂停；已暂停时再按一次 → 退出应用；子菜单里按 → 回主菜单；主菜单按 → 退出。
切到后台（onPause）会自动暂停，回到前台保持暂停，由玩家点"继续"。

### 演示模式 AI

每个 tick 决策一次：

1. 用 BFS 找去食物的最短路，**虚拟地沿路走过去把食物吃掉**，再检查新蛇头还能不能走到自己的尾巴——能才走这条路；
2. 否则选一个走完一步后仍能到达尾巴、且离尾巴最远的方向（绕远路追尾巴，等食物变得安全）；
3. 都不行就选可活动空间最大的方向。

BFS 是"时间感知"的：蛇身第 i 节要过 `长度 - i` 步才会让出格子，走到那里的步数够了就当作可通行。
AI 只按关卡本身是否可穿墙来规划，不依赖会过期的穿墙道具。

---

## 五、目录结构

```
android-snake/
├── app/
│   ├── build.gradle                    # AGP 配置（无任何第三方依赖）
│   └── src/main/
│       ├── AndroidManifest.xml         # 只有 VIBRATE 权限；configChanges 防旋转重建
│       ├── java/com/abffweh/snake/MainActivity.java   # WebView 外壳
│       ├── res/                        # 主题、矢量自适应图标
│       └── assets/                     # 离线网页游戏（<script src> 相对路径引用，同目录）
│           ├── index.html
│           ├── css/style.css
│           └── js/
│               ├── core.js     # 纯逻辑：状态、移动、碰撞、输入队列、道具计时、插值
│               ├── levels.js   # 纯逻辑：关卡布局、出生点、过关与解锁
│               ├── ai.js       # 纯逻辑：演示模式 AI
│               ├── storage.js  # 纯逻辑：设置/最高分/排行榜（注入式存储后端）
│               ├── audio.js    # WebAudio 合成音效
│               ├── render.js   # Canvas 渲染与特效
│               └── game.js     # 界面、输入、主循环、安卓桥接
├── keystore/debug.keystore             # 固定的 debug 签名（见第三节）
├── tests/
│   ├── unit/   # node --test：逻辑模块单元测试
│   └── e2e/    # Playwright：1280×800 与 800×1280 两种视口
├── package.json / package-lock.json    # 只有测试用的 playwright（版本写死）
└── README.md
```

外壳与网页的接口：

| 方向 | 接口 | 作用 |
| --- | --- | --- |
| 网页 → 外壳 | `Android.vibrate(ms)` | 震动（1～1000ms）。普通浏览器里没有 `window.Android`，调用自动变成空操作 |
| 网页 → 外壳 | `Android.isSystemDark()` | 主题选"跟随系统"时读取系统深色模式 |
| 外壳 → 网页 | `SnakeApp.handleBack()` | 返回键；返回 `false` 时外壳退出应用 |
| 外壳 → 网页 | `SnakeApp.onAppPause()` / `onAppResume()` | 生命周期通知 |
| 外壳 → 网页 | `SnakeApp.onSystemThemeChanged(dark)` | 系统深色模式切换 |

WebView 设置：开启 JavaScript 与 DOM Storage；关闭文件访问、内容访问、file URL 跨域访问、地理位置、多窗口、缩放；
只允许停留在 `file:///android_asset/` 内，外部链接一律拦截；渲染进程崩溃时重建页面而不是闪退。

---

## 六、本地开发与测试

本地没有 Android SDK 也能开发网页部分：直接用浏览器打开 `app/src/main/assets/index.html` 即可试玩。

```bash
cd android-snake
npm test                 # 单元测试（node --test，无需安装依赖）
npm ci                   # 安装写死版本的 playwright
npx playwright install chromium   # 首次运行需要（已有浏览器的环境可跳过）
npm run test:e2e         # 端到端测试；SCREENSHOT_DIR=目录 可指定截图保存位置
```

单元测试覆盖：撞墙/撞自己、穿墙、追尾判定、防掉头输入队列、吃食物、道具刷新/消失/计时/效果、关卡布局连通性与
出生点安全、关卡切换与解锁、存储容错（损坏数据/存储不可用）、排行榜排序与截断、蛇身插值，以及 AI 存活率
（100 局随机对局 + 100 个随机中局局面，测试会打印存活率）。

端到端测试为了不受测试机卡顿影响，开局确认实时循环在跑之后，会切换到"手动推进 tick"的调试时钟：
输入仍然是真实的键盘事件 / CDP 触摸事件，只是每个 tick 由测试推进。另有专门的用例在实时模式下测帧率。

### 云端构建（`.github/workflows/build-apk.yml`）

推送 `android-snake/**` 或工作流文件本身时触发，也可在 Actions 页面手动运行。两个并行任务：

- **单元测试 + 构建 APK**：checkout → setup-node → `npm test` → setup-java 17 → setup-gradle（Gradle 8.9，不提交 wrapper jar）
  → `gradle assembleDebug` → 用 `aapt2` / `apksigner` 校验包名、SDK、权限只有 VIBRATE、index.html 引用的资源都已打包、
  资源里没有外部 URL、签名指纹不变 → 上传 APK。
- **端到端测试**：安装 Chromium，跑 Playwright，上传截图（Artifacts → e2e-screenshots）。

所有 Action 和依赖都写死版本号。

---

## 七、已知限制

- **尚未在真机上验证**：WebView 中 `file:///android_asset` 下的 localStorage 持久化、震动、沉浸式全屏、返回键、
  音频解锁、MagicOS 安装流程等都只在 CI 构建与桌面 Chromium 中验证过，没有在荣耀平板上实际运行过。
- 进行中的一局在旋转后保持原棋盘尺寸（横屏的局转到竖屏时棋盘会变小），不会重新排布。
- AI 在棋盘接近填满时可能一直安全地追尾巴、不敢吃最后几个食物；演示模式长时间吃不到会自动重开一局。
  AI 在"迷宫"等障碍多的布局里吃得较慢。
- 音效依赖系统 WebView 的 WebAudio；第一次触摸屏幕或按键之前不会发声（自动播放策略）。
- debug 签名，不能上架（见第三节）。
