# 德州扑克 WebOnly 版本 · 需求文档

> 纯前端实现，无需后端服务器，打包为单一 HTML 文件，通过 WebRTC P2P 实现多设备局域网联机。

---

## 0. 元信息

- 作者：zhashuo
- 创建日期：2026-04-27
- 状态：✅ 已实现（2026-04-27）
- 交付物：`apps/web-only/dist/index.html`（单文件，可直接用浏览器打开）
- 参考文档：`PokerGame.md`（原版全栈项目需求）

---

## 1. 产品定位

一款面向**朋友间本地联机**的纯前端德州扑克游戏。所有设备接入同一热点 → 一人创建房间 → 其余人扫码加入 → 直接开玩。无需注册，无需后端服务器，无需云端部署。

| 维度 | 选型 |
|------|------|
| 平台 | Web（移动端优先，兼容 PC） |
| 规模 | 小型本地朋友局，单房间 2–9 人 |
| 联机方式 | WebRTC P2P，宿主浏览器为权威节点 |
| 账号体系 | 无需注册；进入时输入昵称 |
| 交付形式 | 单一 `index.html` 文件，可通过 `file://` 或局域网 HTTP 访问 |
| 语言 | 中文界面 |

---

## 2. 技术栈

### 2.1 项目位置

```
apps/web-only/    # 独立子项目，不依赖 monorepo 其他包的运行时
```

引擎代码直接复制自 `packages/engine/src/`，作为 `src/engine/` 子目录存在，不做 workspace 依赖。

### 2.2 依赖清单

| 依赖 | 用途 |
|------|------|
| React 18 + TypeScript | UI 框架 |
| Vite | 构建工具 |
| `vite-plugin-singlefile` | 将所有 JS/CSS 内联到单一 HTML 文件 |
| PeerJS | WebRTC DataChannel 封装，P2P 通信 |
| Zustand | 前端状态管理 |
| Tailwind CSS | 样式，深色主题 |
| `qrcode.react` | 展示房间连接二维码 |
| `nanoid` | 生成短房间码 |

### 2.3 构建目标

```bash
pnpm build
# 产物：dist/index.html（单文件，内联所有资源）
# 可直接双击用浏览器打开，或通过局域网 HTTP 访问
```

`vite.config.ts` 关键配置：

```ts
import { viteSingleFile } from 'vite-plugin-singlefile'

export default {
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100_000_000, // 内联所有资源
    cssCodeSplit: false,
  },
}
```

---

## 3. 架构设计

### 3.1 宿主-客户端模型

```
宿主设备（浏览器）                     客户端设备（浏览器）
┌──────────────────────┐               ┌──────────────────────┐
│  扑克引擎（权威状态）   │◄────────────►│  仅渲染视图           │
│  游戏逻辑            │  WebRTC       │  仅发送操作指令       │
│  PeerJS Host Peer    │  DataChannel  │  PeerJS Client Peer  │
└──────────────────────┘               └──────────────────────┘
         ▲                                       │
         │         PeerJS 公共信令服务器           │
         └──────── (仅用于初始 WebRTC 握手) ───────┘
```

- **宿主（Host）**：运行完整游戏引擎，管理所有玩家状态，是唯一的游戏权威节点
- **客户端（Client）**：只接收经宿主过滤的状态（看不到他人底牌），只能发送行动指令
- **信令**：使用 PeerJS 公共服务器（`0.peerjs.com`）完成 WebRTC 握手，握手后数据直接在局域网内 P2P 传输

### 3.2 手牌隐私保证

宿主向每个 peer 单播消息时，`holeCards` 字段只含该玩家自己的手牌。宿主自身在本地直接读取引擎状态，不经过网络。

```
引擎状态（全部底牌）→ 宿主过滤 → 仅发给 Peer A 其手牌
                              → 仅发给 Peer B 其手牌
```

### 3.3 连接流程

```
1. 宿主打开 HTML → 点「创建房间」→ 输入房间配置
2. PeerJS 分配一个 Peer ID，宿主将其作为「房间码」展示（6位短码 + QR）
3. 其他玩家打开相同 HTML → 点「加入房间」→ 扫 QR 或手动输入房间码
4. 客户端与宿主建立 WebRTC DataChannel 连接
5. 宿主收到连接后广播当前房间状态，客户端完成渲染
6. 宿主点「开始游戏」（需 ≥ 2 人入座），引擎开始第一手
```

