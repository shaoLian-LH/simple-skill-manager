# 2026-04-06 Web UI Facade Rebuild Design

Status: Approved for planning

## 1. 壳层与视觉基调

### 1.1 Visual Thesis

Web UI 采用“暖调编辑台”方向：它更像一张正在被整理和编排的工作桌面，而不是冷冰冰的管理后台。整体气质偏纸面、木质、奶油白与墨色排版，层级主要依靠版式、留白、字重、细分隔和局部底色建立，不依赖满屏卡片。

### 1.2 Content Plan

应用首屏不做 hero，而是直接进入工作区。整体结构维持为：

- 左侧导航
- 中央主舞台
- 右上 quick actions 触发器
- 左下或底部的 launch status

用户打开 `skm ui` 后应该立即进入“可操作状态”，而不是先浏览介绍内容。

### 1.3 Interaction Thesis

交互动效保持克制，但必须能改善层级感和操作反馈：

- 应用首次进入时，导航与主内容做短促的分层淡入
- 路由切换时，页面标题和主体内容做轻微纵向滑入，避免硬切
- mutation 成功后，不依赖夸张 toast，而是让受影响区域和结果摘要出现一次很短的高亮脉冲

技术上采用 `Vue 3 + TypeScript + Vite + Vue Router + Tailwind CSS + Motion`，其中 `Motion` 负责路由和状态过渡，`animate.css` 只承担少量入场预设，不作为全局动效主系统。

### 1.4 应用壳层

左侧不是厚重的后台 sidebar，而是较细的目录栏：

- 上半部分放 `Dashboard`、`Projects`、`Presets`、`Global Config`
- 下半部分放极简 `Launch Status`

中央主舞台承载当前页面的核心工作区，布局偏开放画布感，不做死板的盒中盒。每个页面只保留一个最强视觉重点，避免多个区域同时争夺注意力。

右上角提供 `Quick Actions` 触发器。展开后显示当前上下文动作和对应 CLI 命令，但这层是“说明层”，不是执行主路径。页面顶部不放传统大导航栏，只保留一条较轻的 route header：页面标题、单行上下文描述，以及必要时的次级动作。

整体避免卡片瀑布流。核心结构语言是：

- 大段留白
- 细边分隔
- 局部柔和底色面
- 尽量少的边框和阴影

### 1.5 入口与默认落点

`skm ui` 启动时，服务端需要先根据启动时的 `pwd` 判断是否命中已跟踪项目：

- 命中已跟踪项目，则默认进入该项目的 `Project Detail`
- 未命中，则进入 `Dashboard`

这个“默认落点”应当由启动层或服务端输出为初始路由意图，而不是由前端自己根据浏览器地址猜测。

### 1.6 视觉语言

建议的基础视觉语言如下：

- 色板：`paper / sand / ink / olive-or-copper accent`
- 字体：标题使用有性格但克制的 serif，正文和数据使用清爽 sans
- 组件原则：默认无卡片；只有当容器本身就是交互对象时才允许使用卡片式包裹

目标是把 `skm ui` 做成一个有温度的“技能编排工作台”，同时仍然满足应用壳层的职责：导航、路由宿主、quick actions、launch status、统一加载态和错误态容器。

### References

- `.slfk/docs/tasks/2026-04-05-web-ui/T02-ui-facade-and-compat-layer.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T08-web-shell-and-routing.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T09-feature-pages.md`
- `.slfk/docs/plans/2026-04-05-web-ui-design.md`
- `src/ui/server/app.ts`
- `src/ui/server/assets.ts`
- `src/ui/facade/service.ts`
- `dist/ui/web/index.html`
- `dist/ui/web/assets/app.js`

## 2. 页面级构造：Dashboard、Projects、Project Detail

### 2.1 Dashboard

`Dashboard` 不做传统欢迎页，也不做图表化首页，而是一个“今日工作台”。首屏核心是一条横向概览带，展示 `projects / presets / skills` 三个总量，用更强的数字排版和一句解释性交代取代常见的 KPI 卡片组。

主体内容聚焦两块：

- `Recent Projects`
- `Quick Actions`

`Recent Projects` 应该更像一份精排清单而不是卡片墙。每条项目摘要突出：

- 项目名
- 路径尾段或项目标签
- targets
- 最近更新时间

点击后直接进入 `Project Detail`。这一页的职责不是承载复杂分析，而是帮助用户快速决定下一步去哪一个项目、哪一种操作。

### 2.2 Projects

`Projects` 是目录页，核心体验是快扫、快搜、快进。页面头部提供搜索输入和轻量筛选信息，主体是一列高信息密度的项目清单，而不是多列卡片列表。

每一行项目都应在扫描时直接暴露：

- 项目名
- 绝对路径
- targets
- 启用 preset 数
- 启用 skill 数
- 更新时间

