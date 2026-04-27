# 德州扑克实时对战游戏 · 需求文档与实现 Prompt

> 本文档包含：产品需求定义 + 分阶段实现 Prompt，可直接喂给 AI 编码助手（Cursor / Claude / Codex）执行。

---

## 0. 元信息

- 作者：zhashuo
- 创建日期：2026-04-24
- 状态：✅ 需求已确认，Prompt 已就绪
- 交付物：按阶段执行下方第 9 节的 Prompt 即可实现完整项目

---

## 1. 产品一句话描述

一款面向**朋友间对战**的 Web 端实时德州扑克游戏：浏览器打开 → 输入昵称 → 创建或点击分享链接加入房间 → 开玩。无需注册，多设备跨端可用。

---

## 2. 产品定位

| 维度 | 选型 |
|------|------|
| 平台 | Web（PC 优先，移动端响应式兼容） |
| 规模 | 小型朋友局，单房间 2–9 人 |
| 模式 | 仅私人房间（现金桌体验，非锦标赛） |
| 账号体系 | 无需注册；昵称进入；localStorage UUID 识别设备 |
| 交付策略 | 分阶段实现，先 MVP 跑通一局完整德州，再叠加体验 |

---

## 3. 技术栈（已锁定）

### 3.1 后端
- **运行时**：Node.js 20 LTS
- **语言**：TypeScript 5.x（strict mode，开启 `noUncheckedIndexedAccess`）
- **Web 框架**：Fastify（性能优于 Express，TS 友好）
- **实时通信**：Socket.IO 4.x
- **ORM**：Prisma
- **数据库**：SQLite（未来可一键迁 Postgres，只改 `datasource` 配置）
- **日志**：pino
- **测试**：Vitest

### 3.2 前端
- **框架**：React 18 + TypeScript
- **构建**：Vite
- **路由**：React Router 6
- **状态管理**：Zustand
- **UI 库**：Tailwind CSS + Radix UI Primitives
- **Socket 客户端**：socket.io-client
- **头像**：`@dicebear/core` + `@dicebear/identicon`（基于设备 UUID 自动生成）
- **动画**：Framer Motion
- **二维码**：`qrcode.react`
- **音效**：`use-sound`

### 3.3 项目结构
- **Monorepo**：pnpm workspaces
  - `packages/shared`：前后端共享的 TypeScript 类型、协议、常量
  - `packages/engine`：纯函数的德州扑克引擎（发牌、比牌、下注状态机），零依赖、全单元测试覆盖
  - `packages/server`：Fastify + Socket.IO + Prisma
  - `apps/web`：React 前端

### 3.4 部署
- 目标：能一键部署到 Railway / Fly.io / 个人 VPS
- Dockerfile（多阶段构建）+ docker-compose.yml
- 环境变量：`PORT`、`DATABASE_URL`、`PUBLIC_URL`

---

## 4. 游戏规则细节

| 项 | 值 |
|---|---|
| 德州变种 | No Limit Texas Hold'em |
| 桌面人数 | 2–9 人，房主创建房间时设置上限 |
| 盲注结构 | 房主创建时自定义（小盲 / 大盲固定数值，不随时间递增） |
| 初始筹码 | 房主自定义 |
| 补码策略 | 房主配置单玩家最大补码次数（默认 2 次） |
| 每手行动时限 | 房主配置（10–60 秒，默认 30 秒） |
| 超时策略 | 第 1 次超时：能过牌则过牌，否则弃牌；连续第 2 次：自动站起托管，玩家可随时点"坐回"恢复 |
| 摊牌 | 简化实现：达到摊牌阶段全员亮牌 |
| 边池 | 完整支持 all-in 分层 |
| 洗牌 | 服务端 `node:crypto` + Fisher–Yates |