---

## 4. 游戏规则

与 `PokerGame.md §4` 一致，规则完整实现。

| 项 | 值 |
|---|---|
| 德州变种 | No Limit Texas Hold'em |
| 桌面人数 | 2–9 人，宿主创建时设置上限 |
| 盲注结构 | 宿主创建时自定义（小盲/大盲固定数值，不随时间递增） |
| 初始筹码 | 宿主自定义 |
| 补码策略 | 宿主配置最大补码次数（默认 2 次） |
| 每手行动时限 | 宿主配置（10–60 秒，默认 30 秒） |
| 超时策略 | 第 1 次超时：能过牌则过牌，否则弃牌；连续第 2 次：自动坐出 |
| 摊牌 | 达到摊牌阶段全员亮牌 |
| 边池 | 完整支持 all-in 分层边池 |
| 洗牌 | 浏览器 `crypto.getRandomValues` + Fisher–Yates |

**引擎必须正确处理的边界**（与原版相同）：
- A-2-3-4-5（轮子）顺子识别与排序
- 同花顺 > 普通顺子
- 踢脚比较（一对、两对、三条）
- 多玩家多档位 all-in 产生的嵌套边池
- 最小加注规则（raise 差额不得小于上一次 raise 差额）
- 全员 all-in 后自动发完剩余公共牌

---

## 5. 功能清单（MVP）

### 5.1 房间与连接

- [x] 创建房间：输入昵称 + 配置（上限人数 / 小盲 / 大盲 / 初始筹码 / 最大补码次数 / 行动时限）；**宿主自动作为第 1 名玩家入座**
- [x] 展示房间码（6 位短码）+ 二维码，便于同一热点下其他设备扫码加入
- [x] 加入房间：扫 QR 或手动输入房间码 → 输入昵称 → 自动分配空位入座
- [x] 等待阶段直接显示牌桌（椭圆形），已入座玩家显示在对应座位，空位可见，宿主点「开始游戏」发第一手（需 ≥ 2 人）
- [x] 宿主可踢出玩家（断开对应 peer 连接，移出座位）

### 5.2 对局核心

- [x] 发手牌（仅通过 DataChannel 私发给对应 peer）
- [x] 下注轮：Preflop → Flop → Turn → River → Showdown
- [x] 行动：Fold / Check / Call / Raise / All-in
- [x] 倒计时进度条（到点自动执行默认行动）
- [x] 底池 / 边池正确结算
- [x] 赢家揭示：赢家手牌亮出 + 所有未弃牌玩家亮牌（符合德州规则），弃牌玩家保持牌背，最佳 5 张高亮
- [x] 手牌结束后**等待宿主手动点「开始下一手」**，不自动开始

### 5.3 宿主权限

- [x] 暂停 / 恢复牌局（计时器停止）
- [x] 踢出玩家（断开 peer 连接，移出座位）
- [x] 为指定玩家手动添加补码筹码（补码次数受创建时配置限制）

### 5.4 明确不做（MVP 范围外）

- [ ] 文字聊天
- [ ] 手牌历史回看
- [ ] 发牌/下注动画（Framer Motion）
- [ ] 音效
- [ ] 断线重连（掉线即失去座位）
- [ ] 持久化（关闭页面数据消失）
- [ ] 观战模式
- [ ] 锦标赛/盲注递增
- [ ] 账号系统

---

## 6. UI 行为规范

### 6.1 牌桌布局（移动端竖屏优先）

- 椭圆形牌桌居中显示，最多 9 个座位环绕排布
- **自己的座位固定在屏幕底部**，其余座位按顺时针排列于上方
- 牌桌中心区域显示：公共牌 + 底池/边池金额
- 等待阶段：座位显示"等待中"占位，已入座玩家显示昵称+筹码

### 6.2 等待阶段

- 所有人进入后直接看到牌桌（椭圆形），已入座玩家显示在对应座位
- 二维码/房间码展示为可折叠的浮层按钮（右上角"邀请"），方便随时分享
- 宿主座位右侧显示「开始游戏」按钮（≥ 2 人入座时激活）
- 非宿主玩家看到的是「等待房主开始…」提示

