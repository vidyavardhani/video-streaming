'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { ChatList, type ChatListItem } from '@/components/chat/chat-list';
import { MessagePanel } from '@/components/chat/message-panel';
import { CallPanel } from '@/components/chat/call-panel';
import { apiUrl } from '@/lib/utils';

interface ChatSessionResponse {
  chats: {
    sessionId: string;
    customer?: { name?: string };
    messages: { senderType: string; body: string; createdAt?: string }[];
    status: string;
    updatedAt: string;
  }[];
}

export default function ChatPage() {
  const token = typeof window === 'undefined' ? undefined : localStorage.getItem('agentToken') ?? '';
  const { socket, status } = useSocket('agent', { token });
  const [sessions, setSessions] = useState<ChatSessionResponse['chats']>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();

  useEffect(() => {
    fetch(`${apiUrl}/chat/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data: ChatSessionResponse) => setSessions(data.chats))
      .catch((error) => console.error('Failed to load chat history', error));
  }, [token]);

  useEffect(() => {
    if (!socket || !selectedSessionId) return;
    socket.emit('chat:join', { sessionId: selectedSessionId });
  }, [socket, selectedSessionId]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = ({ sessionId, message }: any) => {
      setSessions((prev) =>
        prev.map((chat) =>
          chat.sessionId === sessionId
            ? { ...chat, messages: [...chat.messages, message], updatedAt: new Date().toISOString() }
            : chat
        )
      );
    };
    const handleNewChat = (chat: any) => setSessions((prev) => [chat, ...prev]);

    socket.on('chat:message', handleNewMessage);
    socket.on('chat:new', handleNewChat);

    return () => {
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:new', handleNewChat);
    };
  }, [socket]);

  const selected = useMemo(() => sessions.find((chat) => chat.sessionId === selectedSessionId), [sessions, selectedSessionId]);

  const sendMessage = (body: string) => {
    if (!socket || !selectedSessionId) return;
    socket.emit('chat:message', { sessionId: selectedSessionId, body });
  };

  const listItems: ChatListItem[] = sessions.map((chat) => ({
    sessionId: chat.sessionId,
    customerName: chat.customer?.name,
    lastMessage: chat.messages[chat.messages.length - 1]?.body,
    status: chat.status === 'assigned' ? 'active' : 'pending',
    updatedAt: chat.updatedAt
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">Conversations</h2>
            <span className="text-xs text-slate-400">{status}</span>
          </div>
          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2">
            <ChatList items={listItems} selected={selectedSessionId} onSelect={setSelectedSessionId} />
          </div>
        </div>
        <CallPanel socket={socket} sessionId={selectedSessionId} />
      </div>
      <div className="lg:col-span-2 flex min-h-[70vh] flex-col">
        <MessagePanel sessionId={selectedSessionId} messages={selected?.messages ?? []} onSend={sendMessage} />
      </div>
    </div>
  );
}
