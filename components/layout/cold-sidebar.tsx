'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FileText, Menu, X, Settings, Package, Box, ArrowDownToLine, ArrowUpFromLine, ClipboardList, Globe, Grid, ArrowRightLeft, Layers } from 'lucide-react';
import LogoutButton from '@/components/features/auth/logout-button';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import type { Session } from 'next-auth';
import { canViewMenu, PermissionModule } from '@/lib/permissions';

type NavItem = {
  name: string;
  translationKey: string;
  href: string;
  icon: any;
  module?: PermissionModule;
  adminOnly?: boolean;
};

const coldNavItems: NavItem[] = [
  { name: 'Dashboard', translationKey: 'sidebar.dashboard', href: '/cold/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Profile', translationKey: 'sidebar.profile', href: '/cold/profile', icon: Settings },
  { name: 'Warehouse Master', translationKey: 'sidebar.warehouse', href: '/cold/warehouses', icon: Box, module: 'warehouse' },
  { name: 'Environment Records', translationKey: 'sidebar.environmentRecords', href: '/cold/environment-records', icon: Box, module: 'environmentRecords' },
  { name: 'Floor Mapping', translationKey: 'floorMapping.title', href: '/cold/floor-mapping', icon: Grid, module: 'floorMapping' },
  { name: 'Commodity Master', translationKey: 'sidebar.commodities', href: '/cold/commodities', icon: Package, module: 'commodity' },
  { name: 'Unit Master', translationKey: 'sidebar.unitMaster', href: '/cold/units', icon: Layers, adminOnly: true },
  { name: 'Client Master', translationKey: 'sidebar.clientMaster', href: '/cold/clients', icon: Users, module: 'clientMaster' },
  { name: 'Inward Transaction', translationKey: 'sidebar.inward', href: '/cold/inward', icon: ArrowDownToLine, module: 'inward' },
  { name: 'Outward Transaction', translationKey: 'sidebar.outward', href: '/cold/outward', icon: ArrowUpFromLine, module: 'outward' },
  { name: 'Ownership Transfer', translationKey: 'sidebar.transferOwnership', href: '/cold/transfers', icon: ArrowRightLeft, module: 'ownershipTransfer' },
  { name: 'Transaction Report', translationKey: 'sidebar.reports', href: '/cold/transactions-report', icon: ClipboardList, module: 'reports' },
  { name: 'Client Ledger', translationKey: 'sidebar.clientLedger', href: '/cold/ledger', icon: FileText, module: 'ledger' },
  { name: 'Staff Permissions', translationKey: 'sidebar.staff', href: '/cold/staff', icon: Users, module: 'staff' },
  { name: 'Language', translationKey: 'sidebar.language', href: '/cold/language', icon: Globe },
];

interface SidebarProps {
  session: Session | null;
}

export default function ColdSidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useColdTranslation();

  const role = session?.user && (session.user as any).role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  return (
    <>
      {/* Mobile Menu Toggle */}
      <div className="md:hidden absolute top-4 right-4 z-50 bg-white p-2 rounded-md shadow">
        <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle Menu">
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 h-full transform bg-slate-900 text-white transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo Setup */}
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
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Cold Storage Mode</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-1 px-4 py-8 overflow-y-auto no-scrollbar">
            {coldNavItems
              .filter(item => {
                if (item.adminOnly && !isAdmin) return false;
                return !item.module || canViewMenu(session, item.module);
              })
              .map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex items-center rounded-md px-3 py-3 text-sm font-medium transition-colors ${isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <Icon
                      className={`mr-3 h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                        }`}
                    />
                    {t(item.translationKey)}
                  </Link>
                );
              })}

            {isAdmin && (
              <div className="mt-8 pt-4 border-t border-slate-800">
                <Link
                  href="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="group flex items-center rounded-md px-3 py-3 text-sm font-medium text-blue-400 hover:bg-slate-800 hover:text-blue-300 transition-colors"
                >
                  <LayoutDashboard className="mr-3 h-5 w-5 shrink-0" />
                  Main Dashboard
                </Link>
              </div>
            )}
          </nav>

          {/* Logout Section at Bottom */}
          <div className="p-4 border-t border-slate-800">
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );
}