### 6.3 行动区（ActionBar）

- **仅轮到自己行动时**展示，其他时候隐藏
- 按钮行：Fold / Check（不合法则灰显）/ Call（显示需跟注金额）/ Raise / All-in
- **Raise 交互**：点击 Raise 后从底部弹出半屏面板（Bottom Sheet），内含：
  - 金额输入框（可直接键入数字）
  - 横向滑块（min: 最小合法加注额，max: 全押金额）
  - 快捷按钮：½ 底池、⅔ 底池、底池、全押
  - 底部「确认加注」按钮 + 「取消」
- 键盘快捷键（PC）：`F`=Fold，`C`=Check/Call，`R`=打开 Raise 面板，`A`=All-in

### 6.4 摊牌展示

- 摊牌时亮出：赢家手牌 + 所有**未弃牌**玩家手牌（弃牌玩家保持牌背）
- 赢家最佳 5 张高亮（金色边框或加亮效果）
- 底池金额飞向赢家座位（文字动画即可，无需复杂 Framer Motion）
- 手牌结束后**不自动推进**，宿主座位旁出现「开始下一手」按钮
- 非宿主玩家看到「等待房主开始下一手…」提示

### 6.5 补码流程

- 玩家筹码归零后，座位显示「筹码已用完」标记，该玩家自动跳过后续手牌
- **宿主在 HostPanel 中**可看到每位玩家的补码次数，点击「+补码」为该玩家添加初始筹码金额
- 补码次数达上限后，「+补码」按钮灰显不可点击

### 6.6 HostPanel

- 始终悬浮显示在宿主设备上（右上角或底部抽屉）
- 内容：
  - 暂停/恢复按钮
  - 「开始下一手」按钮（仅摊牌结束后显示）
  - 玩家列表：每人显示昵称 + 筹码 + 已补码次数 + 「踢出」按钮 + 「+补码」按钮
  - 「邀请」按钮（弹出二维码 + 房间码）

---

## 7. 消息协议（DataChannel JSON）

所有消息均为 JSON 字符串，通过 WebRTC DataChannel 传输。

### 7.1 宿主 → 客户端

```typescript
// 完整房间状态快照（连接成功 / 每次状态变更后下发）
type HostToClient =
  | {
      type: 'room:state'
      payload: {
        roomId: string
        config: RoomConfig
        seats: SeatView[]          // 每个座位的公开信息
        pot: number
        sidePots: SidePot[]
        board: Card[]              // 公共牌
        phase: Phase               // preflop | flop | turn | river | showdown | waiting
        currentSeatIndex: number | null
        timeoutAt: number | null   // 行动截止时间戳
        holeCards: Card[]          // 仅含该玩家自己的手牌（宿主本地直接读）
        winners: WinnerInfo[] | null
        isPaused: boolean
      }
    }
  | { type: 'room:error'; payload: { code: string; message: string } }
  | { type: 'host:kick'; payload: { reason: string } }  // 被踢时收到

// SeatView 不含他人底牌
type SeatView = {
  seatIndex: number
  playerId: string
  nickname: string
  chips: number
  currentBet: number
  status: 'active' | 'folded' | 'allin' | 'sitout' | 'empty'
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  timeoutCount: number
}
```

### 7.2 客户端 → 宿主

```typescript
type ClientToHost =
  | { type: 'player:join'; payload: { nickname: string } }
  | { type: 'player:ready' }
  | {
      type: 'game:action'
      payload: {
        actionId: string   // nanoid，宿主去重用
        action: 'fold' | 'check' | 'call' | 'raise' | 'allin'
        amount?: number    // raise 时必填
      }
    }

// 宿主专用（宿主在本地直接调用，不经过 DataChannel）
type HostAction =
  | { type: 'host:start' }
  | { type: 'host:pause' }
  | { type: 'host:resume' }
  | { type: 'host:kick'; payload: { peerId: string } }
```

---

## 8. 目录结构