主动作始终是“进入详情”。`quick-open` 只作为行尾次级动作存在，不夺取列表的主任务。桌面端可以在右侧补一个较轻的 preview rail，但不应削弱列表扫描效率。

### 2.3 Project Detail

`Project Detail` 是整个 Web UI 的主操作台，也是视觉和交互密度最高的页面。它采用“编辑台工作区”布局，而不是纵向长表单。

页面上方先给出一块 `Project Location` 面板，用于承载：

- 项目名
- 完整路径
- targets
- last updated
- quick-open

中部采用三层分工：

- 左侧 `Enabled Presets`
- 中部 `Enabled Skills`
- 右侧 `Resolved Outcome`

其中，`Enabled Presets` 与 `Enabled Skills` 是主编辑区，`Resolved Outcome` 是始终在场但不喧宾夺主的结果摘要层。

#### Enabled Presets

该面板展示工程已启用的 preset，并提供添加/移除入口。每个 preset 使用手风琴样式展开其 skill 合集，让用户看到“这个 preset 带来了什么”，而不是只看到名字。

这个面板应优先呈现：

- preset 名称
- 展开后的 skills 列表
- 移除动作
- 添加 preset 的入口

#### Enabled Skills

该面板负责直接启用的 skill。它支持搜索、添加、移除，并保持比 preset 面板更强的操作密度，因为 direct skill 更接近逐项精修。

这里必须和 `resolved skills` 明确区分：用户在这个区域看到的是“我直接开启的 skill”，而不是所有最终生效的 skill。

#### Resolved Outcome

右侧摘要栏持续展示最终生效的 skills，并带有 source labels。它不承担主编辑任务，而是承担“校对结果”的职责，帮助用户确认：

- 哪些 skill 最终生效
- 它们来自 `direct`、某个 `preset`，或两者叠加

这满足 `T09` 对 `resolved skills` 和 source labels 的要求，同时不破坏页面的主编辑节奏。

### 2.4 响应式策略

桌面端保留三段式编辑台体验。移动端时：

- `Project Location` 保持在最上方
- `Enabled Presets` 和 `Enabled Skills` 顺序下排
- `Resolved Outcome` 下沉为可折叠 review 区

这样移动端仍然保留信息完整性，但不会因为三栏硬挤而丧失可读性。

### References

- `.slfk/docs/tasks/2026-04-05-web-ui/T08-web-shell-and-routing.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T09-feature-pages.md`
- `src/ui/contracts/api.ts`
- `src/ui/facade/service.ts`
- `dist/ui/web/assets/app.js`
- `dist/ui/web/assets/view-model.js`

## 3. 次级页面与全局交互约定

### 3.1 Presets

`Presets` 是整个产品里最适合采用 split view 的页面。左侧承载 preset 清单，右侧承载编辑面板，让“浏览”和“编辑”同时成立，而不需要频繁全页跳转。

左侧清单不使用卡片墙，而采用更像编排清单的条目形式。每个条目至少暴露：

- preset 名称
- skill 数
- 引用项目数

右侧编辑面板在选中 preset 后直接展示其 skills、增删入口、保存动作和删除预警。新建 preset 时，右侧切换为 create 状态，并尽量复用 edit 的骨架。

删除 preset 不能只给一句通用确认，而应显式展示：

- `referenceCount`
- 受影响项目

这样才能让删除动作具备“影响面可见性”。

### 3.2 Global Config

`Global Config` 需要保持极度克制，不扩展为系统设置大全。页面主体只承载两类可编辑信息：

- `skillsDir`
- `defaultTargets`

`skillsDir` 应该以明显但不过度刺眼的 inline 校验方式展示错误。`defaultTargets` 使用有限集合的选择控件，而不是自由文本输入。

`config.json`、`presets.yaml`、`projects.json` 的路径属于只读环境信息，更适合放在表单下方作为“当前工作环境”说明，而不是与主表单争夺注意力。

### 3.3 Quick Actions

`Quick Actions` 作为全局常驻触发器放在右上角。展开后展示当前 route 可用动作，但其职责是说明与上下文提示，而不是替代主界面执行。

内容结构建议分成两层：

- 当前上下文可用动作说明
- 等价 CLI 命令展示

CLI 命令用于透明化能力来源，帮助熟悉 CLI 的用户建立映射，但不作为主执行按钮。这一原则需要与现有任务约束保持一致。

在 `Project Detail` 中，该面板还可以展示 `doctor`、`sync`、`quick-open` 等后端已提供的 quick actions。

### 3.4 加载态、错误态与成功反馈

加载态避免整页大 spinner，而采用更轻的 skeleton、shimmer 或局部占位。这样既能表达正在加载，也不会破坏编辑台气质。

错误态按层级展示：

