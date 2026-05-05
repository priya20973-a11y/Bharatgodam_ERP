'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { InvoiceData } from '@/lib/invoice/types';

interface InvoicePDFExporterProps {
  invoiceData: InvoiceData;
  fileName?: string;
}

/**
 * Invoice Exporter (HTML-based, Vercel-safe)
 */
export default function InvoicePDFExporter({ invoiceData }: InvoicePDFExporterProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateAndDownload = () => {
    try {
      setIsGenerating(true);

      const invoiceId = invoiceData?.metadata?.invoiceNo;

      if (!invoiceId) {
        throw new Error('Invoice ID not found');
      }

      // Open HTML invoice in new tab
      window.open(`/api/invoice/html?id=${invoiceId}`, '_blank');

      toast.success('Invoice opened! Press Ctrl+P to download as PDF.');
    } catch (error) {
      console.error('Invoice error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open invoice');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleGenerateAndDownload}
      disabled={isGenerating}
      className="flex items-center gap-2"
      variant="default"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          View / Download Invoice
        </>
      )}
    </Button>
  );
}