```
apps/web-only/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── engine/                  # 复制自 packages/engine/src/，去掉 node:crypto
    │   ├── deck.ts
    │   ├── evaluator.ts
    │   ├── betting.ts
    │   ├── sidepots.ts
    │   ├── handState.ts
    │   └── index.ts
    ├── peer/
    │   ├── hostPeer.ts          # 宿主 PeerJS 逻辑：管理连接、分发状态、接收行动
    │   ├── clientPeer.ts        # 客户端 PeerJS 逻辑：连接宿主、发送行动
    │   └── protocol.ts          # 消息类型定义（TypeScript discriminated union）
    ├── store/
    │   ├── useHostStore.ts      # 宿主：引擎状态 + peer 连接映射
    │   └── useClientStore.ts    # 客户端：接收到的房间视图状态
    ├── pages/
    │   ├── Home.tsx             # 首页：创建房间 / 加入房间
    │   └── Game.tsx             # 游戏主界面（宿主/客户端共用，通过角色区分渲染）
    └── components/
        ├── Table.tsx            # 椭圆形牌桌布局
        ├── Seat.tsx             # 单个座位（头像、筹码、手牌、状态标识）
        ├── Card.tsx             # 扑克牌（正面/背面，四色花色）
        ├── ActionBar.tsx        # 行动区：Fold/Check/Call/Raise/All-in + 加注滑块
        ├── PotDisplay.tsx       # 底池 + 边池展示
        ├── TimerBar.tsx         # 倒计时进度条
        ├── RoomCodeDialog.tsx   # 房间码 + 二维码展示（宿主视图）
        ├── JoinDialog.tsx       # 加入房间输入框
        └── HostPanel.tsx        # 宿主控制面板（暂停/恢复/踢人）
```

---

## 9. 数据流

```
宿主本地行动              客户端行动
     │                        │
     ▼                        ▼ DataChannel
useHostStore          hostPeer.ts 接收 client:action
     │                        │
     └──────────► 引擎 applyAction(state, action)
                        │
                        ▼
                  新的 HandState
                        │
              宿主过滤 → 生成各玩家视图
                        │
               ┌────────┼────────┐
               ▼        ▼        ▼
          Peer A 视图  Peer B 视图  宿主本地视图
          (DataChannel 发送)    (直接更新 store)
```

---

## 10. 工程约束

1. **类型安全**：TypeScript strict mode，所有消息 payload 精确 typed，不使用 `any`
2. **宿主权威**：所有下注合法性校验、发牌、边池计算只在宿主浏览器执行
3. **手牌隐私**：`holeCards` 在宿主向客户端发送 `room:state` 时按 peerId 过滤，绝不广播全部底牌
4. **消息去重**：宿主对 `game:action` 的 `actionId` 做去重，防止客户端重发
5. **单文件产物**：`dist/index.html` 必须是自包含的（内联所有 JS/CSS），无外部依赖
6. **无 console.log**：生产构建移除所有调试输出（Vite `esbuild.drop: ['console']`）

---

## 11. 限制与注意事项

| 限制 | 说明 |
|------|------|
| **需要基本互联网** | PeerJS 公共信令服务器（`0.peerjs.com`）用于 WebRTC 握手，热点需能访问外网 |
| **完全离线热点** | 需在局域网内自建 PeerJS server（`npm i peer -g && peerjs --port 9000`），并在构建配置中指定信令地址 |
| **无断线重连** | WebRTC 连接断开后座位即释放，需重新加入并等待宿主开下一手 |
| **无持久化** | 宿主关闭页面游戏数据消失，无法恢复 |
| **宿主不能关页面** | 宿主是所有游戏逻辑的权威节点，关闭标签页即解散房间 |
| **浏览器兼容性** | 需要支持 WebRTC 的现代浏览器（Chrome 80+、Safari 14+、Firefox 78+） |

---

## 12. 分阶段实现 Prompt

> 使用方式：将每阶段 Prompt 喂给 AI 编码助手，每阶段完成后验收再继续。

---

### 阶段 1：项目骨架 + 引擎移植

**目标**：搭好 `apps/web-only/` 工程，引擎可在浏览器中跑通。

**Prompt**：

