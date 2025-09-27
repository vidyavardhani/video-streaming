'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const priorities = ['Low', 'Medium', 'High', 'Urgent'];

interface Props {
  onCreate(payload: {
    subject: string;
    description: string;
    priority: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<void>;
}

export function TicketForm({ onCreate }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      subject: (data.get('subject') as string) ?? '',
      description: (data.get('description') as string) ?? '',
      priority: (data.get('priority') as string) ?? 'Medium',
      customerName: (data.get('customerName') as string) ?? undefined,
      customerEmail: (data.get('customerEmail') as string) ?? undefined
    };
    setLoading(true);
    await onCreate(payload);
    setLoading(false);
    event.currentTarget.reset();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-600">Subject</label>
        <input
          name="subject"
          required
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-kalp focus:outline-none focus:ring-2 focus:ring-kalp/40"
          placeholder="Issue summary"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Description</label>
        <textarea
          name="description"
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-kalp focus:outline-none focus:ring-2 focus:ring-kalp/40"
          placeholder="Describe the customer issue"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Priority</label>
          <select
            name="priority"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            defaultValue="Medium"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Customer name</label>
          <input
            name="customerName"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Visitor"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Customer email</label>
          <input
            name="customerEmail"
            type="email"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="customer@example.com"
          />
        </div>
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Creating…' : 'Create ticket'}
      </Button>
    </form>
  );
}
