'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <Button 
      onClick={() => window.print()}
      className="bg-cyan-700 hover:bg-cyan-800 text-white shadow-sm"
    >
      <Printer className="w-4 h-4 mr-2" />
      Print Receipt
    </Button>
  );
}