> 你是一位资深前端工程师。请在现有 pnpm monorepo 的 `apps/web-only/` 下创建一个纯前端德州扑克项目。
>
> **技术栈**：
> - React 18 + TypeScript + Vite
> - Tailwind CSS（深色主题，`#0f172a` 系）
> - `vite-plugin-singlefile`（最终打包为单一 `index.html`）
> - Zustand
> - PeerJS
> - `qrcode.react`
> - `nanoid`
>
> **任务**：
> 1. 创建 `apps/web-only/package.json`，依赖版本使用最新稳定版
> 2. 配置 `vite.config.ts`（接入 `vite-plugin-singlefile`，`build.target: 'esnext'`，`esbuild.drop: ['console']`）
> 3. 配置 Tailwind CSS 深色主题
> 4. 将 `packages/engine/src/` 的所有文件复制到 `apps/web-only/src/engine/`，并做以下修改：
>    - 将 `deck.ts` 中的 `cryptoRng()` 从 `node:crypto` 改为浏览器 `crypto.getRandomValues`
>    - 确保所有引擎文件无 Node.js 特有 API
> 5. 在 `src/peer/protocol.ts` 中定义完整的消息类型（`HostToClient` 和 `ClientToHost`），参考本文档第 6 节
> 6. 创建空壳 `src/main.tsx` 和 `index.html`，Vite dev server 能起来
> 7. 写一个简单的引擎 smoke test（在 console 中验证 `createDeck().length === 52`、洗牌后 52 张）
>
> **约束**：
> - TypeScript strict mode，`tsc --noEmit` 通过
> - 不依赖 `packages/engine` 的 workspace 引用，直接使用复制的本地文件
>
> 完成后输出：创建/修改的文件清单。

---

### 阶段 2：P2P 通信层 + 状态管理

**目标**：宿主和客户端能通过 WebRTC 建立连接，状态能正确分发。

**Prompt**：

> 已完成阶段 1（项目骨架 + 引擎移植）。现在实现 P2P 通信层。
>
> **任务**：
>
> 1. **`src/peer/hostPeer.ts`**
>    - 初始化 PeerJS Peer（随机 ID），注册连接监听
>    - 对每个连入的 client peer，记录 `peerId → playerId` 映射
>    - 接收 `player:join` 消息，分配座位，返回当前 `room:state`
>    - 接收 `game:action` 消息，做 actionId 去重，调用引擎 `applyAction`，之后向所有 peer 广播更新（各自过滤 holeCards）
>    - 对 peer 断开连接：释放座位，更新状态
>    - 导出 `useHostPeer()` hook，返回：`roomCode, isConnected, broadcastState, kickPeer`
>
> 2. **`src/peer/clientPeer.ts`**
>    - 连接到指定 roomCode（PeerID）
>    - 接收 `room:state` 更新 Zustand store
>    - 导出 `useClientPeer()` hook，返回：`connect(roomCode), sendAction(action), connectionStatus`
>
> 3. **`src/store/useHostStore.ts`**
>    - 存储：引擎 `HandState`、玩家列表（peerId → 座位信息）、房间配置、暂停状态
>    - 行动计时器（setTimeout），超时按规则自动执行（第 1 次：check/fold；第 2 次：sit-out）
>    - 导出：`createRoom(config)`, `startGame()`, `applyPlayerAction(peerId, action)`, `pauseGame()`, `resumeGame()`, `kickPlayer(peerId)`
>
> 4. **`src/store/useClientStore.ts`**
>    - 存储：从宿主接收到的 `RoomStateView`（含自己 holeCards）
>    - 导出：`roomState`, `myPlayerId`, `setRoomState(state)`
>
> **约束**：
> - `holeCards` 在 `hostPeer.ts` 发送时按 peerId 过滤，确保每个 peer 只收到自己的手牌
> - 所有消息类型从 `src/peer/protocol.ts` 导入，不重复定义
> - 宿主玩家自身的 `holeCards` 直接从 `useHostStore` 读取，不经过 DataChannel
>
> 完成后：能在两个浏览器标签页（一宿主一客户端）间建立连接，宿主控制台能打印客户端的 join 消息。

---

### 阶段 3：完整 UI 实现

**目标**：完整的可玩界面，两台设备打开 HTML 可完整走一局。

**Prompt**：

