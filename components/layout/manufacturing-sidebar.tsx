'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  ClipboardList,
  Factory,
  LayoutDashboard,
  UserCircle2,
  Menu,
  X,
} from 'lucide-react';
import LogoutButton from '@/components/features/auth/logout-button';
import type { Session } from 'next-auth';

const manufacturingNavGroups = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/manufacturing/dashboard', icon: LayoutDashboard },
      { name: 'Profile', href: '/manufacturing/profile', icon: UserCircle2 },
    ],
  },
  {
    title: 'Masters',
    items: [
      { name: 'Client Master', href: '/manufacturing/clients', icon: Building2 },
      { name: 'Manufacturing Units', href: '/manufacturing/units', icon: Factory },
      { name: 'Procurement Master', href: '/manufacturing/procurement', icon: ClipboardList },
      { name: 'Raw Materials', href: '/manufacturing/raw-materials', icon: ClipboardList },
      { name: 'Finished Goods', href: '/manufacturing/finished-goods', icon: Factory },
      { name: 'Waste Materials', href: '/manufacturing/waste-materials', icon: ClipboardList },
    ],
  },
] as const;

interface ManufacturingSidebarProps {
  session: Session | null;
}

export default function ManufacturingSidebar({ session }: ManufacturingSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="md:hidden absolute top-4 right-4 z-50 bg-white p-2 rounded-md shadow">
        <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle Menu">
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 h-full transform bg-slate-900 text-white transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-28 shrink-0 items-center px-6 border-b border-slate-800">
            {session?.user?.companyLogo ? (
              <img
                src={session.user.companyLogo}
                alt={`${session.user.companyName || 'Company'} Logo`}
                className="h-20 w-auto rounded-md object-contain"
              />
            ) : (
              <img src="/bharatgodam-logo.png" alt="BharatGodam Logo" className="h-20 w-auto" />
            )}
          </div>

          <div className="px-6 py-2 bg-blue-900/30 border-b border-slate-800">
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Manufacturing Mode</span>
          </div>

          <nav className="flex-1 space-y-4 px-4 py-6 overflow-y-auto no-scrollbar">
            {manufacturingNavGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`group flex items-center rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`mr-3 h-5 w-5 shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                        }`}
                      />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );
}
