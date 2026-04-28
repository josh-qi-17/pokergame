# TroubleShoot List

记录开发过程中发现的问题，防止再次引入。

---

## 1. @vitejs/plugin-react 版本兼容性
- **问题**：`@vitejs/plugin-react@6.x` 需要 Vite 8+，在 Vite 6.x 中报错 `Package subpath './internal' is not defined`
- **解决**：使用 `@vitejs/plugin-react@4.3.4`（兼容 Vite 6.x）
- **文件**：`apps/web-only/package.json`

## 2. 筹码同步时序问题
- **问题**：手牌结束后 `seats.chips` 未从 `handState.players.chips` 同步，导致 `startNextHand` 叠加赢家奖金时基数错误
- **解决**：在 `applyPlayerAction` 检测到 `isFinished=true` 时，立即将 `handState.players[i].chips` 同步到 `seats`，再由 `startNextHand` 叠加 `winners[i].amount`
- **文件**：`apps/web-only/src/store/useHostStore.ts`

## 3. TypeScript strict 模式下 Rank 类型
- **问题**：evaluator.ts 中对 `number[]` 调用 `Array.includes(Rank)` 报类型错误（`number` 不能赋值给 `Rank`）
- **解决**：对字面量数组使用 `as Rank[]`，对 `includes` 参数添加 `as Rank` 断言
- **文件**：`apps/web-only/src/engine/evaluator.ts`

## 4. Heads-Up（2人局）盲注位置错误
- **问题**：`createHandState` 中 `sbIdx = (dealerIdx + 1) % n`，`bbIdx = (dealerIdx + 2) % n`，当 n=2 时 Dealer 变成 BB、非 Dealer 变成 SB，与德州扑克规则相反（规则要求 Dealer = SB，非 Dealer = BB）；翻前首家行动顺序也反了
- **解决**：在 `createHandState` 中检测 `n === 2` 时，令 sbIdx = dealerIdx（Dealer 自己是 SB），bbIdx = 对方；翻前首家 = sbIdx（Dealer/SB 先行动）
- **文件**：`apps/web-only/src/engine/handState.ts`

## 5. 只剩1人时底池结算遗漏当前街下注
- **问题**：`advanceTurn` 检测到只剩 1 人时直接调用 `collectPots` 标记结束，但未重新调用 `calculateSidePots` 将当前街 `currentStreetBet`（通过 `totalContributed`）结算进 `pots`，导致 `computeWinners` 中 `pots.reduce` 漏算当前轮下注金额
- **解决**：在 `collectPots` 中（或单人分支中）先调用 `calculateSidePots` 更新 pots
- **文件**：`apps/web-only/src/engine/handState.ts`

## 6. `findFirstActiveAfterDealer` 稀疏座位号查找不稳健
- **问题**：用 `(dealerSeat + i) % 9` 循环查找座位号，只循环 n（实际人数）次，当座位号稀疏分布时（如只有 3 人但座位号为 0,2,5）可能找不到正确的下一个玩家
- **解决**：改为按 seatIndex 排序后从 dealer 下一位循环遍历 players 数组
- **文件**：`apps/web-only/src/engine/handState.ts`

## 7. Burn card（烧牌）缺失
- **问题**：`advanceStreet` 中发 Flop/Turn/River 公共牌时没有先 burn（丢弃）一张牌，不符合标准德州扑克规则
- **解决**：在发公共牌之前先 `newDeck.shift()` 丢弃一张 burn card
- **文件**：`apps/web-only/src/engine/handState.ts`

## 8. `advanceStreet` 未排除 sitout 玩家
- **问题**：`advanceStreet` 中 `nonFolded = players.filter(p => p.status !== 'folded')` 未排除 sitout 状态玩家，导致 `allAllin` 判断可能错误（sitout 不是 allin 所以永远为 false）
- **解决**：过滤条件改为 `p.status !== 'folded' && p.status !== 'sitout'`
- **文件**：`apps/web-only/src/engine/handState.ts`

## 9. `resumeGame` 重置完整超时而非恢复剩余时间
- **问题**：暂停后恢复游戏时 `scheduleTimeout()` 重新设置完整的 `config.timeoutSec` 倒计时，而非使用暂停前剩余的时间，对当前行动玩家不公平
- **解决**：新增 `pausedRemainingMs` 状态，`pauseGame` 时记录剩余时间，`resumeGame` 时使用该值
- **文件**：`apps/web-only/src/store/useHostStore.ts`

## 10. Post-flop 街首位玩家过牌即结束本街（严重 bug）
- **问题**：`isStreetComplete` 中 `if (state.lastRaiserIndex < 0) return true` 错误地立即结束本街。新街开始时 `lastRaiserIndex = -1`、所有人 `currentStreetBet = 0`，导致 Flop/Turn/River 第一个玩家过牌后系统直接发下一张公共牌，跳过其他玩家行动机会，严重违反德扑规则
- **首版方案（已废弃）**：引入 `streetFirstActIndex` 字段并通过 `findNextActivePlayer === streetFirstActIndex` 判断行动是否绕回一圈
- **首版的边界缺陷**：当 `streetFirstActIndex` 玩家在本街第一个动作就弃牌时，`findNextActivePlayer` 会跳过该已弃牌索引，闭环条件永不成立，行动陷入死循环（其他玩家被反复询问）
- **最终方案**：采用标准扑克引擎做法 `playersToAct: string[]`（待行动玩家集合）：
  - `createHandState` 与 `advanceStreet`（post-flop）初始化为所有 `active` 玩家的 playerId
  - `applyAction`：fold/check/call/短全下从集合中移除自己；raise/全下达到最小加注则重置为「除自己外的所有 active 玩家」
  - `isStreetComplete` 简化为 `allMatched && playersToAct.length === 0`
  - 同时移除原来基于 `lastRaiserIndex` 与 `lastRaiserActedVoluntarily` 的 BB option 闭环判断（被 playersToAct 覆盖）
- **文件**：`apps/web-only/src/engine/handState.ts`
