import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { QRCodeSVG } from 'qrcode.react';

interface ShareDialogProps {
  roomId: string;
}

export default function ShareDialog({ roomId }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${roomId}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">
          分享房间
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-slate-700 rounded-2xl p-6 z-50 w-80 shadow-2xl">
          <Dialog.Title className="text-lg font-bold text-white mb-4 text-center">邀请好友</Dialog.Title>

          <div className="flex justify-center mb-4 p-3 bg-white rounded-xl">
            <QRCodeSVG value={url} size={180} />
          </div>

          <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-2 mb-4">
            <span className="flex-1 text-xs text-slate-300 truncate">{url}</span>
            <button
              onClick={copy}
              className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors shrink-0"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          <Dialog.Close asChild>
            <button className="w-full text-sm text-slate-400 hover:text-slate-200 transition-colors">关闭</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
