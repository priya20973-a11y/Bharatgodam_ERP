'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Menu, 
  X, 
  Settings, 
  Package, 
  Box, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  ClipboardList, 
  Globe, 
  Grid, 
  ArrowRightLeft, 
  Layers, 
  ShoppingCart, 
  Receipt, 
  Thermometer, 
  Upload, 
  Activity, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  LogOut
} from 'lucide-react';
import LogoutButton from '@/components/features/auth/logout-button';
import { signOut } from 'next-auth/react';
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

type NavCategory = {
  id: string;
  name: string;
  translationKey: string;
  icon: any;
  items: NavItem[];
};

const dashboardItem: NavItem = {
  name: 'Dashboard',
  translationKey: 'sidebar.dashboard',
  href: '/cold/dashboard',
  icon: LayoutDashboard,
  module: 'dashboard',
};

const coldNavCategories: NavCategory[] = [
  {
    id: 'warehouse',
    name: 'Warehouse Management',
    translationKey: 'sidebar.warehouseCategory',
    icon: Box,
    items: [
      { name: 'Warehouse Master', translationKey: 'sidebar.warehouse', href: '/cold/warehouses', icon: Box, module: 'warehouse' },
      { name: 'Floor Mapping', translationKey: 'floorMapping.title', href: '/cold/floor-mapping', icon: Grid, module: 'floorMapping' },
      { name: 'Environment Records', translationKey: 'sidebar.environmentRecords', href: '/cold/environment-records', icon: Thermometer, module: 'environmentRecords' },
      { name: 'Unit Master', translationKey: 'sidebar.unitMaster', href: '/cold/units', icon: Layers, adminOnly: true },
    ],
  },
  {
    id: 'parties',
    name: 'Parties',
    translationKey: 'sidebar.partiesCategory',
    icon: Users,
    items: [
      { name: 'Client Master', translationKey: 'sidebar.clientMaster', href: '/cold/clients', icon: Users, module: 'clientMaster' },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    translationKey: 'sidebar.inventoryCategory',
    icon: Package,
    items: [
      { name: 'Commodities', translationKey: 'sidebar.commodities', href: '/cold/commodities', icon: Package, module: 'commodity' },
      { name: 'Purchase', translationKey: 'sidebar.purchase', href: '/cold/purchase', icon: ShoppingCart, module: 'purchase' },
      { name: 'Inward', translationKey: 'sidebar.inward', href: '/cold/inward', icon: ArrowDownToLine, module: 'inward' },
      { name: 'Outward', translationKey: 'sidebar.outward', href: '/cold/outward', icon: ArrowUpFromLine, module: 'outward' },
      { name: 'Bulk Upload', translationKey: 'sidebar.bulkUpload', href: '/cold/bulk-upload', icon: Upload, module: 'inward' },
      { name: 'Stock Shifting', translationKey: 'sidebar.stockShifting', href: '/cold/stock-shifting', icon: ArrowRightLeft, module: 'stockShifting' },
      { name: 'Ownership Transfer', translationKey: 'sidebar.transferOwnership', href: '/cold/transfers', icon: ArrowRightLeft, module: 'ownershipTransfer' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Accounts',
    translationKey: 'sidebar.reportsCategory',
    icon: FileText,
    items: [
      { name: 'Reports', translationKey: 'sidebar.reports', href: '/cold/transactions-report', icon: ClipboardList, module: 'reports' },
      { name: 'Client Ledger', translationKey: 'sidebar.clientLedger', href: '/cold/ledger', icon: FileText, module: 'ledger' },
      { name: 'Invoices', translationKey: 'sidebar.invoices', href: '/cold/invoices', icon: Receipt, module: 'invoice' },
    ],
  },
  {
    id: 'settings',
    name: 'Settings & Administration',
    translationKey: 'sidebar.settingsCategory',
    icon: Settings,
    items: [
      { name: 'Profile', translationKey: 'sidebar.profile', href: '/cold/profile', icon: Settings },
      { name: 'Staff Permissions', translationKey: 'sidebar.staff', href: '/cold/staff', icon: Users, module: 'staff' },
      { name: 'Activity Log', translationKey: 'sidebar.activityLog', href: '/cold/activity-log', icon: Activity, adminOnly: true },
      { name: 'Language', translationKey: 'sidebar.language', href: '/cold/language', icon: Globe },
      { name: 'Receipt Configuration', translationKey: 'sidebar.receiptConfiguration', href: '/cold/receipt-templates', icon: Settings, module: 'receiptConfiguration' },
    ],
  },
];

interface SidebarProps {
  session: Session | null;
}

export default function ColdSidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useColdTranslation();

  // Track expanded categories
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const role = session?.user && (session.user as any).role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const isItemActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/cold/dashboard') return pathname === '/cold/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isCategoryActive = (category: NavCategory) => {
    return category.items.some(item => isItemActive(item.href));
  };

  const canShowDashboard = !dashboardItem.module || canViewMenu(session, dashboardItem.module);
  const isDashboardActive = isItemActive(dashboardItem.href);
  const dashboardTranslated = t(dashboardItem.translationKey);
  const dashboardLabel = dashboardTranslated && dashboardTranslated !== dashboardItem.translationKey ? dashboardTranslated : dashboardItem.name;

  // Restore collapsed preference from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('cold_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch (e) {
      // Ignore in restricted environments
    }
  }, []);

  // Auto-expand category containing the currently active page
  useEffect(() => {
    if (!pathname) return;
    const activeCat = coldNavCategories.find(cat => isCategoryActive(cat));
    if (activeCat) {
      setOpenCategories(prev => ({
        ...prev,
        [activeCat.id]: true,
      }));
    }
  }, [pathname]);

  const toggleCategory = (categoryId: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const toggleSidebarCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('cold_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Filter categories and their items by permissions
  const visibleCategories = useMemo(() => {
    return coldNavCategories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => {
          if (item.adminOnly && !isAdmin) return false;
          return !item.module || canViewMenu(session, item.module);
        }),
      }))
      .filter(cat => cat.items.length > 0);
  }, [session, isAdmin]);

  return (
    <>
      {/* Mobile Menu Floating Toggle Button */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          aria-label="Toggle Menu"
          className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-800 transition-colors focus:outline-none"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-full transform bg-slate-900 text-white transition-all duration-300 ease-in-out md:relative md:z-30 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} w-72 flex flex-col shadow-xl md:shadow-none select-none`}
      >
        {/* Header: Logo and Desktop Collapse/Expand Toggle */}
        <div className="flex h-20 shrink-0 items-center justify-between px-4 border-b border-slate-800">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 overflow-hidden">
                {session?.user?.companyLogo ? (
                  <img
                    src={session.user.companyLogo}
                    alt={`${session.user.companyName || 'Company'} Logo`}
                    className="h-12 w-auto max-w-[150px] rounded-md object-contain"
                  />
                ) : (
                  <img src="/bharatgodam-logo.png" alt="BharatGodam Logo" className="h-12 w-auto max-w-[150px] object-contain" />
                )}
              </div>
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                className="hidden md:flex items-center justify-center h-9 w-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Cold Storage Mode Status Banner */}
        {!isCollapsed ? (
          <div className="px-4 py-1.5 bg-blue-900/30 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider">Cold Storage Mode</span>
          </div>
        ) : (
          <div className="py-1 bg-blue-900/30 border-b border-slate-800 flex justify-center" title="Cold Storage Mode">
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">CS</span>
          </div>
        )}

        {/* Categorized Navigation List */}
        <nav className="flex-1 space-y-2.5 px-3 py-4 overflow-y-auto overflow-x-hidden no-scrollbar">
          {/* Dashboard Standalone Item */}
          {canShowDashboard && (
            isCollapsed ? (
              <div className="relative group/dashboard flex justify-center pb-1">
                <Link
                  href={dashboardItem.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    isDashboardActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={dashboardLabel}
                >
                  <LayoutDashboard className="h-5 w-5 shrink-0" />
                  <span className="sr-only">{dashboardLabel}</span>
                </Link>

                {/* Floating Tooltip for Minimized Dashboard */}
                <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover/dashboard:flex items-center">
                  <div className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                    {dashboardLabel}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pb-1.5 border-b border-slate-800/60">
                <Link
                  href={dashboardItem.href}
                  onClick={() => setIsOpen(false)}
                  className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isDashboardActive
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <LayoutDashboard
                    className={`mr-2.5 h-4 w-4 shrink-0 ${
                      isDashboardActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                    }`}
                  />
                  <span className="truncate">{dashboardLabel}</span>
                </Link>
              </div>
            )
          )}

          {visibleCategories.map((category) => {
            const isExpanded = !!openCategories[category.id];
            const hasActiveModule = isCategoryActive(category);
            const CategoryIcon = category.icon;
            const categoryTranslated = t(category.translationKey);
            const categoryLabel = categoryTranslated && categoryTranslated !== category.translationKey ? categoryTranslated : category.name;

            // Desktop Minimized View
            if (isCollapsed) {
              return (
                <div key={category.id} className="space-y-1 pt-1 border-t border-slate-800/60 first:border-t-0">
                  {/* Category icon button with tooltip */}
                  <div className="relative group/cat flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={`flex items-center justify-center w-10 h-8 rounded-md transition-colors cursor-pointer ${
                        hasActiveModule
                          ? 'text-blue-400 bg-blue-950/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                      title={categoryLabel}
                    >
                      <CategoryIcon className="h-4 w-4 shrink-0" />
                      {!isExpanded && hasActiveModule && (
                        <span className="absolute top-1 right-2.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                      )}
                    </button>
                    {/* Floating Tooltip */}
                    <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover/cat:flex items-center">
                      <div className="bg-slate-900 text-slate-200 text-xs font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                        {categoryLabel}
                      </div>
                    </div>
                  </div>

                  {/* Module icons in this category (shown if category is expanded) */}
                  {isExpanded && (
                    <div className="space-y-1">
                      {category.items.map((item) => {
                        const isActive = isItemActive(item.href);
                        const Icon = item.icon;
                        const translated = t(item.translationKey);
                        const label = translated && translated !== item.translationKey ? translated : item.name;

                        return (
                          <div key={item.name} className="relative group/item flex justify-center">
                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                              }`}
                              title={label}
                            >
                              <Icon className="h-5 w-5 shrink-0" />
                              <span className="sr-only">{label}</span>
                            </Link>

                            {/* Floating Tooltip for Minimized Module */}
                            <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover/item:flex items-center">
                              <div className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                                {label}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Desktop Expanded View & Mobile Drawer View
            return (
              <div key={category.id} className="space-y-1">
                {/* Category Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    hasActiveModule
                      ? 'text-blue-400 hover:text-blue-300 hover:bg-slate-800/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <CategoryIcon className={`h-4 w-4 shrink-0 ${hasActiveModule ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="truncate">{categoryLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {!isExpanded && hasActiveModule && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Active page inside" />
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200" />
                    )}
                  </div>
                </button>

                {/* Sub-modules inside this Category */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-2.5 border-l border-slate-800 ml-4 my-1">
                    {category.items.map((item) => {
                      const isActive = isItemActive(item.href);
                      const Icon = item.icon;
                      const translated = t(item.translationKey);
                      const label = translated && translated !== item.translationKey ? translated : item.name;

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-xs font-semibold'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`mr-2.5 h-4 w-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                            }`}
                          />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin Switcher to Main Dashboard */}
          {isAdmin && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              {!isCollapsed ? (
                <Link
                  href="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-blue-400 hover:bg-slate-800 hover:text-blue-300 transition-colors"
                >
                  <LayoutDashboard className="mr-2.5 h-4 w-4 shrink-0" />
                  Main Dashboard
                </Link>
              ) : (
                <div className="relative group/main flex justify-center">
                  <Link
                    href="/dashboard"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-center w-10 h-10 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-slate-800 transition-colors"
                    title="Main Dashboard"
                  >
                    <LayoutDashboard className="h-5 w-5 shrink-0" />
                  </Link>
                  <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover/main:flex items-center">
                    <div className="bg-slate-800 text-blue-300 text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                      Main Dashboard
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Footer: Logout Section */}
        <div className="p-3 border-t border-slate-800 shrink-0">
          {!isCollapsed ? (
            <LogoutButton />
          ) : (
            <div className="relative group/logout flex justify-center">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-5 w-5" />
              </button>
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover/logout:flex items-center">
                <div className="bg-slate-800 text-red-300 text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                  Sign Out
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
