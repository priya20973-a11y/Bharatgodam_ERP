'use client';

import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ReleaseHistoryModalProps {
  pledge: any;
  onClose: () => void;
}

export default function ReleaseHistoryModal({ pledge, onClose }: ReleaseHistoryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-xl font-bold">Release History</h2>
            <p className="text-sm text-slate-500">Pledge No: {pledge.pledgeNo}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-4 overflow-y-auto bg-slate-50">
          {(!pledge.releaseHistory || pledge.releaseHistory.length === 0) ? (
            <div className="text-center py-10 text-slate-500">
              No release history found for this pledge.
            </div>
          ) : (
            <div className="space-y-4">
              {pledge.releaseHistory.map((release: any, idx: number) => (
                <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="font-semibold text-slate-800">
                      Receipt No: {release.receiptNo || 'Legacy Record'}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      Released on: {new Date(release.releaseDate).toLocaleString()}
                    </div>
                    {release.releasedBy && (
                      <div className="text-sm text-slate-500">
                        By: {release.releasedBy}
                      </div>
                    )}
                    {release.remarks && (
                      <div className="text-sm text-slate-500 mt-1 italic">
                        "{release.remarks}"
                      </div>
                    )}
                  </div>
                  
                  {release.receiptNo && (
                    <Link href={`/pledge-receipt/${pledge._id}?receiptIdx=${idx}`} target="_blank">
                      <Button variant="outline" size="sm" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200">
                        <ExternalLink className="w-4 h-4 mr-2" /> View / Download Receipt
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
