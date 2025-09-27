'use client';

import { useMemo } from 'react';

const mockData = [
  { label: '09:00', chats: 12, tickets: 5 },
  { label: '11:00', chats: 22, tickets: 8 },
  { label: '13:00', chats: 18, tickets: 6 },
  { label: '15:00', chats: 25, tickets: 11 },
  { label: '17:00', chats: 14, tickets: 4 }
];

export default function AnalyticsTimeline() {
  const max = useMemo(() => Math.max(...mockData.map((item) => Math.max(item.chats, item.tickets))), []);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-slate-900">Engagement timeline</h3>
        <span className="text-xs text-slate-400">Today</span>
      </div>
      <div className="mt-6 space-y-4">
        {mockData.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>{item.label}</span>
              <span>{item.chats} chats · {item.tickets} tickets</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-kalp"
                style={{ width: `${(item.chats / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
