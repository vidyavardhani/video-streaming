'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface MessagePanelProps {
  sessionId?: string;
  messages: { senderType: string; body: string; createdAt?: string }[];
  onSend(message: string): void;
}

export function MessagePanel({ sessionId, messages, onSend }: MessagePanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = inputRef.current?.value?.trim();
    if (!value) return;
    onSend(value);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (!sessionId) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Select a conversation to begin</div>;
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={
              message.senderType === 'agent'
                ? 'ml-auto max-w-lg rounded-2xl bg-kalp px-4 py-2 text-sm text-white'
                : 'max-w-lg rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800'
            }
          >
            {message.body}
          </div>
        ))}
        {messages.length === 0 && <div className="text-center text-xs text-slate-500">No messages yet</div>}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <textarea
          ref={inputRef}
          className="h-24 flex-1 resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-kalp focus:outline-none focus:ring-2 focus:ring-kalp/40"
          placeholder="Type your reply..."
        />
        <Button type="submit" className="self-end">
          Send
        </Button>
      </form>
    </div>
  );
}
