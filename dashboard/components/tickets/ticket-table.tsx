'use client';

interface Ticket {
  _id: string;
  subject: string;
  status: 'Open' | 'Pending' | 'Hold' | 'Closed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  customer?: { name?: string; email?: string };
  updatedAt: string;
}

interface Props {
  tickets: Ticket[];
  onStatusChange(id: string, status: Ticket['status']): void;
}

const statuses: Ticket['status'][] = ['Open', 'Pending', 'Hold', 'Closed'];

export function TicketTable({ tickets, onStatusChange }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Subject</th>
            <th className="px-4 py-3 text-left">Customer</th>
            <th className="px-4 py-3 text-left">Priority</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => (
            <tr key={ticket._id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{ticket.subject}</td>
              <td className="px-4 py-3 text-slate-600">
                <div>{ticket.customer?.name || 'Unknown'}</div>
                <div className="text-xs text-slate-400">{ticket.customer?.email}</div>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{ticket.priority}</span>
              </td>
              <td className="px-4 py-3 text-slate-600">{ticket.status}</td>
              <td className="px-4 py-3 text-right">
                <select
                  className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs"
                  value={ticket.status}
                  onChange={(event) => onStatusChange(ticket._id, event.target.value as Ticket['status'])}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                No tickets yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