**引擎必须正确处理的边界**：
- A-2-3-4-5（轮子）顺子识别与排序
- 同花顺 > 普通顺子
- 踢脚比较（一对、两对、三条）
- 多玩家多档位 all-in 产生的嵌套边池
- 最小加注规则（raise 差额不得小于上一次 raise 差额）
- 全员 all-in 后自动发完剩余公共牌

---

## 5. 功能清单

### 5.1 房间
- [x] 创建房间：昵称 + 上限人数 + 小盲/大盲 + 初始筹码 + 最大补码次数 + 行动时限
- [x] 每个房间独立 URL：`/r/{nanoid(10)}`，不可枚举
- [x] 分享入口：复制链接按钮 + 二维码按钮
- [x] 加入房间：点链接进入 → 输入昵称 → 选择空座位坐下
- [x] 断线重连窗口：5 分钟内保留座位和筹码
- [x] 刷新页面等同于重连（靠 localStorage UUID）
- [x] 被踢设备 UUID 进入本房间黑名单，无法再进
- [x] 无密码、无审批（最简模式）

### 5.2 房主权限
- [x] 暂停 / 恢复牌局（暂停后所有计时器停止，不发新手）
- [x] 踢出玩家（被踢的 deviceUUID 进入本房间黑名单）

### 5.3 对局核心
- [x] 发手牌（每人 2 张，**仅私发**给对应 socket）
- [x] 下注轮：Preflop → Flop → Turn → River → Showdown
- [x] 行动：Fold / Check / Call / Raise / All-in
- [x] 倒计时进度条 + 到点提示音
- [x] 底池 / 边池正确结算
- [x] 赢家揭示 + 最佳 5 张组合高亮

### 5.4 社交与体验
- [x] 文字聊天（房间内公开频道）
- [x] 内置表情包（20 张固定素材，无需上传）
- [x] DiceBear Identicon 头像（基于 deviceUUID 自动生成）
- [x] 音效：发牌、下注、胜利
- [x] 动画：筹码飞向底池、发牌滑入、底池飞向赢家
- [x] 手牌历史：每手归档为文本动作序列 + 关键时刻截图，抽屉形式查看

### 5.5 明确不做（勿自行扩展）
- [ ] 语音聊天
- [ ] 观战模式
- [ ] 主动 Show Card
- [ ] 锦标赛 / 盲注递增
- [ ] 多语言（只做中文）
- [ ] 账号系统 / 第三方登录
- [ ] 房间密码 / 加入审批

---

## 6. 协议设计（概要）

在 `packages/shared/src/protocol.ts` 用 TypeScript discriminated union 定义所有 Socket 事件：

**客户端 → 服务端事件**：
- `room:create`、`room:join`、`room:sit`、`room:stand`、`room:leave`
- `game:action`（fold / check / call / raise / allin）
- `chat:send`、`chat:emoji`
- `host:kick`、`host:pause`、`host:resume`

**服务端 → 客户端事件**：
- `room:state`（完整快照，加入时/重连时下发）
- `room:update`（增量更新）
- `game:start`、`game:deal`（**私密**，单发给对应 socket）
- `game:turn`、`game:action`（广播）、`game:showdown`、`game:end`
- `chat:message`、`error`

所有事件 payload 精确 typed，前后端都从 `@poker/shared` 导入，不重复定义。

---

## 7. 公平性与安全（红线，不可妥协）

1. **服务端权威**：所有状态、洗牌、发牌、下注校验只在服务端进行
2. **最小信息原则**：客户端永远收不到别人的底牌数据，连 payload 字段都没有
3. **消息校验**：每个 `game:action` 校验「发起者身份」+「是否轮到他」+「动作合法性」（调用引擎的 `legalActions`）
4. **去重**：客户端带 actionId，服务端去重
5. **房间持久化**：每手结束写入 SQLite，服务器重启可从 DB 恢复房间
6. **串行化**：每个房间内的状态变更用 async lock 串行处理，防竞态

---

## 8. 数据库 Schema

