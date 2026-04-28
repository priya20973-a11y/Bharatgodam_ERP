import React from 'react';
import { LedgerCalculator } from '@/components/features/ledger';

/**
 * Example page showing how to use the LedgerCalculator component
 * 
 * Route: /reports/ledger/[clientId]
 * Example: /reports/ledger/ABC%20Grains%20Inc
 * 
 * This page:
 * 1. Accepts clientId from URL parameters
 * 2. Passes it to LedgerCalculator
 * 3. LedgerCalculator handles all data fetching and rendering
 * 
 * The ledger automatically:
 * - Fetches all transactions for the client
 * - Fetches all payments recorded
 * - Calculates rent using the bucket algorithm
 * - Displays comprehensive breakdown with export option
 */

interface LedgerPageProps {
  params: Promise<{
    clientId: string;
  }>;
}

export default async function LedgerPage({ params }: LedgerPageProps) {
  const { clientId } = await params;
  const decodedClientId = decodeURIComponent(clientId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-600">
          <a href="/reports" className="hover:text-slate-900 font-medium">
            Reports
          </a>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Ledger</span>
        </div>

        {/* Main Content */}
        <LedgerCalculator 
          clientId={decodedClientId}
          clientName={decodedClientId}
        />

        {/* Footer Info */}
        <div className="mt-12 p-6 bg-white rounded-lg border border-slate-200 text-sm text-slate-600">
          <p>
            <strong>Note:</strong> This ledger uses the Daily Average Inventory calculation method. 
            Rent is calculated as ₹10 per day per MT. Each entry shows the period between 
            transactions where inventory remained static.
          </p>
          <p className="mt-3">
            For questions about billing calculations or payment records, please contact the 
            warehouse management team.
          </p>
        </div>
      </div>
    </div>
  );
}
