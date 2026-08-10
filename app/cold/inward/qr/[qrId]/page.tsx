import { redirect } from 'next/navigation';

export default async function QrRedirectPage({ params }: { params: Promise<{ qrId: string }> }) {
  const resolvedParams = await params;
  if (!resolvedParams.qrId) {
    redirect('/cold/inward');
  }
  
  redirect(`/cold/inward/details/${resolvedParams.qrId}`);
}