```prisma
model Room {
  id            String    @id
  hostDeviceId  String
  config        String    // JSON: seatsMax, smallBlind, bigBlind, initialChips, maxRebuy, timeoutSec
  state         String    // JSON 房间完整快照
  createdAt     DateTime  @default(now())
  endedAt       DateTime?
}

model HandHistory {
  id         String   @id @default(cuid())
  roomId     String
  handNumber Int
  data       String   // JSON: players, actions, board, winners, holeCards
  playedAt   DateTime @default(now())
}

model BannedDevice {
  roomId   String
  deviceId String
  @@id([roomId, deviceId])
}
```

---

## 8.1 目录结构（期望）

```
poker/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── protocol.ts
│   │       ├── types.ts
│   │       └── index.ts
│   ├── engine/
│   │   ├── src/
│   │   │   ├── deck.ts
│   │   │   ├── evaluator.ts
│   │   │   ├── betting.ts
│   │   │   ├── sidepots.ts
│   │   │   ├── handState.ts
│   │   │   └── index.ts
│   │   └── tests/
│   └── server/
│       ├── src/
│       │   ├── app.ts
│       │   ├── socket.ts
│       │   ├── roomManager.ts
│       │   ├── gameLoop.ts
│       │   ├── persistence.ts
│       │   └── index.ts
│       └── prisma/
│           └── schema.prisma
└── apps/
    └── web/
        └── src/
            ├── pages/
            │   ├── Home.tsx
            │   └── Room.tsx
            ├── components/
            │   ├── Table.tsx
            │   ├── Seat.tsx
            │   ├── Card.tsx
            │   ├── ChipStack.tsx
            │   ├── ActionBar.tsx
            │   ├── Chat.tsx
            │   ├── HandHistory.tsx
            │   ├── HostPanel.tsx
            │   └── ShareDialog.tsx
            ├── store/
            ├── socket.ts
            ├── identity.ts
            └── main.tsx
```

---

## 9. 分阶段实现 Prompt

> **使用方式**：将每个阶段的 Prompt 单独喂给 AI 编码助手（建议在每阶段之间做一次人工验收和 Git 提交）。前置阶段完成后，后续阶段基于已有代码继续。

---

### 阶段 1：项目骨架与基础设施

**目标**：搭好 monorepo、工具链、数据库、空壳服务，可以 `pnpm dev` 一键起前后端。

**Prompt**：

> 你是一位资深全栈工程师。请为我搭建一个 Node.js + TypeScript + React 的德州扑克项目骨架。
>
> **技术栈**：
> - Monorepo：pnpm workspaces
> - 后端：Node 20 + TypeScript + Fastify + Socket.IO 4
> - 前端：React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Router 6
> - 数据库：SQLite + Prisma
> - 测试：Vitest
> - 日志：pino
>
> **请完成以下任务**：
> 1. 按照项目目录结构创建完整的 workspace 骨架，所有 `package.json` 配置好对应依赖
> 2. 根 `package.json` 提供脚本：`dev`（并行启动 server 和 web）、`build`、`test`、`typecheck`、`lint`
> 3. 配置 TypeScript 严格模式（strict + noUncheckedIndexedAccess），所有包共享一份 `tsconfig.base.json`
> 4. 配置 ESLint + Prettier（推荐规则，不要过度严格）
> 5. 创建 `packages/shared` 包，导出示例类型（后续阶段会填充真实协议）
> 6. 创建 `packages/server`：Fastify 启动在 env PORT（默认 3001），挂载 Socket.IO，健康检查 `/health`
> 7. 创建 `apps/web`：Vite + React 空壳页面，接入 socket.io-client 连上后端，配置 Tailwind 深色主题
> 8. 在 `packages/server` 配好 Prisma，`schema.prisma` 先放一个空 `Room` 模型占位
> 9. 写 `Dockerfile`（多阶段构建，最后只保留 production 产物）和 `docker-compose.yml`
> 10. 写 `.env.example` 与 `README.md`（包含本地启动、环境变量、架构概述）
>
> **约束**：
> - 禁止生成冗余注释
> - 所有文件都要能通过 `tsc --noEmit`
> - `pnpm install && pnpm dev` 一次成功，前端能看到后端返回的健康数据
>
> 完成后请输出：新创建/修改的文件清单 + 关键决策点。

