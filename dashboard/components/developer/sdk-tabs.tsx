'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface Props {
  tabs: Tab[];
}

export default function SDKTabs({ tabs }: Props) {
  const [active, setActive] = useState(tabs[0]?.id);
  const tab = tabs.find((item) => item.id === active) ?? tabs[0];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition hover:bg-slate-100',
              active === item.id ? 'bg-slate-100 text-kalp' : 'text-slate-600'
            )}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4 text-sm text-slate-700">{tab?.content}</div>
    </div>
  );
}
