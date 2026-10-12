import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import React from 'react';

export default async function StorageReceiptQRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  if (!ObjectId.isValid(id)) {
    return notFound();
  }

  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    // Unauthenticated users are redirected to login with callback
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent(`/qr/receipt/${id}`));
  }

  // Redirect to the exact same dynamic HTML receipt endpoint
  redirect(`/api/receipt/html?id=${id}`);
}
