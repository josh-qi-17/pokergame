# TroubleShootList

> 代码静态审查 + 运行时反馈综合记录，按严重程度分三级。每条记录包含：**位置 → 现象 → 根因 → 修复方向**。
>
> 最后更新：2026-04-27

---

## 问题概览

| 级别 | 数量 | 说明 |
|------|------|------|
| **P0** | 8 | 阻塞核心功能，直接导致不可用 |
| **P1** | 8 | 逻辑错误，在特定时序或场景下必现 |
| **P2** | 6 | 体验/维护缺陷，不影响核心流程 |

---

## P0 — 阻塞核心功能

### P0-1 创建房间后一直显示「连接中」

- **位置**：[`apps/web/src/store/useSocketStore.ts`](apps/web/src/store/useSocketStore.ts) 第 20–22 行 + [`apps/web/src/pages/Room.tsx`](apps/web/src/pages/Room.tsx) 第 42–44 行
- **现象**：从首页创建房间并跳转到 `/r/:roomId` 后，Room 页面一直显示「连接中…」加载态，无法进入加入房间流程。
- **根因**：
  - `useSocketStore` 的 `connect()` 方法**无论当前连接状态如何**，总是先 `set({ status: 'connecting' })`，再调用 `connectSocket()`。
  - 首页已成功建立 Socket 连接（`status === 'connected'`），跳转到 Room 后 `useEffect` 再次调用 `connect()`，Socket 客户端检测到已连接，**不会重复触发 `connect` 事件**。
  - 于是 `status` 被打为 `'connecting'` 后再也收不到 `connect` 回调，**永久停在 connecting**。
  - Room 页面第 163–167 行在 `status !== 'connected'` 时渲染「连接中…」遮罩，触发该 bug。

```
// useSocketStore.ts — 问题代码
connect: () => {
  set({ status: 'connecting' });   // ← 总是覆盖，已连接时触发 bug
  connectSocket();
},
```

- **修复方向**：在 `connect()` 内先检查 `socket.connected`，若已连接则直接 `set({ status: 'connected' })` 并返回，无需重复 `connectSocket()`。

---

### P0-2 socket 全局监听器被页面卸载意外移除

- **位置**：[`apps/web/src/pages/Room.tsx`](apps/web/src/pages/Room.tsx) 第 112–124 行
- **现象**：离开 Room 页面（或 React StrictMode 二次渲染）后，全局连接状态（`useSocketStore`）再也不会随 Socket 状态变化更新，后续所有页面连接指示永久错误，直到刷新。
- **根因**：
  - `socket.off('connect')` / `socket.off('disconnect')` **未传 handler 引用**，会移除该事件上**所有**已注册的监听器。
  - `useSocketStore` 在模块初始化时注册的 `connect` / `disconnect` / `connect_error` 处理器也一并被移除。
  - 此后即便 Socket 状态变化，store 的 `status` 字段也不再更新。

```
// Room.tsx cleanup — 问题代码
socket.off('connect');      // ← 移除了全部监听器，包括 store 的
socket.off('disconnect');
socket.off('room:state');
// ...
```

- **修复方向**：将每个事件的 handler 以具名函数存入 `useRef`，cleanup 时传入对应引用；或改为 `socket.off('connect', localHandler)` 的形式，确保只移除本组件注册的监听器。

---

### P0-3 两玩家同时坐下产生双 GameLoop

- **位置**：[`packages/server/src/socket.ts`](packages/server/src/socket.ts) 第 95–101 行
- **现象**：2 名玩家几乎同时点击「坐下」，游戏开始后定时器混乱、底池翻倍、手牌可能出现两手并发，服务器持续报错。
- **根因**：
  - `room:sit` 处理器在 `sitDown` 成功后检查 `room.phase === 'lobby' && !room.gameLoop` 来决定是否自动开局。
  - 该读取-判断-写入过程**没有 `room.mutex` 保护**，两个并发请求均可通过 `!room.gameLoop` 检查，各自 `new GameLoop(...)` 并调用 `startHand()`。
  - 两个 GameLoop 实例并发驱动引擎状态机，定时器交叉触发。