---

### 阶段 2：纯函数德州扑克引擎（`packages/engine`）

**目标**：独立、零依赖、完全可测试的扑克规则实现。

**Prompt**：

> 已有阶段 1 搭好的 monorepo 骨架。现在请实现 `packages/engine`：一个纯函数、零副作用的 No Limit Texas Hold'em 规则引擎。
>
> **需要实现的模块**（均在 `packages/engine/src/` 下）：
>
> 1. **`deck.ts`**
>    - 类型 `Card = { rank: 2..14, suit: 's'|'h'|'d'|'c' }`
>    - `createDeck(): Card[]`（52 张）
>    - `shuffle(deck, rng): Card[]`（Fisher–Yates，rng 接受 `() => number`，便于测试注入）
>    - `cryptoRng()`：返回使用 `node:crypto` 的安全随机函数
>
> 2. **`evaluator.ts`**
>    - `evaluateHand(7 张牌): { category, tiebreakers, bestFive }`
>    - category: highCard / pair / twoPair / threeOfAKind / straight / flush / fullHouse / fourOfAKind / straightFlush / royalFlush
>    - `compareHands(a, b): -1 | 0 | 1`
>    - 必须正确处理：A-2-3-4-5 顺子（轮子）、同花顺 vs 普通顺子、踢脚比较
>
> 3. **`sidepots.ts`**
>    - 给定玩家投入额数组 `[{ playerId, contributed, folded }]`，计算 `Pot[] = { amount, eligiblePlayerIds }`
>    - 覆盖 all-in 分层、多个玩家 all-in 不同金额的场景
>
> 4. **`betting.ts` + `handState.ts`**
>    - 一只完整手牌的状态机：街（preflop/flop/turn/river/showdown）、dealer、SB、BB、当前行动者、最低加注、行动历史
>    - 合法行动校验：`legalActions(state, playerId): Action[]`
>    - 应用动作：`applyAction(state, action): HandState`（纯函数，返回新状态）
>    - 自动推进街、自动处理全员 all-in 后直接发完剩余公共牌
>
> 5. **单元测试**（`tests/` 目录，使用 Vitest）
>    - `evaluator.test.ts`：至少 30 个用例覆盖所有牌型 + 边界
>    - `sidepots.test.ts`：至少 10 个场景
>    - `betting.test.ts`：至少 15 个场景（正常推进、超时、all-in、加注合法性）
>    - 覆盖率目标：语句覆盖率 ≥ 90%
>
> **约束**：
> - 引擎不依赖 Socket、数据库，不使用 `Date.now()` 等副作用（时间由调用方注入）
> - 所有函数对输入不可变，返回新对象
>
> 完成后：`pnpm --filter @poker/engine test` 全绿，输出模块导出一览表 + 核心 API 签名。

---

### 阶段 3：实时对战服务层（`packages/server`）

**目标**：把引擎接上 Socket.IO，变成可多人游玩的实时后端。

**Prompt**：

