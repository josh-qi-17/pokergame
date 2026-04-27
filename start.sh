#!/usr/bin/env bash
set -euo pipefail

# ─── 颜色 ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${CYAN}[poker]${NC} $*"; }
ok()   { echo -e "${GREEN}[poker]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[poker]${NC} ⚠ $*"; }
err()  { echo -e "${RED}[poker]${NC} ✗ $*" >&2; }

# ─── 项目根目录 ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}${BLUE}"
echo "  ╔═══════════════════════════════╗"
echo "  ║   🃏  德州扑克  PokerGame     ║"
echo "  ╚═══════════════════════════════╝"
echo -e "${NC}"

# ─── 查找 node ────────────────────────────────────────────────────────────────
find_node() {
  local candidates=(
    "$(which node 2>/dev/null || true)"
    "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"
    "/usr/local/bin/node"
    "/opt/homebrew/bin/node"
    "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin/node"
    "$HOME/.volta/bin/node"
  )
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

find_pnpm() {
  local candidates=(
    "$(which pnpm 2>/dev/null || true)"
    "$HOME/Library/pnpm/pnpm"
    "$HOME/.local/share/pnpm/pnpm"
    "/usr/local/bin/pnpm"
    "/opt/homebrew/bin/pnpm"
  )
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

NODE_BIN=$(find_node || true)
PNPM_BIN=$(find_pnpm || true)

if [[ -z "$NODE_BIN" ]]; then
  err "未找到 Node.js，请先安装 Node.js 20+"
  err "下载地址：https://nodejs.org/"
  exit 1
fi

if [[ -z "$PNPM_BIN" ]]; then
  warn "未找到 pnpm，正在自动安装…"
  curl -fsSL https://get.pnpm.io/install.sh | sh - 2>/dev/null || true
  PNPM_BIN=$(find_pnpm || true)
  if [[ -z "$PNPM_BIN" ]]; then
    err "pnpm 安装失败，请手动安装：https://pnpm.io/installation"
    exit 1
  fi
fi

NODE_DIR="$(dirname "$NODE_BIN")"
PNPM_DIR="$(dirname "$PNPM_BIN")"
export PATH="$NODE_DIR:$PNPM_DIR:$PATH"

NODE_VER=$("$NODE_BIN" --version 2>/dev/null)
PNPM_VER=$("$PNPM_BIN" --version 2>/dev/null)
ok "Node.js $NODE_VER  |  pnpm $PNPM_VER"

# ─── 环境变量 ─────────────────────────────────────────────────────────────────
ENV_FILE="packages/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "创建 $ENV_FILE …"
  cat > "$ENV_FILE" << 'EOF'
PORT=3001
DATABASE_URL=file:./dev.db
PUBLIC_URL=http://localhost:3001
NODE_ENV=development
EOF
  ok "环境变量文件已创建"
fi

# ─── 安装依赖 ─────────────────────────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
  log "首次运行，安装依赖（可能需要 1-2 分钟）…"
  "$PNPM_BIN" install --reporter=silent
  ok "依赖安装完成"
else
  log "检查依赖更新…"
  "$PNPM_BIN" install --reporter=silent 2>/dev/null || true
fi

# ─── 构建 shared 包 ───────────────────────────────────────────────────────────
if [[ ! -d "packages/shared/dist" ]]; then
  log "构建 @poker/shared …"
  "$PNPM_BIN" --filter @poker/shared build --reporter=silent
  ok "@poker/shared 构建完成"
fi

# ─── Prisma 生成 & 数据库迁移 ────────────────────────────────────────────────
log "初始化数据库…"
(
  cd packages/server
  # 确保 Prisma client 已生成
  if [[ ! -d "../../node_modules/.prisma" ]]; then
    "$PNPM_BIN" exec prisma generate --schema=prisma/schema.prisma 2>/dev/null || true
  fi
  # 执行迁移（非交互式）
  "$PNPM_BIN" exec prisma migrate deploy --schema=prisma/schema.prisma 2>/dev/null || \
  "$PNPM_BIN" exec prisma db push --schema=prisma/schema.prisma --accept-data-loss 2>/dev/null || \
  true
)
ok "数据库就绪"

# ─── 清理旧进程 ───────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "正在停止服务…"
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$WEB_PID"    2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  wait "$WEB_PID"    2>/dev/null || true
  ok "服务已停止，再见 👋"
  exit 0
}
trap cleanup INT TERM

# ─── 启动后端 ─────────────────────────────────────────────────────────────────
log "启动后端服务 (port 3001)…"
(
  cd packages/server
  "$PNPM_BIN" dev 2>&1 | sed "s/^/  ${BLUE}[server]${NC} /"
) &
SERVER_PID=$!

# 等待后端就绪
SERVER_READY=false
for i in $(seq 1 30); do
  sleep 1
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    SERVER_READY=true
    break
  fi
done

if [[ "$SERVER_READY" == false ]]; then
  err "后端启动超时，请检查日志"
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi
ok "后端服务已就绪 → http://localhost:3001"

# ─── 启动前端 ─────────────────────────────────────────────────────────────────
log "启动前端服务 (port 5173)…"
(
  cd apps/web
  "$PNPM_BIN" dev 2>&1 | sed "s/^/  ${GREEN}[web]${NC}    /"
) &
WEB_PID=$!

# 等待前端就绪
sleep 3

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  🃏  德州扑克已成功启动！${NC}"
echo ""
echo -e "  前端地址  →  ${BOLD}${CYAN}http://localhost:5173${NC}"
echo -e "  后端地址  →  ${BOLD}${CYAN}http://localhost:3001${NC}"
echo ""
echo -e "  使用方式："
echo -e "  1. 打开浏览器访问 ${CYAN}http://localhost:5173${NC}"
echo -e "  2. 输入昵称，创建房间"
echo -e "  3. 分享链接给朋友即可开玩"
echo ""
echo -e "  按 ${BOLD}Ctrl+C${NC} 停止所有服务"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─── 保持运行 ─────────────────────────────────────────────────────────────────
wait "$SERVER_PID" "$WEB_PID"