```
// socket.ts — 问题代码（无锁保护）
if (seated.length >= 2 && room.phase === 'lobby' && !room.gameLoop) {
  const gl = new GameLoop(room, emitToRoom, log);
  room.gameLoop = gl;          // ← 两个请求都能到达此处
  void gl.startHand();
}
```

- **修复方向**：将 `startGame` + `new GameLoop` + `startHand()` 整体放进 `room.mutex.acquire()` 临界区，并在赋值后立即二次校验 `room.gameLoop` 是否已被设置。

---

### P0-4 游戏结束后状态机卡死，无法再开新局

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 359–366 行
- **现象**：一局游戏因筹码耗尽或人数不足而结束后，后续玩家无论如何坐下都不会自动开局。
- **根因**：
  - `finishHand` 在 `seated.length < 2` 时只打印日志，**既不把 `room.phase` 改回 `'lobby'`，也不把 `room.gameLoop` 设为 `null`**。
  - `room:sit` 的自动开局条件是 `phase === 'lobby' && !room.gameLoop`，两个条件都永远不满足，状态机死锁。

```
// gameLoop.ts — 问题代码
if (seated.length >= 2) {
  setTimeout(() => { void this.startHand(); }, 3000);
} else {
  this.log.info(..., 'Not enough players, ending game');
  // ← 缺少：room.phase = 'lobby'; room.gameLoop = null;
}
```

- **修复方向**：在 else 分支中将 `room.phase` 回置为 `'lobby'`，并将 `room.gameLoop` 设为 `null`，恢复自动开局条件。

---

---

### P0-5 `myPlayerId` 从未写入客户端 Store，导致本玩家无法识别自身

- **位置**：[`packages/shared/src/protocol.ts`](packages/shared/src/protocol.ts) `RoomJoinResponse` + [`packages/server/src/socket.ts`](packages/server/src/socket.ts) 第 65 行 + [`apps/web/src/pages/Room.tsx`](apps/web/src/pages/Room.tsx) `joinRoom()` 函数
- **现象（对应用户反馈 1 & 3）**：
  - 本玩家坐下后，Table 组件无法高亮/识别哪个座位是「我」的。
  - 房主进入房间后 Header 的「房主控制」面板（`HostPanel`）始终不出现，无开局按钮。
- **根因**：
  - `RoomJoinResponse` 协议定义中只有 `{ ok, error }`，**没有 `playerId` 字段**，服务端虽然获得了 `playerId`，但 `cb({ ok: true })` 时把它丢弃。
  - 客户端 `joinRoom()` 收到成功响应后只调用 `setJoined(true)`，**从未调用 `roomStore.setMyPlayerId()`**。
  - `myPlayerId` 在 Store 中永久为 `null`。
  - `myPlayer = roomState.players.find(p => p.playerId === myPlayerId)` → `undefined`。
  - `isHost = myPlayer?.isHost ?? false` → 恒为 `false` → `HostPanel` 永远不渲染。

```typescript
// protocol.ts — 现状（缺少 playerId）
export interface RoomJoinResponse {
  ok: boolean;
  error?: string;
  // 缺少：playerId?: string;
}

// Room.tsx joinRoom() — 现状（丢弃 playerId）
socket.emit('room:join', {...}, res => {
  if (res.ok) {
    setJoined(true);
    // 缺少：roomStore.setMyPlayerId(res.playerId);
  }
});
```

- **修复方向**：
  1. `RoomJoinResponse` 增加 `playerId?: string` 字段。
  2. 服务端 `room:join` 处理器 `cb({ ok: true })` 改为 `cb({ ok: true, playerId: result.playerId })`。
  3. 客户端收到成功响应后调用 `roomStore.setMyPlayerId(res.playerId)`。