> 已有阶段 1、2 产出：monorepo 骨架 + 完整测试的扑克引擎。现在请实现 `packages/server` 的实时对战层。
>
> **核心模块**：
>
> 1. **协议定义（写到 `packages/shared/src/protocol.ts`）**
>    - 使用 TypeScript discriminated union 定义完整的 Socket 事件
>    - 客户端 → 服务端：`room:create` / `room:join` / `room:sit` / `room:stand` / `room:leave` / `game:action` / `chat:send` / `host:kick` / `host:pause` / `host:resume`
>    - 服务端 → 客户端：`room:state` / `room:update` / `game:start` / `game:deal`（私密）/ `game:turn` / `game:action` / `game:showdown` / `game:end` / `chat:message` / `error`
>    - 所有 payload 都要精确 typed
>
> 2. **`roomManager.ts`**
>    - 内存维护 `Map<roomId, RoomState>`，每次变更写入 SQLite 做持久化快照
>    - 创建房间：生成 nanoid(10) 作为 roomId，保存房主 deviceUUID
>    - 加入房间：基于 deviceUUID 识别身份，支持断线重连（5 分钟窗口）
>    - 黑名单：被踢的 deviceUUID 进入 `BannedDevice` 表
>    - 服务启动时从 SQLite 恢复未结束的房间
>
> 3. **`gameLoop.ts`**
>    - 驱动引擎状态机
>    - 行动计时器（setTimeout），超时按规则处理（第 1 次 check/fold，第 2 次自动 sit-out）
>    - 暂停：清除所有计时器，恢复时重新启动
>    - 每手结束写入 `HandHistory` 表
>
> 4. **Prisma schema**（见本文档第 8 节）
>
> 5. **安全与校验**
>    - 每个事件校验 deviceUUID → playerId 归属
>    - `game:action` 校验「是不是你的回合」+「动作合法性」（调用引擎的 `legalActions`）
>    - 对发牌事件（`game:deal`）单独私发给对应 socket，不广播
>    - 所有异常返回标准 `error` 事件而不是抛异常
>    - 每个房间内的状态变更用 async lock 串行处理
>
> 6. **集成测试**（Vitest + socket.io-client）
>    - 创建房间 → 2 人坐下 → 开局 → 完整一手（preflop → flop → turn → river → 摊牌）
>    - 断线重连恢复场景
>    - all-in 产生边池的场景
>
> **约束**：
> - 不要在 server 层重新实现规则，所有规则调用 `@poker/engine`
> - 日志用 pino，关键事件都要打
> - Socket handler 只做参数校验 + 调用 service，不写业务逻辑
>
> 完成后：`pnpm --filter @poker/server test` 全绿，可以用 socket.io-client 跑通 2 人完整一局。

---

### 阶段 4：前端 UI（`apps/web`）

**目标**：极简现代深色风的牌桌界面。

**Prompt**：

