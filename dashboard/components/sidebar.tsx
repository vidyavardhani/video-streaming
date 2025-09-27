'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChatBubbleLeftIcon, Cog6ToothIcon, HomeIcon, PhoneIcon, TicketIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

const links = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/chat', label: 'Chat', icon: ChatBubbleLeftIcon },
  { href: '/ticketing', label: 'Ticketing', icon: TicketIcon },
  { href: '/developer', label: 'Developer', icon: WrenchScrewdriverIcon },
  { href: '/settings', label: 'Settings', icon: Cog6ToothIcon }
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white p-6 md:flex">
      <div className="mb-8 flex items-center gap-2">
        <PhoneIcon className="h-6 w-6 text-kalp" />
        <span className="text-lg font-semibold">KalpOrg Support</span>
      </div>
      <nav className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100',
                active ? 'bg-slate-100 text-kalp' : 'text-slate-600'
              )}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