---

### P0-6 坐下/站起后房间内所有客户端状态不更新

- **位置**：[`apps/web/src/store/useRoomStore.ts`](apps/web/src/store/useRoomStore.ts) `applyRoomUpdate()` + [`packages/server/src/socket.ts`](packages/server/src/socket.ts) `room:sit` / `room:stand` 处理器
- **现象（对应用户反馈 1 & 2）**：
  - 玩家点击座位坐下后，牌桌上**本人的席位不出现**（或需要刷新才出现）。
  - 房主或其他已在房间的玩家，**无法实时看到新坐下的玩家**。
  - `seatedCount` 未更新，导致房主的「开始游戏」按钮判断错误。
- **根因**：
  - `room:sit` 成功后，服务端向房间广播 `room:update { type: 'player_sat', data: { playerId, seatIndex, seatedCount } }`。
  - 客户端 `applyRoomUpdate` 的 `switch` 没有 `player_sat`、`player_stood`、`player_kicked` 分支，全部落入 `default: return state`，**Store 数据原封不动，UI 不重渲染**。
  - 同理，`room:stand` 广播的 `player_stood` 也无人处理。

```typescript
// useRoomStore.ts — applyRoomUpdate switch（缺失关键分支）
switch (type) {
  case 'paused': ...
  case 'resumed': ...
  case 'game_action': ...
  case 'player_disconnected': ...
  case 'player_reconnected': ...
  case 'game_started': ...
  default: return state;   // ← player_sat / player_stood / player_kicked 全走这里
}
```

- **修复方向**：
  - 方案 A（精细更新）：在 `applyRoomUpdate` 中为 `player_sat`、`player_stood`、`player_kicked` 分别添加处理逻辑，用 `data` 中的信息增量更新 `roomState.players`。
  - 方案 B（全量同步，更可靠）：服务端在 `room:sit` / `room:stand` / `host:kick` 操作成功后，用 `io.to(roomId).emit('room:state', roomManager.getRoomState(roomId))` 向全房间广播完整状态快照，客户端 `onRoomState` 覆盖写入，无需处理增量逻辑。推荐此方案，避免增量累积错误。

---

### P0-7 新玩家加入后其他人收到 `player_reconnected` 而非完整状态，玩家列表不更新

- **位置**：[`packages/server/src/socket.ts`](packages/server/src/socket.ts) 第 59–63 行
- **现象（对应用户反馈 2）**：
  - 新玩家 B 通过链接进入房间时，房主 A 的界面上**不出现任何变化**（看不到 B 进入）。
  - 即便 B 随后坐下，由于 P0-6 的问题叠加，A 的 UI 依然无响应。
- **根因**：
  - 新玩家加入成功后，服务端向房间内其他人广播 `room:update { type: 'player_reconnected', data: { playerId, nickname } }`。
  - `applyRoomUpdate` 中 `player_reconnected` 分支仅将**已有玩家**的 `isConnected` 改为 `true`（用于处理断线重连）。
  - 对于**全新加入**的玩家，`roomState.players` 里根本没有这个 `playerId`，`map` 遍历找不到匹配项，**等于什么都没发生**。
  - 此外，`getRoomState` 只包含 `seatIndex >= 0` 的已就座玩家，即便修复了广播逻辑，未就座的新玩家也不会出现在 `room:state` 里。

```typescript
// socket.ts — room:join（仅广播 player_reconnected，语义不正确）
socket.to(payload.roomId).emit('room:update', {
  type: 'player_reconnected',      // ← 对新玩家而言这是错误的类型
  data: { playerId: result.playerId, nickname: payload.nickname },
});
```

- **修复方向**：
  - 新玩家加入后，直接向全房间广播 `room:state` 完整快照（与 P0-6 修复方案 B 统一），使所有人同步到最新的「已加入人数」。
  - 若保留增量更新，应新增 `player_joined` 事件类型，在 `applyRoomUpdate` 中以追加方式将新玩家加入 `roomState.players`（需 `getRoomState` 同时返回未就座玩家）。