> 已有阶段 1–3 产出：完整后端 + 协议定义。现在请实现 `apps/web` 前端。
>
> **视觉规范**：
> - 风格：极简现代，深色背景（`#0f172a` 系），扁平化牌面
> - 响应式：PC 优先（1280×800 起），手机 iPhone 12 尺寸（390×844）不错乱即可
> - 只做中文界面
>
> **页面 & 组件**：
>
> 1. **`pages/Home.tsx`**
>    - 输入昵称
>    - 「创建房间」按钮（弹窗配置：seatsMax / smallBlind / bigBlind / initialChips / maxRebuy / timeoutSec）
>    - 直接访问 `/r/xxx` 自动进入对应房间
>
> 2. **`pages/Room.tsx`**（主牌桌）
>    - 椭圆形深色牌桌布局，座位环绕
>    - 中间：底池金额 + 公共牌区
>    - 每个座位：头像（DiceBear identicon）+ 昵称 + 筹码 + 当前下注 + 庄家/小盲/大盲标识
>    - 自己的座位额外显示手牌
>    - 底部 `ActionBar`：Fold / Check / Call / Raise（带滑块 + 快捷按钮：1/2 pot、2/3 pot、pot、all-in）
>    - 轮到自己时：ActionBar 高亮 + 倒计时进度条 + 提示音
>    - 键盘快捷键：F=Fold，C=Check/Call，R=打开加注滑块，A=All-in
>
> 3. **其他组件**
>    - `Card.tsx`：扁平化卡牌，花色彩色（红黑四色）
>    - `ChipStack.tsx`：按面额叠层显示
>    - `Chat.tsx`：右下角可折叠聊天面板 + 内置 20 张表情包
>    - `HandHistory.tsx`：抽屉形式，显示过往手牌（文本动作序列 + 关键截图）
>    - `HostPanel.tsx`：仅房主可见，暂停/恢复/踢人
>    - `ShareDialog.tsx`：复制链接 + 二维码（`qrcode.react`）
>
> 4. **状态管理**（Zustand）
>    - `useSocketStore`：连接状态、`emit` 封装
>    - `useRoomStore`：订阅 `room:state` / `room:update` 自动更新
>    - `useIdentityStore`：deviceUUID（localStorage 持久化）+ 昵称
>
> 5. **`identity.ts`**
>    - 首次访问生成 UUID 存 localStorage
>    - 提供 `getDeviceId()`、`getNickname()`、`setNickname()`
>
> 6. **动画与音效**
>    - 下注时筹码飞向底池（Framer Motion）
>    - 发牌有轻微滑入
>    - 音效：发牌声 / 下注声 / 胜利音（`use-sound` + 免费音源，放 `public/sounds/`）
>
> **约束**：
> - 所有 Socket 事件 payload 从 `@poker/shared` 导入
> - 禁止硬编码颜色，全部走 Tailwind 主题
> - 客户端渲染不得展示他人底牌数据（即使 DOM 隐藏也不行，源头就不能有）
>
> 完成后：开 2 个浏览器窗口（不同 deviceUUID）可完整走一局。

---

### 阶段 5：体验打磨与附加功能

**目标**：把 MVP 打磨成好用的成品。

**Prompt**：

> 已有阶段 1–4 产出：可完整对战的 MVP。现在补齐体验细节。
>
> **任务**：
>
> 1. **断线重连完善**
>    - 前端检测到 disconnect 后显示「连接已断开，尝试重连中…」遮罩
>    - 5 分钟内重连成功则无缝继续；超时则提示「已失去座位」
>    - 刷新页面也算重连（靠 localStorage deviceUUID）
>
> 2. **手牌历史回看**
>    - 每手结束后生成一条历史记录（玩家列表、公共牌、每位玩家手牌、动作序列、赢家）
>    - 前端时间轴渲染，关键时刻（翻牌、转牌、河牌、摊牌）带卡牌可视化
>
> 3. **房主控制**
>    - 暂停按钮广播暂停消息，所有计时器暂停，UI 显示"已暂停"遮罩
>    - 踢人：HostPanel 点击其他玩家头像弹出踢人确认
>
> 4. **边界通知**
>    - 筹码用完且达补码上限：提示离桌
>    - 仅剩一名有筹码玩家：自动结束房间并显示结算
>    - 浏览器关闭前提示
>
> 5. **易用性**
>    - 加注滑块支持鼠标滚轮
>    - 键盘快捷键 F/C/R/A 正确触发对应动作
>
> 6. **E2E 测试**
>    - Playwright 脚本模拟 2 个玩家完整打 3 手
>    - 断线重连场景
>    - 踢人 + 黑名单场景
>
> **约束**：不引入新的核心依赖（DiceBear / Framer Motion / qrcode.react / use-sound 已在阶段 4 引入）。

---

### 阶段 6：部署

**目标**：一键云部署。

**Prompt**：

> 已有阶段 1–5 产出：完整项目。请配置部署。
>
> 1. **Dockerfile 优化**：多阶段构建，最终镜像 < 300MB，non-root 用户运行
> 2. **docker-compose.yml**：单容器即可跑（SQLite 文件挂载 volume）
> 3. **Railway 部署**：`railway.json` + 一键部署按钮 + 环境变量说明
> 4. **Fly.io 部署**：`fly.toml` + volume 配置（持久化 SQLite）
> 5. **VPS 部署文档**：systemd 配置 + Caddy 反向代理（自动 HTTPS）
> 6. **备份脚本**（可选）：SQLite 文件定时备份到 S3 兼容对象存储
>
> 输出：`deploy/` 目录下的配置文件 + `docs/deploy.md`。

