import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { nanoid } from 'nanoid'
import { useClientStore } from '../store/useClientStore'
import type { HostToClient, ClientToHost } from './protocol'

let clientPeer: Peer | null = null
let hostConnection: DataConnection | null = null
let myPlayerId: string | null = null

export function connectToHost(roomCode: string, nickname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (clientPeer) {
      clientPeer.destroy()
      clientPeer = null
    }

    const store = useClientStore.getState()
    store.setConnectionStatus('connecting')

    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    })
    clientPeer = peer

    peer.on('open', () => {
      const conn = peer.connect(roomCode.toUpperCase(), { reliable: true })
      hostConnection = conn

      conn.on('open', () => {
        // 发送加入消息
        const joinMsg: ClientToHost = {
          type: 'player:join',
          payload: { nickname },
        }
        conn.send(JSON.stringify(joinMsg))
      })

      conn.on('data', (rawData) => {
        try {
          const msg = JSON.parse(rawData as string) as HostToClient
          handleHostMessage(msg, nickname, resolve, reject)
        } catch {
          // ignore
        }
      })

      conn.on('close', () => {
        useClientStore.getState().setConnectionStatus('disconnected')
        hostConnection = null
      })

      conn.on('error', () => {
        useClientStore.getState().setConnectionStatus('error', '连接失败')
        reject(new Error('连接失败'))
      })
    })

    peer.on('error', (err) => {
      useClientStore.getState().setConnectionStatus('error', err.message)
      reject(err)
    })

    // 连接超时
    setTimeout(() => {
      if (useClientStore.getState().connectionStatus === 'connecting') {
        useClientStore.getState().setConnectionStatus('error', '连接超时')
        reject(new Error('连接超时'))
      }
    }, 15000)
  })
}

let resolved = false

function handleHostMessage(
  msg: HostToClient,
  nickname: string,
  resolve: () => void,
  reject: (err: Error) => void
) {
  if (msg.type === 'host:kick') {
    useClientStore.getState().setConnectionStatus('disconnected', msg.payload.reason)
    disconnectFromHost()
    return
  }

  if (msg.type === 'room:error') {
    const store = useClientStore.getState()
    if (msg.payload.code === 'ROOM_FULL') {
      store.setConnectionStatus('error', msg.payload.message)
      if (!resolved) reject(new Error(msg.payload.message))
    }
    return
  }

  if (msg.type === 'room:state') {
    const store = useClientStore.getState()

    // 首次收到状态时设置 playerId（通过 seats 找到匹配 nickname 的玩家）
    if (!myPlayerId) {
      // 找到刚加入的座位（最新加入的同名玩家）
      const seat = msg.payload.seats.find(s => s.nickname === nickname)
      if (seat) {
        myPlayerId = seat.playerId
        store.setConnected(seat.playerId, nickname)
        if (!resolved) {
          resolved = true
          resolve()
        }
      }
    }

    store.setRoomState(msg.payload)
  }
}


export function sendGameAction(action: string, amount?: number) {
  if (!hostConnection?.open) return
  const msg: ClientToHost = {
    type: 'game:action',
    payload: {
      actionId: nanoid(8),
      action: action as 'fold' | 'check' | 'call' | 'raise' | 'allin',
      amount,
    },
  }
  hostConnection.send(JSON.stringify(msg))
}

export function disconnectFromHost() {
  if (hostConnection) {
    hostConnection.close()
    hostConnection = null
  }
  if (clientPeer) {
    clientPeer.destroy()
    clientPeer = null
  }
  myPlayerId = null
  resolved = false
  useClientStore.getState().disconnect()
}
