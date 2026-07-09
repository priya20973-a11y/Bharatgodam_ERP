import React from 'react';
import ColdInvoiceGenerator from '@/components/features/invoices/cold-invoice-generator';
import { requireSession } from '@/lib/ownership';
import { getClients } from '@/app/actions/client-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import connectToDatabase from '@/lib/mongoose';
import mongoose from 'mongoose';

export const metadata = {
  title: 'Client Invoice | Cold Storage',
};

export default async function ColdInvoicesPage() {
  const session = await requireSession();
  await connectToDatabase();
  
  const clients = await getClients();
  const warehouses = await getColdWarehouses();
  
  // Fetch user details for invoice header
  const db = mongoose.connection.db;
  const user = db ? await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(session.user.id) }) : null;
  
  const userDetails = {
    companyName: user?.companyName || session.user.companyName,
    companyLogo: user?.companyLogo || '',
    phoneNumber: user?.phoneNumber || session.user.phoneNumber,
    address: user?.address || session.user.warehouseLocation || '',
    coldLanguage: user?.coldLanguage || (session.user as any).coldLanguage || 'en',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Cold Storage Invoices</h1>
          <p className="text-slate-500 mt-1">Generate and manage invoices for cold storage clients.</p>
        </div>
      </div>
      
      <ColdInvoiceGenerator 
        warehouses={warehouses}
        clients={clients}
        userDetails={userDetails}
      />
    </div>
  );
}