- 页面级错误放在主舞台
- 字段级错误贴字段
- mutation 错误贴在对应面板顶部

成功反馈弱化为短 toast 加局部区域高亮，不做夸张的全局成功横幅。

对 `Project Detail` 来说，最重要的反馈不是 toast，而是 `Resolved Outcome` 在 mutation 后立即更新，让用户用结果变化确认操作生效。

### 3.5 前端工作模型

本次重建的前端工作模型可以概括为：

- 工作台页：直接进入操作面
- 配置页：单一焦点表单
- 资源页：左清单右编辑

视觉上像一本正在被编辑的项目手册，而不是标准后台系统。交互上依赖克制的过渡、持续可见的结果摘要，以及对危险操作更明确的影响提示。

### References

- `.slfk/docs/tasks/2026-04-05-web-ui/T03-api-contracts-and-error-protocol.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T08-web-shell-and-routing.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T09-feature-pages.md`
- `src/ui/contracts/api.ts`
- `src/ui/facade/service.ts`
- `src/ui/server/errors.ts`
- `dist/ui/web/assets/app.js`

## 4. 工程结构与运行模型

### 4.1 路由设计

前端保持清晰的 SPA 路由结构：

- `/dashboard`
- `/projects`
- `/projects/:projectId`
- `/presets`
- `/config`

其中 `/` 不作为真正内容页，而是“入口决策路由”。`skm ui` 启动时，服务端根据启动时的 `pwd` 判断默认落点，并通过轻量 boot payload 或初始接口将该结果提供给前端。

前端访问 `/` 时立刻重定向：

- 命中项目则跳到 `/projects/:projectId`
- 未命中则跳到 `/dashboard`

这样既保留 SPA 路由语义，也满足“根据启动目录决定入口”的产品要求。

### 4.2 为什么入口判断在服务端

`pwd` 是 CLI 启动上下文，不是浏览器天然知道的信息。“当前目录是否命中项目”本质上依赖后端可见的 `projects.json` 与 `projectId` 映射，因此这类判断应由启动层或服务端输出“initial route intent”，而不是让前端自行推导。

### 4.3 Vue 工程结构

`src/ui/web` 重建为一个基于 Vite 的 Vue 3 SPA，但目录保持克制，避免纯脚手架味：

- `src/ui/web/main.ts`
- `src/ui/web/app/App.vue`
- `src/ui/web/app/router.ts`
- `src/ui/web/app/providers/*`
- `src/ui/web/layouts/*`
- `src/ui/web/pages/dashboard/*`
- `src/ui/web/pages/projects/*`
- `src/ui/web/pages/project-detail/*`
- `src/ui/web/pages/presets/*`
- `src/ui/web/pages/config/*`
- `src/ui/web/components/*`
- `src/ui/web/api/*`
- `src/ui/web/lib/*`
- `src/ui/web/styles/*`

页面代码按路由分目录。公共层只抽真正复用的壳层、列表、badge、inline error、drawer/sheet 等基础单元。

### 4.4 数据访问模型

V1 不引入过重的数据层。使用轻量 `api client + route composables + mutation helpers` 即可。

每个页面采用 route-level loader：

- dashboard -> `/api/dashboard`
- projects -> `/api/projects`
- project detail -> `/api/projects/:projectId` + `/api/skills` + `/api/presets`
- presets -> `/api/presets` + `/api/skills`
- config -> `/api/config`

前端只消费后端快照，不重复推导业务状态。

### 4.5 状态刷新策略

这次重建应直接利用现有 contract 的优势：mutation 返回最新资源快照，因此前端无需再自行重算。

推荐策略：

- 项目详情 mutation 后直接替换 `projectDetail`
- preset 新建、更新、删除后直接替换 `presets`
- config 更新后直接替换 `config`

`Dashboard` 这类聚合页不追求实时联动，只在切回页面、主动刷新或关键操作后按需重载即可。这种策略简单、稳定，并且适合当前本地单用户 UI 的运行环境。

### 4.6 页面与组件职责边界

页面负责：

- 路由数据加载
- 页面级错误态
- mutation 编排

组件负责：

- 展示
- 局部交互
- 输入收集

组件不得偷偷引入业务推导逻辑。例如：

- `PresetAccordion` 只展示 preset 及其 skills
- `ResolvedSkillList` 只消费后端给出的 source labels
- `ConfigForm` 只负责字段输入和 inline error 映射

这样可以严格遵守兼容层约束：前端不推导 resolved skills，不自行计算 preset 引用计数，也不把 project detail 装配逻辑搬进浏览器。

### 4.7 样式系统与动画分工

Tailwind 负责 token 和实用布局，但建议额外定义一层 CSS variables，例如：

- `--paper`
- `--sand`
- `--ink`
- `--muted`
- `--accent`