---

## 10. 验收清单（详细版）

> 每一项都要「可复现 + 有明确预期」。建议在每个阶段完成后跑对应小节，全项目完工再跑 §10.7 的端到端场景。

### 10.1 工程基础可用性

| # | 验收项 | 操作 | 预期结果 |
|---|--------|------|----------|
| 1.1 | 干净克隆可启动 | `git clone ... && pnpm install && pnpm dev` | 3 分钟内前后端都起来，无报错 |
| 1.2 | 类型检查全绿 | `pnpm typecheck` | 0 错误，0 警告 |
| 1.3 | Lint 全绿 | `pnpm lint` | 0 错误 |
| 1.4 | 单元测试 | `pnpm test` | 全绿，engine 包覆盖率 ≥ 90% |
| 1.5 | 构建产物可用 | `pnpm build && pnpm start` | 生产模式启动正常 |
| 1.6 | Docker 镜像构建 | `docker build -t poker . && docker run -p 3001:3001 poker` | 容器内服务正常响应 |

**常见翻车点**：
- pnpm workspace 循环依赖 → `pnpm why <pkg>` 排查
- Prisma client 在 Docker 里没生成 → Dockerfile 要执行 `prisma generate`
- Vite 构建时 `import.meta.env` 丢失 → 检查 env 前缀为 `VITE_`

### 10.2 扑克引擎正确性（对应阶段 2）

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 2.1 | 52 张牌不重不漏 | `createDeck()` 去重后长度 = 52，四花色各 13 张 |
| 2.2 | 轮子顺子 | A-2-3-4-5 识别为 straight，且大小 < 2-3-4-5-6 |
| 2.3 | 同花顺 > 顺子 | 同花顺永远 > 普通顺子 |
| 2.4 | 踢脚比较 | 两对一样时，看第三张踢脚 |
| 2.5 | 边池正确 | A all-in 100，B all-in 300，C call 300 → 主池 300（三人），边池 400（BC） |
| 2.6 | 最小加注 | 有人 raise 到 100，下一个 raise 不能少于 200 |
| 2.7 | 全员 all-in | preflop 全 all-in，引擎自动发完 flop/turn/river 并摊牌 |

### 10.3 实时对战服务（对应阶段 3）

| # | 验收项 | 预期 |
|---|--------|------|
| 3.1 | 创建房间 | 返回 roomId（10 位 nanoid），DB 有记录 |
| 3.2 | 发牌隐私 | 用 DevTools 检查：B 的 socket 永远收不到 A 的手牌 payload |
| 3.3 | 非法行动被拒 | 非当前回合发 `game:action` → 返回 `error: NOT_YOUR_TURN` |
| 3.4 | 断线重连 | 掉线 4 分钟后重连，座位、筹码、手牌原样恢复 |
| 3.5 | 断线超时 | 掉线 6 分钟，座位被释放 |
| 3.6 | 服务重启恢复 | kill 服务 → 重启 → 房间从 SQLite 恢复 |
| 3.7 | 黑名单生效 | 被踢的 deviceUUID 再进 → `error: BANNED` |
| 3.8 | 暂停/恢复 | 房主暂停后计时停止，恢复后从中断点继续 |

### 10.4 前端 UI（对应阶段 4）

