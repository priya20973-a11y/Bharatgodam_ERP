'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <Button 
      onClick={() => window.print()}
      className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
    >
      <Printer className="w-4 h-4 mr-2" />
      Print Receipt
    </Button>
  );
}