---

---

### P0-8 同一设备以不同昵称进入房间时仍被识别为同一玩家

- **位置**：[`packages/server/src/roomManager.ts`](packages/server/src/roomManager.ts) `joinRoom()` 第 112 行
- **现象**：房主将房间链接分享给多人后，第二位玩家使用同一浏览器（或同一设备）打开链接、输入**不同昵称**加入房间时，服务端返回的仍是第一位玩家的 `playerId` 与信息，新玩家的昵称被忽略，导致房间内始终只有「第一位玩家」的身份。
- **根因**：
  - `joinRoom` 的重连判断逻辑只匹配 `deviceId`，**完全不校验昵称**：
    ```typescript
    const existing = [...room.players.values()].find(p => p.deviceId === deviceId);
    if (existing) {
      return { ok: true, playerId: existing.playerId }; // ← 直接返回旧玩家
    }
    ```
  - `deviceId` 存储于浏览器 `localStorage`，同一浏览器上所有标签页和会话共享同一个值。
  - 因此，同一台电脑（或同一浏览器）先后由不同玩家使用时，第二个人无论输入什么名字，都会被当作第一个人的重连请求处理。
- **修复方向**：将重连判断条件改为 `deviceId && nickname` 双重匹配：
  - 同设备 + 同昵称 → 视为断线重连，返回原有玩家记录。
  - 同设备 + **不同昵称** → 视为新玩家，创建独立的玩家条目。
  - 新玩家加入时，若同一 `deviceId` 下存在**已断线**的旧玩家，自动清理旧记录以释放其占用的座位，防止幽灵席位。

```typescript
// 修复后逻辑
const existing = [...room.players.values()].find(
  p => p.deviceId === deviceId && p.nickname === nickname,
);
if (existing) {
  existing.nickname = nickname;
  return { ok: true, playerId: existing.playerId };
}

// 清理同设备已断线的旧玩家（不同昵称）
const stalePlayer = [...room.players.values()].find(
  p => p.deviceId === deviceId && !p.isConnected,
);
if (stalePlayer) room.players.delete(stalePlayer.playerId);
```

---

## P1 — 逻辑错误

### P1-1 庄家位置从第三手起不再旋转

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 95–99 行
- **现象**：游戏进行到第三手时，庄家始终是座位号最小的玩家，盲注永远在同一位置。
- **根因**：`finishHand` 末尾将 `this.state = null`；`setTimeout` 回调触发 `startHand()` 时 `getDealerSeat()` 读 `this.state?.dealerSeat` 为 `undefined`，退化为 `seated[0].seatIndex`，庄家不旋转。
- **修复方向**：用一个独立实例变量 `private lastDealerSeat: number | null` 在每手结束时保存庄家位置，`getDealerSeat` 读该变量而非 `this.state`。

---

### P1-2 引擎异常后游戏软死锁

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 192–233 行
- **现象**：某次行动触发引擎内部错误后，当前手牌无限挂起，所有玩家看到的是停止响应的牌桌，行动按钮不消失也没有新提示。
- **根因**：`applyAndContinue` 的 `catch` 块**只打日志**，不重置 `turnTimer`，不调 `scheduleTurn()`，不向客户端广播 `error` 事件，手牌停在半更新状态。
- **修复方向**：catch 内补充错误广播（`emit('error', ...)`）并酌情调用 `scheduleTurn()` 重试或直接结束本手。

---

### P1-3 超时处理与玩家操作竞态

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 132–134 行
- **现象**：玩家在超时瞬间发出操作，可能出现：操作被拒（`NOT_YOUR_TURN`）但也被超时 fold、或同一手牌被推进两次。
- **根因**：`handleTimeout` 直接调 `applyAndContinue`，**未经过 `room.mutex`**；而 `game:action` 持有 mutex。两者在极近时序下可并发执行。
- **修复方向**：在 `handleTimeout` 内先 `acquire room.mutex`，取锁后检查 timer 是否仍有效，再操作状态；或使用布尔标记 `timerFired` 配合原子检查。

