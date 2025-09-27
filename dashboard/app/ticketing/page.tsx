'use client';

import { useEffect, useState } from 'react';
import { TicketTable } from '@/components/tickets/ticket-table';
import { TicketForm } from '@/components/tickets/ticket-form';
import { apiUrl } from '@/lib/utils';

interface Ticket {
  _id: string;
  subject: string;
  status: 'Open' | 'Pending' | 'Hold' | 'Closed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  customer?: { name?: string; email?: string };
  updatedAt: string;
}

export default function TicketingPage() {
  const token = typeof window === 'undefined' ? undefined : localStorage.getItem('agentToken') ?? '';
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const loadTickets = () => {
    if (!token) return;
    fetch(`${apiUrl}/ticket/list`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets))
      .catch((error) => console.error('Failed to load tickets', error));
  };

  useEffect(() => {
    loadTickets();
  }, [token]);

  const createTicket = async (payload: any) => {
    if (!token) return;
    await fetch(`${apiUrl}/ticket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject: payload.subject,
        description: payload.description,
        priority: payload.priority,
        customer: { name: payload.customerName, email: payload.customerEmail }
      })
    });
    loadTickets();
  };

  const changeStatus = async (id: string, status: Ticket['status']) => {
    if (!token) return;
    await fetch(`${apiUrl}/ticket/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    setTickets((prev) => prev.map((ticket) => (ticket._id === id ? { ...ticket, status } : ticket)));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Ticket queue</h2>
        <TicketTable tickets={tickets} onStatusChange={changeStatus} />
      </div>
      <div className="lg:col-span-1">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Create ticket</h3>
          <p className="text-xs text-slate-500">Convert feedback or escalations into actionable tickets.</p>
          <div className="mt-4">
            <TicketForm onCreate={createTicket} />
          </div>
        </div>
      </div>
    </div>
  );
}
