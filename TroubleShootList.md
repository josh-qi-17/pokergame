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