---

### P1-4 被踢玩家仍可继续操作

- **位置**：[`packages/server/src/roomManager.ts`](packages/server/src/roomManager.ts) 第 217–229 行 + [`packages/server/src/socket.ts`](packages/server/src/socket.ts) 第 192–234 行
- **现象**：房主踢出玩家后，被踢玩家仍可发 `game:action` 并被服务端正常处理。
- **根因**：`kickPlayer` 从 `room.players` 删除条目，但**未清理 `socketToPlayer` 映射**；`socket.ts` 里 `game:action` 通过 `getPlayerBySocket` 仍能找到该玩家，且 `room.players.get(playerId)` 可能因此失去校验。
- **修复方向**：`kickPlayer` 执行后同步从 `socketToPlayer` 删除被踢者的 socketId 条目，并主动 `io.to(socketId).disconnectSockets()` 断开其连接。

---

### P1-5 host:pause / host:resume 无权限校验

- **位置**：[`packages/server/src/socket.ts`](packages/server/src/socket.ts) 第 236–269 行
- **现象**：任意知道 roomId 的非房主客户端可以随意暂停或恢复游戏。
- **根因**：`host:pause` / `host:resume` 处理器**未校验调用者是否为房主**，与 `host:kick`（有鉴权）不一致。
- **修复方向**：复用 `host:kick` 的鉴权模式：取出当前 socket 对应的 player，验证其 `deviceId === room.hostDeviceId`，否则返回 `NOT_HOST` 错误。

---

### P1-6 断线重连后客户端收到过时房间快照

- **位置**：[`packages/server/src/roomManager.ts`](packages/server/src/roomManager.ts) 第 240–267 行
- **现象**：玩家断线重连后，客户端显示「大厅等待」状态，看不到正在进行的牌局（公共牌、底池、行动等）。
- **根因**：`getRoomState` 中 `game: null`、`currentBet: 0`、`status: 'waiting'` **全部写死**，即使 `room.phase === 'playing'` 且 `GameLoop` 有活跃手牌，也无法将真实对局状态序列化给重连客户端。
- **修复方向**：`getRoomState` 内读取 `room.gameLoop?.currentState`，将其转换为 `GameState` 类型后填入返回值，并更新 `players` 里每位玩家的 `currentBet`、`status`、`hasCards` 等字段。

---

### P1-7 底池均分时余数筹码丢失

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 284–293 行
- **现象**：多人平局时，底池金额无法整除人数，剩余若干筹码从账面消失。
- **根因**：`share = Math.floor(pot.amount / potWinners.length)`，余数 `pot.amount % potWinners.length` 无人领取。
- **修复方向**：将余数筹码分配给行动顺序最靠前的赢家（德州扑克通用规则），或至少累加到下一手底池。

---

### P1-8 行动倒计时进度条与实际超时不同步

- **位置**：[`apps/web/src/components/ActionBar.tsx`](apps/web/src/components/ActionBar.tsx) 第 22–24 行
- **现象**：房主将行动时限设为非 30 秒（如 10 秒或 60 秒）时，进度条消耗速度与实际超时不一致：10 秒局进度条走到约 1/3 时玩家已被系统处理；60 秒局进度条归零但玩家还有时间。
- **根因**：`const total = 30000` 写死，未读取服务端下发的实际 `timeoutSec`。
- **修复方向**：在 `GameTurnPayload` 中随 `timeoutAt` 一并下发 `totalMs`（`= config.timeoutSec * 1000`），或由前端从 `roomState.config.timeoutSec` 读取，替换硬编码值。

---

## P2 — 体验与维护缺陷

### P2-1 actionId 集合只增不减，存在内存泄漏