> 已完成阶段 1–2（引擎 + P2P 通信层）。现在实现完整 UI。参考需求文档 §6「UI 行为规范」严格实现以下行为。
>
> **视觉规范**：
> - 风格：极简现代，深色背景（`#0f172a` 系），扁平化牌面
> - 响应式：移动端优先（390px 基准），PC 兼容
> - 只做中文界面
>
> **页面与组件**：
>
> 1. **`pages/Home.tsx`**
>    - 两个入口：「创建房间」（宿主）和「加入房间」（客户端）
>    - 创建房间：输入昵称 + 弹窗配置（最大人数/小盲/大盲/初始筹码/最大补码次数/行动时限）→ 调用 `useHostStore.createRoom()`；**宿主自动作为第 1 名玩家入座 0 号位**
>    - 加入房间：输入昵称 + 输入 6 位房间码 → 调用 `useClientPeer.connect()`
>
> 2. **`pages/Game.tsx`**（宿主和客户端共用）
>    - 角色区分：`isHost` prop，影响渲染内容（宿主可看自己手牌、有 HostPanel）
>    - 包含 `<Table>`、`<ActionBar>`（轮到自己时显示在页面底部）、`<HostPanel>`（仅宿主）
>
> 3. **`components/Table.tsx`**
>    - 椭圆形深色牌桌，最多 9 个座位环绕排布
>    - **自己的座位固定在屏幕底部**，其他座位按顺时针从底部向上排列
>    - 中间显示：底池 + 边池（`<PotDisplay>`）+ 公共牌（`<Card>`）
>    - 等待阶段：座位上显示入座的玩家或「空位」占位；宿主座位旁显示「开始游戏」按钮（仅宿主可见，≥2 人入座时激活）
>    - 非宿主玩家在等待阶段看到「等待房主开始…」文字提示
>
> 4. **`components/Seat.tsx`**
>    - 显示：昵称 + 筹码 + 当前下注 + 庄家/SB/BB 标识 + 行动状态（弃牌灰化、all-in 红框、筹码归零显示「筹码已用完」）
>    - 自己的座位：游戏中显示手牌（`<Card>` 正面）
>    - 他人座位：游戏中仅显示牌背
>    - **摊牌阶段**：赢家 + 所有未弃牌玩家亮牌，赢家最佳 5 张高亮（金色边框）；弃牌玩家保持牌背
>
> 5. **`components/Card.tsx`**
>    - 扑克牌正面：rank + suit，花色彩色（♠♣黑，♥♦红）
>    - 牌背：深色花纹
>
> 6. **`components/ActionBar.tsx`**
>    - 仅当 `isMyTurn === true` 时展示（固定在屏幕底部）
>    - 按钮行：Fold / Check（灰显若不合法）/ Call（显示需跟注金额）/ Raise / All-in
>    - **Raise 交互**：点击 Raise 后从底部弹出 Bottom Sheet（半屏浮层），内含：
>      - 金额输入框（可键入数字）
>      - 横向滑块（min: 最小合法加注额，max: 全押金额）
>      - 快捷按钮：½ 底池、⅔ 底池、底池、全押
>      - 底部「确认加注」按钮 + 「取消」
>    - 键盘快捷键（PC）：`F`=Fold，`C`=Check/Call，`R`=打开 Raise Bottom Sheet，`A`=All-in
>
> 7. **`components/TimerBar.tsx`**
>    - 横向进度条，读取 `timeoutAt` 倒计时，剩余 < 10s 变红
>
> 8. **`components/RoomCodeDialog.tsx`**（浮层，右上角「邀请」按钮触发）
>    - 6 位房间码大字 + `<QRCodeSVG>` 组件
>    - 实时显示已连接玩家列表
>
> 9. **`components/HostPanel.tsx`**
>    - 仅宿主可见，悬浮右上角或底部抽屉
>    - 内容：
>      - 暂停/恢复按钮
>      - **「开始下一手」按钮**（仅在摊牌结束后 `phase === 'showdown_over'` 时显示）
>      - 玩家列表：每人显示昵称 + 筹码 + 已补码次数 + 「踢出」按钮 + 「+补码」按钮（达次数上限则灰显）
>      - 「邀请」按钮（弹出 `<RoomCodeDialog>`）
>
> **摊牌结束流程**：
> - 手牌结束后不自动推进
> - 宿主 HostPanel 显示「开始下一手」按钮
> - 非宿主玩家看到「等待房主开始下一手…」提示覆盖在 ActionBar 位置
> - 宿主点击后引擎重置，发下一手
>
> **约束**：
> - 他人 `<Seat>` 内不渲染任何底牌数值，只渲染牌背组件，即使 DOM 检查也看不到具体牌面
> - 所有颜色通过 Tailwind 类名，不 hardcode hex
> - `tsc --noEmit` + `eslint` 全绿
> - `pnpm build` 产出单一 `dist/index.html`，可直接双击打开
>
> 完成后：两台设备接入同一 WiFi，扫码加入，可完整走一局德州扑克。

