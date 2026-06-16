import { Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { fetchCommodities } from '@/app/actions/commodities';
import CommoditiesDashboard from '@/components/features/commodities/commodities-dashboard';
import { Loader2, Boxes } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata = {
  title: 'Commodity Master Directory | Logistics ERP',
};

// Asynchronous UI Loader Graphic Shell
function TableSkeletonLoader() {
  return (
    <div className="w-full h-[26rem] bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center animate-pulse shadow-sm">
      <Loader2 className="w-12 h-12 text-indigo-300 animate-spin mb-4" />
      <span className="text-slate-500 font-black text-sm uppercase tracking-widest opacity-80">Syncing Master Node Directory...</span>
    </div>
  );
}

// Data Execution Wrapper Module
async function DirectoryContainer() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role?.toString().toUpperCase();
  const isAdminUser = role === 'ADMIN' || role === 'WSP';
  const payload = await fetchCommodities();
  return <CommoditiesDashboard initialData={payload} isAdminUser={isAdminUser} />;
}

export default function CommoditiesMasterPage() {
  return (
    <div className="w-full max-w-[85rem] mx-auto py-8 px-4 sm:px-6">
      <Toaster position="top-right" />
      
      <div className="mb-10 pl-1">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center">
          <Boxes className="w-8 h-8 mr-3 text-indigo-600 stroke-[2.5]" />
          Commodity Master Matrix
        </h1>
        <p className="text-slate-500 mt-2.5 max-w-4xl text-[15px] font-medium leading-relaxed">
          The central source of truth mapping all structural Goods across the tracking platform. Create categorized item vectors, assign un-mutable Metric Ton identifiers, and govern physical pricing thresholds that influence downstream validation schemas completely autonomously.
        </p>
      </div>

      <Suspense fallback={<TableSkeletonLoader />}>
        <DirectoryContainer />
      </Suspense>
    </div>
  );
}
