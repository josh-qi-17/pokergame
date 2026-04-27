import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@poker/shared';
import { getSocket } from '../socket.ts';
import { useRoomStore } from '../store/useRoomStore.ts';

const EMOJIS = ['😀', '😂', '🤣', '😎', '🤔', '😮', '😤', '😭', '🎉', '👏', '💪', '🙏', '👍', '👎', '❤️', '💰', '🃏', '🎲', '🤑', '🏆'];

interface ChatProps {
  roomId: string;
  playerId: string;
}

export default function Chat({ roomId, playerId }: ChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chat = useRoomStore(s => s.chat);
  const addChatMessage = useRoomStore(s => s.addChatMessage);
  const socket = getSocket();

  useEffect(() => {
    socket.on('chat:message', (msg: ChatMessage) => {
      addChatMessage(msg);
      if (!isOpen) setUnread(n => n + 1);
    });
    return () => { socket.off('chat:message'); };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, chat]);

  function sendMessage(content: string, type: 'text' | 'emoji') {
    if (!content.trim()) return;
    socket.emit('chat:send', { roomId, content: content.trim(), type });
    setInput('');
    setShowEmoji(false);
  }

  void playerId;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {isOpen && (
        <div className="w-72 h-80 bg-slate-900/95 border border-slate-700 rounded-xl flex flex-col shadow-2xl mb-2">
          <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">聊天</span>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chat.map(msg => (
              <div key={msg.id} className="text-xs">
                <span className="text-slate-400 font-medium">{msg.nickname}: </span>
                <span className={msg.type === 'emoji' ? 'text-xl' : 'text-slate-200'}>
                  {msg.content}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {showEmoji && (
            <div className="grid grid-cols-5 gap-1 p-2 border-t border-slate-700">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => sendMessage(emoji, 'emoji')}
                  className="text-lg hover:bg-slate-700 rounded p-1 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 p-2 border-t border-slate-700">
            <button
              onClick={() => setShowEmoji(v => !v)}
              className="text-lg hover:bg-slate-700 rounded p-1 transition-colors"
            >
              😀
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(input, 'text'); }}
              placeholder="发送消息…"
              className="flex-1 bg-slate-800 text-sm text-slate-200 rounded px-2 py-1 outline-none placeholder:text-slate-500"
              maxLength={100}
            />
            <button
              onClick={() => sendMessage(input, 'text')}
              disabled={!input.trim()}
              className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-2 py-1 transition-colors"
            >
              发送
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(v => !v)}
        className="relative w-12 h-12 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        <span className="text-xl">💬</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
