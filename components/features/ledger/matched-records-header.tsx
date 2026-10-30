'use client';

import React from 'react';
import { AlertCircle, Users } from 'lucide-react';
import type { MatchedRecord } from '@/lib/ledger-engine';

interface MatchedRecordsHeaderProps {
  matchedRecords: MatchedRecord[];
  isAggregated: boolean;
}

export const MatchedRecordsHeader: React.FC<MatchedRecordsHeaderProps> = ({
  matchedRecords,
  isAggregated,
}) => {
  if (!isAggregated || matchedRecords.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Consolidated Ledger (Multiple Accounts)
          </h3>
          <p className="text-sm text-blue-800 mb-4">
            This ledger aggregates data from {matchedRecords.length} matched account(s) for this client name.
            All transactions below are combined chronologically for a unified view.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
              Matched Accounts:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {matchedRecords.map((record, idx) => (
                <div
                  key={record._id}
                  className="bg-white rounded border border-blue-100 p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">#{idx + 1}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        <span className="font-medium">Name:</span> {record.clientName}
                      </p>
                      {record.location && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Location:</span> {record.location}
                        </p>
                      )}
                      {record.commodity && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Commodity:</span> {record.commodity}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 mt-1">
                        <span className="font-medium">First Transaction:</span> {record.date}
                      </p>
                    </div>
                    {record.totalMT !== undefined && (
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                          {record.totalMT.toFixed(2)} MT
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchedRecordsHeader;
