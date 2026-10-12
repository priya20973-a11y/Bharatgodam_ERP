import { Metadata } from 'next';
import CreatePledgeForm from '@/components/features/pledges/create-pledge-form';

export const metadata: Metadata = {
  title: 'Create Pledge | BharatGodam ERP',
  description: 'Create a new stock pledge',
};

export default function NewPledgePage() {
  return <CreatePledgeForm />;
}
