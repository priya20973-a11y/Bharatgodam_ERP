import { Metadata } from 'next';
import PledgeList from '@/components/features/pledges/pledge-list';

export const metadata: Metadata = {
  title: 'Pledges | BharatGodam ERP',
  description: 'Manage client stock pledges and loans',
};

export default function PledgesPage() {
  return <PledgeList />;
}
