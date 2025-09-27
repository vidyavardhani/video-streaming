'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BellIcon } from '@heroicons/react/24/outline';

export default function Topbar() {
  const [available, setAvailable] = useState(true);
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Agent Workspace</h1>
        <p className="text-sm text-slate-500">Manage chats, tickets, and calls in real time.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setAvailable((prev) => !prev)}>
          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: available ? '#22c55e' : '#f97316' }} />
          {available ? 'Available' : 'Away'}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <BellIcon className="h-5 w-5 text-slate-600" />
        </Button>
      </div>
    </header>
  );
}
