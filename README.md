# PokerGame

本项目是一个 **WebOnly 德州扑克（No Limit Texas Hold'em）** 实现，面向本地朋友局场景。  
核心特点是：**纯前端、无后端、单 HTML 交付、WebRTC P2P 联机**。

## 当前项目状态

- 已实现可玩 MVP：创建房间、扫码/房间码加入、完整一手牌流程、结算、下一手推进
- 已支持 2-9 人桌、盲注、边池、全下、超时自动行动、补码、踢人、暂停/恢复
- 近期已完成规则对齐修复（基于 `PokerRule.md`）
  - Heads-Up 盲注与翻前顺序修正
  - Burn card 发牌流程补齐
  - Post-flop 行动轮闭环逻辑重构为 `playersToAct`
  - 单人剩余时底池结算缺失修复
  - 暂停恢复计时改为“恢复剩余时间”

## 技术栈

- React 18 + TypeScript
- Vite + `vite-plugin-singlefile`
- Zustand
- PeerJS（WebRTC DataChannel）
- Tailwind CSS

## 目录结构（核心）

```text
PokerGame/
├── apps/web-only/
│   ├── src/engine/            # 德扑规则与结算引擎
│   ├── src/store/             # 宿主/客户端状态管理
│   ├── src/peer/              # P2P 通信协议与连接层
│   └── dist/index.html        # WebOnly 打包产物（单文件）
├── PokerGame_WebOnly.html     # 根目录可直接分发的单文件版本
├── PokerGame_WebOnly.md       # 中文需求与实现文档
├── PokerRule.md               # 英文德州扑克完整规则文档
└── TroubleShootList.md        # 问题与修复记录
```

## 快速开始

### 开发调试

```bash
cd apps/web-only
pnpm install
pnpm dev
```

### 构建单文件产物

```bash
cd apps/web-only
pnpm build
```

构建后主产物为：

- `apps/web-only/dist/index.html`

同时仓库根目录维护了分发文件：

- `PokerGame_WebOnly.html`

## 联机与玩法流程（简版）

1. 宿主打开页面，创建房间（昵称 + 规则配置）
2. 宿主分享 6 位房间码或二维码
3. 其他玩家加入并入座
4. 宿主开始游戏，进入 Pre-flop -> Flop -> Turn -> River -> Showdown
5. 手牌结束后由宿主手动开始下一手

## 规则实现说明

项目规则目标是与标准 No Limit Texas Hold'em 对齐，详见：

- `PokerRule.md`（英文版完整规则）
- `PokerGame_WebOnly.md`（中文需求与实现约束）

关键规则点（当前版本）：

- Pre-flop / Post-flop 行动顺序正确
- 最小加注规则正确
- 短码 all-in 不错误重开行动
- 多档位 all-in 的主池/边池分配正确
- A-2-3-4-5（wheel）顺子与踢脚比较正确

## 已知限制

- 宿主浏览器是权威节点，宿主关闭页面即房间结束
- 默认依赖 PeerJS 公共信令服务（握手阶段需要外网）
- 暂无断线重连、持久化、聊天与观战模式

## 文档索引

- 需求与实现总文档：`PokerGame_WebOnly.md`
- 规则文档（英文）：`PokerRule.md`
- 问题清单：`TroubleShootList.md`