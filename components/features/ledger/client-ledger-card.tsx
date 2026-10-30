'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { sanitizeClientName } from '@/lib/ledger-engine';

interface ClientLedgerCardProps {
  client: any;
  outstanding?: number;
  isExpanded: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onDownloadStatement: () => void;
  children: ReactNode;
}

export function ClientLedgerCard({
  client,
  outstanding = 0,
  isExpanded,
  isLoading,
  onToggle,
  onDownloadStatement,
  children,
}: ClientLedgerCardProps) {
  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="bg-slate-50 border-b px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900">{sanitizeClientName(client.name)}</CardTitle>
            <p className="text-sm text-slate-500">{client.address || client.type || 'Client account'}</p>
          </div>

          <div className="flex flex-col sm:items-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Outstanding</span>
              <Badge variant={Number(outstanding || 0) > 0 ? 'destructive' : 'secondary'}>
                ₹{Math.abs(Number(outstanding || 0)).toLocaleString('en-IN')}
              </Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={onToggle} disabled={isLoading}>
                {isExpanded ? (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4 mr-2" />
                    View Ledger
                  </>
                )}
              </Button>
              <Button size="sm" variant="secondary" onClick={onDownloadStatement}>
                <Download className="h-4 w-4 mr-2" />
                Download Statement
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-6">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
