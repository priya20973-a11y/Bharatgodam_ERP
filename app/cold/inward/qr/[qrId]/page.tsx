import { redirect } from 'next/navigation';

export default function QrRedirectPage({ params }: { params: { qrId: string } }) {
  if (!params.qrId) {
    redirect('/cold/inward');
  }
  
  redirect(`/cold/outward?scanQrId=${params.qrId}`);
}