页面气质不应只靠大量 utility class 直接堆出，最好补一层语义化样式入口，例如：

- `app-shell`
- `editor-panel`
- `review-rail`

动画分工建议如下：

- `Motion`：路由切换、抽屉、结果栏更新、局部 layout transition
- `animate.css`：少量初次入场动画

不建议两套动画系统同时深度控制同一个元素状态。

### References

- `.slfk/docs/tasks/2026-04-05-web-ui/T02-ui-facade-and-compat-layer.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T03-api-contracts-and-error-protocol.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T08-web-shell-and-routing.md`
- `src/ui/contracts/api.ts`
- `src/ui/facade/project-id.ts`
- `src/ui/facade/service.ts`
- `src/ui/server/app.ts`
- `dist/ui/web/assets/view-model.js`

## 5. 最终推荐方案、实施顺序与验收重点

### 5.1 最终推荐方案

本次重建采用以下组合：

- `Vue 3`
- `TypeScript`
- `Vite`
- `Vue Router`
- `Tailwind CSS`
- `Motion`
- `animate.css`

`src/ui/web` 重建为一个干净的 SPA。后端已有的 facade 与 API contract 继续作为真源，前端只负责路由、展示、表单交互和 mutation 后的局部状态替换。

整体体验采用“暖调编辑台”路线，而不是传统后台卡片墙。默认入口由服务端依据启动时的 `pwd` 决定：

- 命中项目则进入 `Project Detail`
- 未命中则进入 `Dashboard`

### 5.2 页面优先级

推荐实现顺序不按页面视觉先后，而按“先搭宿主，再补主工作台”的逻辑推进：

1. App shell：路由、导航、header、quick actions、launch status、加载态与错误态容器
2. Project Detail：主工作台，也是整套 UI 的气质锚点
3. Projects：完成目录检索与跳转闭环
4. Dashboard：补未命中项目时的默认入口与总览
5. Presets：实现 split view 编辑体验
6. Global Config：补设置表单与 inline 校验

这样可以最早暴露壳层和核心工作台是否成立，而不是先花时间在边缘页面上。

### 5.3 建议的实现切片

建议把执行拆成以下几刀：

1. 建立 `src/ui/web`、Vite 构建链路、Tailwind 与 Vue Router，并恢复可被 `src/ui/server/assets.ts` 托管的静态产物
2. 引入 boot payload 或等价初始上下文，让 `/` 能根据启动目录跳转到正确路由
3. 完成 app shell 与 `Project Detail`
4. 接入 `Projects` 与 `Dashboard`
5. 接入 `Presets` 与 `Global Config`
6. 统一打磨动效、空态、错误态和移动端适配

### 5.4 需要补的一点后端契约

当前 API 基本齐备，但为了优雅支持“按启动 `pwd` 决定默认落点”，建议补一个非常轻的初始上下文来源。

推荐方案：

- `GET /api/boot`

该接口返回：

- `initialRoute`
- `launchStatus`
- 必要的轻量环境信息

这样前端初始化最干净，也避免把这类上下文硬塞进 `index.html` 模板字符串中。如果更强调少接口，也可以由服务端在返回 `index.html` 时注入 `window.__SKM_BOOT__`，但整体上更推荐 `GET /api/boot`。

### 5.5 测试与验收重点

路由层重点：

- `/` 是否根据 boot context 正确跳转
- `projectId` 路由是否只消费后端给出的 ID

页面层重点：

- `Project Detail` mutation 后是否立即刷新结果区
- `Presets` 删除预警是否展示引用项目
- `Global Config` 是否正确映射 `fieldErrors`

壳层层重点：

- `Quick Actions` 是否只做说明，不承担真实执行
- `Launch Status` 是否正确展示最终端口和 fallback

交付层重点：

- `npm run build` 后产物是否继续可被 `skm ui` 直接托管
- 发布态是否不依赖额外前端 dev server

### 5.6 成功标准

这次重建成功的标准是：

- 打开 `skm ui` 时，第一感觉不是临时拼出来的后台页
- 进入 `Project Detail` 后，用户能自然完成“看位置、调 preset、调 direct skills、核对 resolved result”
- 前端没有复制后端推导逻辑
- 后续即使继续扩展页面，也不需要推翻壳层和主工作台结构

### References

- `.slfk/docs/tasks/2026-04-05-web-ui/README.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T02-ui-facade-and-compat-layer.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T03-api-contracts-and-error-protocol.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T08-web-shell-and-routing.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T09-feature-pages.md`
- `.slfk/docs/tasks/2026-04-05-web-ui/T11-build-and-static-asset-delivery.md`
- `src/ui/contracts/api.ts`
- `src/ui/facade/service.ts`
- `src/ui/server/app.ts`
- `src/ui/server/assets.ts`
- `package.json`