- **位置**：[`packages/server/src/gameLoop.ts`](packages/server/src/gameLoop.ts) 第 34 行
- **现象**：长时间运行（数十手牌后），`processedActionIds` 集合持续增大，无清理机制。
- **根因**：每次 `handleAction` 成功后将 `actionId` 加入 Set，但集合**从不清空**。
- **修复方向**：在每手牌开始（`startHand`）时清空 `processedActionIds`，因为跨手牌的 actionId 重复没有意义。

---

### P2-2 断线重连后显示旧昵称

- **位置**：[`packages/server/src/roomManager.ts`](packages/server/src/roomManager.ts) 第 111–114 行
- **现象**：玩家改名后断线重连，其他人仍看到旧昵称。
- **根因**：`joinRoom` 检测到同 `deviceId` 时直接返回已有 `playerId`，**未更新 `nickname` 字段**。
- **修复方向**：重连分支中补充 `existing.nickname = nickname`。

---

### P2-3 standUp 无并发保护

- **位置**：[`packages/server/src/roomManager.ts`](packages/server/src/roomManager.ts) 第 165–174 行
- **现象**：极端情况下，玩家快速站起再坐下时，`seatIndex` 写入顺序错乱，最终状态与预期不符。
- **根因**：`standUp` **不使用 `room.mutex`**，与持锁的 `sitDown` 并发时可能在同一座位产生竞态写。
- **修复方向**：`standUp` 同样使用 `room.mutex.acquire()` 包裹 `seatIndex = -1` 写入与持久化操作。

---

### P2-4 关闭聊天面板会移除全部 chat 监听器

- **位置**：[`apps/web/src/components/Chat.tsx`](apps/web/src/components/Chat.tsx) 第 23–29 行
- **现象**：点击关闭聊天面板后再打开，新消息不再出现（实际上一直不计入未读）；若将来其他组件也监听 `chat:message`，会被一并卸载。
- **根因**：`socket.off('chat:message')` **未传 handler 引用**，移除该事件上所有监听器。
- **修复方向**：将 handler 提取为具名函数，使用 `socket.off('chat:message', handler)` 精确卸载。

---

### P2-5 手牌引擎行动顺序隐含座位号上限为 8

- **位置**：[`packages/engine/src/handState.ts`](packages/engine/src/handState.ts) 第 340–346 行
- **现象**：若游戏配置 `seatsMax = 9` 且座位号从 0 开始，当前逻辑正常；但若座位编号存在偏移或超出 0–8 范围，行动顺序可能出错。
- **根因**：`(dealerSeat + i) % 9` 硬编码取模值 `9`，与实际 `seatsMax` 无关。
- **修复方向**：将 `9` 替换为 `players.length` 或 `seatsMax`，从传参动态获取。

---

### P2-6 手牌历史 API 无错误处理

- **位置**：[`packages/server/src/app.ts`](packages/server/src/app.ts) 第 24–27 行
- **现象**：若数据库中某条 HandHistory 的 `data` 字段损坏，`GET /api/rooms/:roomId/history` 接口直接抛出 500，前端手牌历史面板无法打开。
- **根因**：`JSON.parse(r.data)` 无 `try/catch` 保护，解析异常直接冒泡到 Fastify 错误处理层。
- **修复方向**：用 `try/catch` 包裹 `JSON.parse`，解析失败时跳过该条记录并记录日志，返回其余正常数据。

---

## 修复优先级建议

```
P0-1 → P0-2  （连接状态 bug，直接影响所有用户进房）
P0-3 → P0-4  （并发开局 & 状态机卡死，影响游戏完整性）
P1-1 → P1-2  （庄家错误 & 软死锁，核心游戏体验）
P1-3 → P1-4  （安全性：竞态 & 被踢后仍可操作）
P1-5          （安全性：权限漏洞）
P1-6 → P1-7 → P1-8  （重连、结算、UI 准确性）
P2-*          （体验优化，不阻塞发布）
```