---

## 13. 验收清单

### 12.1 工程

| # | 验收项 | 操作 | 预期 |
|---|--------|------|------|
| 1.1 | 构建成功 | `pnpm build` | `dist/index.html` 单文件，< 2MB |
| 1.2 | 类型检查 | `tsc --noEmit` | 0 错误 |
| 1.3 | 直接打开 | 双击 `dist/index.html` | 浏览器正确显示首页 |
| 1.4 | 局域网访问 | `python3 -m http.server` 在 `dist/` 内运行，手机访问 IP | 正常显示 |

### 12.2 连接流程

| # | 验收项 | 预期 |
|---|--------|------|
| 2.1 | 创建房间 | 展示 6 位房间码 + 可扫描二维码 |
| 2.2 | 加入房间 | 输入房间码后建立连接，宿主玩家列表更新 |
| 2.3 | 连接断开 | 客户端关闭标签页，宿主侧该玩家座位释放 |

### 12.3 游戏规则正确性

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 3.1 | 轮子顺子 | A-2-3-4-5 识别为顺子，且小于 2-3-4-5-6 |
| 3.2 | 边池正确 | A all-in 100，B all-in 300，C call 300 → 主池 300（三人），边池 400（BC） |
| 3.3 | 最小加注 | raise 到 100 后，下一次 raise 不能少于 200 |
| 3.4 | 全员 all-in | 全 all-in 后自动发完公共牌并摊牌 |
| 3.5 | 超时处理 | 第 1 次超时自动 check/fold，第 2 次自动 sit-out |

### 12.4 手牌隐私

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 4.1 | DataChannel 消息 | Chrome DevTools → Application → WebRTC，检查宿主发给 Peer A 的 `room:state` 中 `holeCards` 只含 A 自己的牌 |
| 4.2 | DOM 检查 | 检查他人座位 DOM，无任何牌面数值，只有牌背元素 |

### 12.5 端到端场景

**场景 A：完整一局**
```
1. 设备 1（宿主）打开 HTML → 创建 6 座房间，小盲/大盲 10/20，初始筹码 1000
2. 设备 2 扫码加入
3. 宿主点「开始游戏」
4. 完整打完 1 手：preflop → flop → turn → river → 摊牌
5. 断言：底池正确结算，赢家筹码增加，HostPanel 显示「开始下一手」，非宿主看到等待提示
6. 宿主点「开始下一手」，下一手正常发牌
```

**场景 B：all-in 边池**
```
1. 三人游戏，玩家 A 筹码 100，B 筹码 300，C 筹码 300
2. A all-in 100，B all-in 300，C call 300
3. 断言：主池 300（ABC 均可赢），边池 400（BC 可赢）
4. 摊牌后按牌力正确分配
```

---

**场景 C：补码流程**
```
1. 玩家 A 筹码归零，座位显示「筹码已用完」，A 被跳过后续手牌
2. 宿主打开 HostPanel → 找到玩家 A → 点「+补码」
3. 断言：玩家 A 筹码恢复为初始筹码金额，补码次数 +1
4. 补码次数达上限后，「+补码」按钮灰显不可点击
```

**场景 D：摊牌亮牌规则**
```
1. 三人走到摊牌，其中一人已弃牌
2. 断言：赢家亮牌，另一名未弃牌玩家亮牌，弃牌玩家保持牌背
3. 赢家最佳 5 张有金色高亮
```

---

*文档结束*
