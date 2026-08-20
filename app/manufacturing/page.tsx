import { redirect } from 'next/navigation';

export default function ManufacturingRootPage() {
  redirect('/manufacturing/dashboard');
  return null;
}