| # | 验收项 | 验证 |
|---|--------|------|
| 4.1 | 首页流程 | 输入昵称 → 创建房间 → 跳转 `/r/xxx` → URL 可复制分享 |
| 4.2 | 二维码 | 手机扫码能进入同一个房间 |
| 4.3 | 手牌仅自己可见 | DevTools 检查 DOM：其他玩家座位区不渲染卡牌数值，只有牌背 |
| 4.4 | 当前行动高亮 | 轮到我时 ActionBar 变亮 + 倒计时进度条 + 提示音 |
| 4.5 | 刷新不丢身份 | 任意时刻 F5，回来后仍在座位上 |
| 4.6 | 响应式 | iPhone 12（390×844）和 1440×900 布局不错乱 |

### 10.5 安全验收

| # | 验收项 | 验证 |
|---|--------|------|
| 5.1 | 底牌隐私 | Chrome DevTools Network → WS 帧，自己永远只收到自己的手牌 |
| 5.2 | 伪造 action 被拒 | 用 DevTools 改 JS 发非法 raise → 服务端返回 error，状态不变 |
| 5.3 | 消息去重 | 客户端重发同一 actionId → 服务端只处理一次 |

### 10.6 端到端场景（Playwright）

**场景 A：完整对战**
```
1. 浏览器 1（房主）创建 6 座房间，小盲/大盲 10/20，初始筹码 1000
2. 复制链接，浏览器 2（隐身）加入座 2，浏览器 3 加入座 5
3. 完整打完 1 手：preflop → flop → turn → river → 摊牌
4. 断言：底池正确结算到赢家；DB 多一条 HandHistory
```

**场景 B：断线重连**
```
1. 3 人进行中
2. 浏览器 2 关闭标签（模拟断线）
3. 4 分钟内浏览器 2 重新打开链接
4. 断言：座位保留、筹码保留、可继续行动
```

**场景 C：踢人 + 黑名单**
```
1. 房主踢玩家 B
2. B 立即被移出
3. B 点链接再进
4. 断言：看到"您已被移出此房间"，无法入场
```

### 10.7 发布前最后一查

- [ ] 无 `console.log` 遗留在生产代码
- [ ] 无 hardcode 的 API URL 或秘钥
- [ ] `.env.example` 与实际用到的 env 一致
- [ ] CORS 配置收敛到预期域名
- [ ] Socket.IO 的 `pingTimeout` / `pingInterval` 已调整（建议 25s / 20s）
- [ ] README 写清楚：一句话介绍、本地启动 3 步、架构、协议、部署
- [ ] Docker 镜像 < 300MB

---

## 11. 最终实现 Prompt（一体化版）

> 如果你希望一次性把完整规格喂给 AI 而不分阶段，直接使用下方 Prompt：

---

**Prompt**：

> 你是一位资深全栈工程师。请按照以下完整规格，从零实现一款 Web 端多人实时德州扑克游戏。遇到规格未明确的小细节时，按"简洁、可读、易维护"的原则自行决定，并在 README 中注明。
>
> ---
>
> **产品定位**：朋友间对战的 Web 端实时 No Limit 德州扑克。浏览器打开 → 输入昵称 → 创建或点击分享链接加入房间 → 开玩。无需注册，多设备跨端可用，只做中文界面。
>
> **技术栈**：pnpm monorepo，后端 Node 20 + TypeScript + Fastify + Socket.IO 4 + Prisma + SQLite + pino + Vitest，前端 React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Router 6 + socket.io-client + @dicebear/identicon + Framer Motion + qrcode.react + use-sound，E2E 用 Playwright。
>
> **完整规格见附件**（本文档第 1–10 节），请严格按规格实现，按阶段 1→6 顺序产出，每阶段完成后输出文件清单 + 关键决策点，然后继续下一阶段。
>
> **红线**（任何一条都不能违反）：
> 1. 客户端永远收不到别人的底牌数据
> 2. 所有下注校验在服务端完成
> 3. `pnpm typecheck && pnpm lint && pnpm test` 全绿
> 4. engine 包测试覆盖率 ≥ 90%
> 5. Docker 镜像 < 300MB
> 6. 无 console.log / hardcode URL / hardcode 秘钥遗留在生产代码

---

*文档结束*
