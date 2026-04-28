import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { useHostStore } from '../store/useHostStore'
import type { HostToClient, ClientToHost } from './protocol'
import { legalActions } from '../engine'

// 宿主 Peer 单例
let hostPeer: Peer | null = null
const connections = new Map<string, DataConnection>() // peerId -> connection

// 广播状态到所有已连接的客户端（各自过滤 holeCards）
export function broadcastState() {
  const store = useHostStore.getState()
  connections.forEach((conn, peerId) => {
    if (conn.open) {
      const payload = store.getRoomStateFor(peerId)
      const msg: HostToClient = { type: 'room:state', payload }
      conn.send(JSON.stringify(msg))
    }
  })
}

export function sendToClient(peerId: string, msg: HostToClient) {
  const conn = connections.get(peerId)
  if (conn?.open) conn.send(JSON.stringify(msg))
}

export function kickPeer(peerId: string, reason = '您已被踢出房间') {
  const conn = connections.get(peerId)
  if (conn) {
    const msg: HostToClient = { type: 'host:kick', payload: { reason } }
    conn.send(JSON.stringify(msg))
    setTimeout(() => conn.close(), 200)
  }
  connections.delete(peerId)
  useHostStore.getState().removePlayer(peerId)
  broadcastState()
}

export function initHostPeer(roomId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (hostPeer) {
      hostPeer.destroy()
      hostPeer = null
    }
    connections.clear()

    // 使用 roomId 作为 PeerJS 的 peer ID
    const peer = new Peer(roomId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    })
    hostPeer = peer

    peer.on('open', id => {
      resolve(id)
    })

    peer.on('error', err => {
      reject(err)
    })

    peer.on('connection', (conn) => {
      const peerId = conn.peer
      connections.set(peerId, conn)

      conn.on('open', () => {
        // 发送当前房间状态给新连接的客户端
        const store = useHostStore.getState()
        const payload = store.getRoomStateFor(peerId)
        const msg: HostToClient = { type: 'room:state', payload }
        conn.send(JSON.stringify(msg))
      })

      conn.on('data', (rawData) => {
        try {
          const msg = JSON.parse(rawData as string) as ClientToHost
          handleClientMessage(peerId, msg)
        } catch {
          // ignore malformed messages
        }
      })

      conn.on('close', () => {
        connections.delete(peerId)
        const store = useHostStore.getState()
        // 游戏进行中的玩家断线处理
        if (store.phase === 'playing' && store.handState) {
          const seat = store.seats.find(s => s.peerId === peerId)
          if (seat && store.handState) {
            const currentPlayer = store.handState.players[store.handState.currentPlayerIndex]
            if (currentPlayer?.playerId === seat.playerId) {
              // 当前行动玩家断线，自动 fold
              store.applyPlayerAction(seat.playerId, 'fold')
              broadcastState()
            }
          }
        }
        store.removePlayer(peerId)
        broadcastState()
      })

      conn.on('error', () => {
        connections.delete(peerId)
      })
    })
  })
}

function handleClientMessage(peerId: string, msg: ClientToHost) {
  const store = useHostStore.getState()

  if (msg.type === 'player:join') {
    const { nickname } = msg.payload
    const playerId = store.addPlayer(peerId, nickname)
    if (!playerId) {
      sendToClient(peerId, {
        type: 'room:error',
        payload: { code: 'ROOM_FULL', message: '房间已满' },
      })
      return
    }
    broadcastState()
    return
  }

  if (msg.type === 'game:action') {
    const { actionId, action, amount } = msg.payload
    const seat = store.seats.find(s => s.peerId === peerId)
    if (!seat) return
    if (!store.handState) return

    const currentPlayer = store.handState.players[store.handState.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.playerId !== seat.playerId) return

    const legal = legalActions(store.handState, seat.playerId)
    const legalTypes = legal.map(l => l.type)
    if (!legalTypes.includes(action)) {
      sendToClient(peerId, {
        type: 'room:error',
        payload: { code: 'ILLEGAL_ACTION', message: '非法行动' },
      })
      return
    }

    const success = store.applyPlayerAction(seat.playerId, action, amount, actionId)
    if (success) broadcastState()
    return
  }
}

export function destroyHostPeer() {
  if (hostPeer) {
    hostPeer.destroy()
    hostPeer = null
  }
  connections.clear()
}

export function getConnectedPeerIds(): string[] {
  return [...connections.keys()]
}
