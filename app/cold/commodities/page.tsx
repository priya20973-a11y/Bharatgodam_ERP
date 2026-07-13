import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import ColdCommodityListWrapper from '@/components/features/cold-commodities/cold-commodity-list-wrapper';

export const metadata = {
  title: 'Commodity Master (Cold Storage) | ERP',
};

// Next.js server components can't use context directly, but we don't translate the server component directly. We'll pass dict or just make it a client component? No, this is a Server Component. Oh wait, if the layout wraps with LanguageProvider, the inner client components will be translated. But we need to translate the page title. The simplest way is to make the page a client component OR just let the inner wrapper handle it. Let's make it a client component so we can translate the header. Wait, it uses async fetchColdCommodities(). Next.js Client components can't be async.
// I will move the header inside the wrapper to translate it, or translate it using a small client component. Or just translate it in the wrapper. Let's just create a small header client component or move the header to the wrapper.
// Actually, let's keep it server and use translation on the wrapper.
export default async function ColdCommoditiesPage() {
  const initialCommodities = await fetchColdCommodities();

  return (
    <div className="space-y-6">
      <ColdCommodityListWrapper initialCommodities={initialCommodities} />
    </div>
  );
}
