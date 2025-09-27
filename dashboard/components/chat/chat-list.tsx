'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface ChatListItem {
  sessionId: string;
  customerName?: string;
  lastMessage?: string;
  status?: 'active' | 'offline' | 'pending';
  updatedAt?: string;
}

interface Props {
  items: ChatListItem[];
  selected?: string;
  onSelect(sessionId: string): void;
}

export function ChatList({ items, selected, onSelect }: Props) {
  const sorted = useMemo(() => items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [items]);
  return (
    <div className="space-y-2">
      {sorted.map((item) => (
        <button
          key={item.sessionId}
          onClick={() => onSelect(item.sessionId)}
          className={cn(
            'w-full rounded-lg border border-transparent bg-white p-3 text-left shadow-sm transition hover:border-kalp/20',
            selected === item.sessionId && 'border-kalp/40 bg-indigo-50'
          )}
        >
          <div className="flex items-center justify-between text-sm font-medium text-slate-900">
            <span>{item.customerName || 'Visitor'}</span>
            <span className="text-xs text-slate-400">{item.status}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 line-clamp-2">{item.lastMessage || 'No messages yet'}</div>
        </button>
      ))}
      {sorted.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No active chats</div>}
    </div>
  );
}
