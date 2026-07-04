'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Loader2, Calendar, Building2, Package, BookOpen, Info, ChevronDown } from 'lucide-react';
import { getClientOptions, getFilteredBookings, getWarehouseOptions, getCommodityOptions, getClientTransactionInvoice, recordPayment } from '@/app/actions/reports';
import { getClientMonthlyLedger } from '@/app/actions/client-ledger';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { getDropdownDisplayName } from '@/lib/utils';

interface AdditionalChargeItem {
  id?: string;
  name: string;
  amount: number | string;
  note?: string;
}

interface PaymentAllocationRow {
  id: string;
  name: string;
  charge: number;
  paid: string;
  previousPaid: number;
}

interface PaymentAllocationEntry {
  id: string;
  name: string;
  charge: number;
  amount: number;
}

interface MonthlyInvoice {
  bookingId: string;
  clientName: string;
  month: string;
  year: number;
  periods: Array<{
    startDate: string;
    endDate: string;
    quantityMT: number;
    daysTotal: number;
    rentTotal: number;
    status: string;
    commodityName: string;
  }>;
  warehouseId?: string;
  warehouseName?: string;
  totalRent: number;
  previousBalance?: number;
  paymentsReceived?: number;
  additionalCharges?: number;
  additionalChargeItems?: AdditionalChargeItem[];
  outstandingBalance?: number;
  invoiceDate: string;
  invoiceId?: string;
  billingState?: string;
  taxGroup?: string;
  taxType?: string;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTaxAmount?: number;
  adjustmentAmount?: number;
  notes?: string;
}

const getAdditionalChargeItemRowId = (invoiceId: string | undefined, item: AdditionalChargeItem, index: number) => {
  if (item.id) return String(item.id);
  const cleanName = String(item.name || 'additional')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const amountToken = Math.round(Number(item.amount || 0) * 100);
  const randomToken = Math.random().toString(36).slice(2, 8);
  return `${invoiceId || 'invoice'}-additional-${cleanName}-${amountToken}-${index}-${randomToken}`;
};

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];

const TAX_GROUPS = [
  'Non-GST Supply',
  'GST 5%',
  'GST 12%',
  'GST 18%',
  'GST 28%',
];

export default function ClientInvoicesPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [clients, setClients] = useState<{ label: string; value: string; wspName?: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ label: string; value: string }[]>([]);
  const [commodities, setCommodities] = useState<{ label: string; value: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<'ledger' | 'transaction'>('ledger');
  const [taxSavingStatus, setTaxSavingStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [accountBalance, setAccountBalance] = useState<any>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentAllocations, setPaymentAllocations] = useState<Record<string, PaymentAllocationRow[]>>({});
  const [summaryPaymentAmounts, setSummaryPaymentAmounts] = useState<Record<string, string>>({});
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [savingChargeFor, setSavingChargeFor] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Load clients and warehouses on mount
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [clientData, warehouseData, commodityData] = await Promise.all([
          getClientOptions(),
          getWarehouseOptions(),
          getCommodityOptions()
        ]);
        setClients(clientData);
        setWarehouses(warehouseData);
        setCommodities(commodityData);
      } catch (error) {
        console.error('Failed to load master data:', error);
        toast.error('Failed to load master data');
      }
    };
    loadMasterData();
  }, []);

  // Auto-select client for client users
  useEffect(() => {
    if (!clients.length || !session?.user) return;
    const role = (session.user as any).role;
    if (role === 'FARMER' || role === 'FPO' || role === 'COMPANY') {
      const userIdStr = String((session.user as any).id || '');
      const userEmail = String((session.user as any).email || '').trim().toLowerCase();
      const matched = clients.find(c => {
        const cUserId = c.userId ? String(c.userId) : '';
        const cUserEmail = (c.wspName || '').trim().toLowerCase();
        // Note: getClientOptions returns wspName not userEmail; try matching by client record via separate lookup
        return c.value === userIdStr || c.value === userEmail;
      });
      if (matched) {
        setSelectedClient(matched.value);
      }
    }
  }, [clients, session]);

  useEffect(() => {
    const loadTransactions = async () => {
      if ((!selectedClient || selectedClient === 'ALL') && (selectedWarehouses.length === 0 || selectedWarehouses.includes('ALL'))) {
        setTransactions([]);
        return;
      }

      setTransactionLoading(true);
      setTransactionError('');

      try {
        const filters: any = {
          direction: 'ALL',
          page: 1,
          limit: 50,
        };

        if (selectedClient && selectedClient !== 'ALL') {
          filters.clientId = selectedClient;
        }

        if (selectedWarehouses.length > 0 && !selectedWarehouses.includes('ALL')) {
          filters.warehouseIds = selectedWarehouses.join(',');
        }

        if (selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          const monthStart = `${year}-${month}-01`;
          const lastDayOfMonth = new Date(Number(year), Number(month), 0).getDate();
          const monthEnd = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;
          filters.startDate = monthStart;
          filters.endDate = monthEnd;
        }

        const result = await getFilteredBookings(filters);
        if (result.success) {
          setTransactions(result.data || []);
        } else {
          setTransactionError(result.message || 'Failed to fetch transactions');
          setTransactions([]);
        }
      } catch (error) {
        console.error('Failed to load transactions:', error);
        setTransactionError('Failed to load transactions');
        setTransactions([]);
      } finally {
        setTransactionLoading(false);
      }
    };

    loadTransactions();
  }, [selectedClient, selectedWarehouses, selectedMonth, clients, warehouses]);

  const transactionCounts = transactions.reduce(
    (summary, record) => {
      if (record.direction === 'INWARD') summary.inward += 1;
      if (record.direction === 'OUTWARD') summary.outward += 1;
      return summary;
    },
    { inward: 0, outward: 0 }
  );

  // Handle client selection
  const handleClientChange = async (clientId: string) => {
    setSelectedClient(clientId);
    if (!clientId || clientId === 'ALL') {
      setInvoices([]);
      setAccountBalance(null);
      return;
    }

    // Load invoices only when client, warehouse and month are selected
    if (selectedMonth && selectedWarehouses.length > 0 && !selectedWarehouses.includes('ALL')) {
      await loadInvoices(clientId, selectedWarehouses, selectedMonth, invoiceMode);
    }
  };

  // Handle warehouse selection
  const handleWarehouseChange = async (warehouseIds: string[]) => {
    setSelectedWarehouses(warehouseIds);
    if (selectedClient && selectedClient !== 'ALL' && selectedMonth && warehouseIds.length > 0) {
      await loadInvoices(selectedClient, warehouseIds, selectedMonth, invoiceMode);
    }
  };

  // Handle month selection
  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month);
    if (
      selectedClient &&
      selectedClient !== 'ALL' &&
      selectedWarehouses.length > 0 &&
      !selectedWarehouses.includes('ALL')
    ) {
      await loadInvoices(selectedClient, selectedWarehouses, month, invoiceMode);
    }
  };

  useEffect(() => {
    if (
      selectedClient &&
      selectedClient !== 'ALL' &&
      selectedWarehouses.length > 0 &&
      !selectedWarehouses.includes('ALL') &&
      selectedMonth
    ) {
      loadInvoices(selectedClient, selectedWarehouses, selectedMonth, invoiceMode);
    }
  }, [invoiceMode]);

  // Load invoices with client, warehouse and month filter
  const loadInvoices = async (
    clientId: string,
    warehouseIds: string[],
    month: string,
    mode: 'ledger' | 'transaction' = invoiceMode
  ) => {
    setLoading(true);
    setInvoices([]);

    try {
      if (mode === 'transaction') {
        const result = await getClientTransactionInvoice(
          clientId,
          month,
          warehouseIds.length > 0 ? warehouseIds.join(',') : undefined
        );

        if (result.success && result.data) {
          setInvoices([result.data]);
        } else {
          setInvoices([]);
        }

        return;
      }

      const result = await getClientMonthlyLedger(clientId, month, warehouseIds.length > 0 ? warehouseIds.join(',') : undefined);
      if (result.success && result.data) {
        const clientResult = await getClientOptions();
        const warehouseResult = await getWarehouseOptions();
        const client = clientResult.find((c: any) => c.value === clientId);
        const selectedWMap = warehouseResult.filter((w: any) => warehouseIds.includes(w.value));
        const warehouseNames = selectedWMap.map((w: any) => w.label).join(', ');

        const transformedInvoices: MonthlyInvoice[] = result.data.months.map((invoice: any) => {
          const invoiceWarehouseId = invoice.warehouseId || (warehouseIds.length > 0 ? warehouseIds.join(',') : undefined);
          const invoiceWarehouseName = invoice.warehouseName || warehouseNames || '';
          const invoiceIdValue = invoiceWarehouseId
            ? `${clientId}-${invoice.month}-${invoiceWarehouseId}`
            : `${clientId}-${invoice.month}`;
          const additionalChargeItems = (invoice.additionalChargeItems || []).map((item: any, idx: number) => ({
            id: item.id ? String(item.id) : getAdditionalChargeItemRowId(invoiceIdValue, item, idx),
            name: item.name,
            amount: Number(item.amount || 0),
            note: item.note || '',
          }));
          return {
            bookingId: clientId,
            clientName: client?.label || result.data.clientName || '',
            month: invoice.month.split('-')[1].padStart(2, '0'),
            year: parseInt(invoice.month.split('-')[0]),
            periods: invoice.rows.map((period: any) => ({
              startDate: period.fromDate,
              endDate: period.toDate,
              quantityMT: Number(period.qty ?? 0),
              daysTotal: Number(period.days ?? 0),
              rentTotal: Number(period.rent ?? 0),
              status: period.status || 'COMPLETED',
              commodityName: period.commodityName || period.commodity || '',
            })),
            warehouseId: invoiceWarehouseId,
            warehouseName: invoiceWarehouseName,
            totalRent: Number(invoice.summary.totalRent ?? 0),
            previousBalance: Number(invoice.summary.previousBalance ?? 0),
            paymentsReceived: Number(invoice.summary.payments ?? 0),
            additionalCharges: 0,
            additionalChargeItems,
            outstandingBalance: Number(invoice.summary.outstanding ?? 0),
            invoiceDate: new Date().toISOString().split('T')[0],
            invoiceId: invoiceIdValue,
            billingState: invoice.summary.billingState || '',
            taxGroup: invoice.summary.taxGroup || 'No Tax',
            taxType: invoice.summary.taxType || '',
            cgstAmount: Number(invoice.summary.cgstAmount || 0),
            sgstAmount: Number(invoice.summary.sgstAmount || 0),
            igstAmount: Number(invoice.summary.igstAmount || 0),
            totalTaxAmount: Number(invoice.summary.totalTaxAmount || 0),
            adjustmentAmount: Number(invoice.summary.adjustmentAmount || 0),
          };
        });

        setInvoices(transformedInvoices);

        const invoiceIds = transformedInvoices.map((invoice) => invoice.invoiceId || '').filter(Boolean);
        if (invoiceIds.length > 0) {
          try {
            const query = invoiceIds.map((id) => encodeURIComponent(id)).join(',');
            const response = await fetch(`/api/invoice/adjustments?invoiceIds=${query}`);
            const result = await response.json();
            if (response.ok && result.success && result.data) {
              const adjustedInvoices = transformedInvoices.map((invoice) => {
                const adjustments = result.data[invoice.invoiceId || '']?.additionalChargeItems || [];
                return {
                  ...invoice,
                  additionalCharges: Number(result.data[invoice.invoiceId || '']?.additionalCharges || 0),
                  additionalChargeItems: adjustments.map((item: any, idx: number) => ({
                    id: item.id || `${invoice.invoiceId}-additional-${idx}`,
                    name: item.name,
                    amount: item.amount,
                    note: item.note || '',
                  })),
                };
              });
              setInvoices(adjustedInvoices);
            }
          } catch (error) {
            console.error('Failed to load invoice adjustments:', error);
          }
        }
      } else {
        toast.error(result.message || 'Failed to load invoices');
        setInvoices([]);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
      toast.error('Failed to load invoices');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const isTransactionInvoiceId = (id: string) => {
    return /^[a-fA-F0-9]{24}-\d{4}-\d{2}(?:-[a-fA-F0-9]{24})?$/.test(id);
  };

  const handleDownloadInvoice = (invoice: MonthlyInvoice) => {
    const invoiceId = encodeURIComponent(invoice.invoiceId || invoice.bookingId);
    const warehouseQuery = invoice.warehouseId ? `&warehouseId=${encodeURIComponent(invoice.warehouseId)}` : '';
    // Only use transaction mode when user explicitly selected it.
    // Do NOT infer mode from ID format — all generated IDs match the
    // transaction pattern, causing incorrect amounts for ledger invoices.
    const modeQuery = invoiceMode === 'transaction' ? '&mode=transactions' : '';
    const url = `/api/invoice/html?id=${invoiceId}${warehouseQuery}${modeQuery}`;
    window.open(url, '_blank', 'noopener');
  };

  const roundCurrency = (value: number) => Math.round(value * 100) / 100;

  const getInitialPaymentAllocationRows = (invoice: MonthlyInvoice) => {
    const previousBalanceAmount = roundCurrency(Number(invoice.previousBalance || 0));
    const previousBalanceRows: PaymentAllocationRow[] = previousBalanceAmount > 0
      ? [{
        id: 'previousBalance',
        name: 'Previous Balance',
        charge: previousBalanceAmount,
        paid: '',
        previousPaid: 0,
      }]
      : [];

    const rentRow: PaymentAllocationRow = {
      id: 'rent',
      name: 'Total Monthly Charges',
      charge: getTotalMonthlyCharges(invoice),
      paid: '',
      previousPaid: 0,
    };

    const rows: PaymentAllocationRow[] = [
      ...previousBalanceRows,
      rentRow,
    ];

    return rows.map((row) => ({
      ...row,
      previousPaid: 0,
    }));
  };

  const buildPaymentAllocationRowsFromSavedPayments = (
    invoice: MonthlyInvoice,
    paymentRecords: Array<{ paymentId: string; paymentDate?: string; amount?: number; allocations?: Array<{ id: string; name: string; charge: number; amount: number }> }>
  ) => {
    const initialRows = getInitialPaymentAllocationRows(invoice);
    if (!paymentRecords || !paymentRecords.length) {
      return initialRows;
    }

    const totalPaymentsAmount = paymentRecords.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return [
      {
        id: 'allCharges',
        name: 'All Charges',
        charge: getTotalChargeAmount(invoice),
        paid: '',
        previousPaid: roundCurrency(totalPaymentsAmount),
      },
    ];
  };

  const buildPaymentAllocationRows = (invoice: MonthlyInvoice, existingRows: PaymentAllocationRow[] = []) => {
    const hasAllCharges = existingRows.some((row) => row.id === 'allCharges');
    if (hasAllCharges) {
      const allChargesRow = existingRows.find((row) => row.id === 'allCharges')!;
      return [
        {
          id: 'allCharges',
          name: 'All Charges',
          charge: getTotalChargeAmount(invoice),
          paid: allChargesRow.paid || '',
          previousPaid: allChargesRow.previousPaid || 0,
        },
      ];
    }

    const initialRows = getInitialPaymentAllocationRows(invoice);

    if (!existingRows.length) {
      return initialRows;
    }

    const paidMap = new Map(existingRows.map((row) => [row.id, row.paid]));
    const previousPaidMap = new Map(existingRows.map((row) => [row.id, row.previousPaid]));
    const initialPreviousPaidMap = new Map(initialRows.map((row) => [row.id, row.previousPaid]));

    return initialRows.map((row) => ({
      ...row,
      paid: paidMap.get(row.id) ?? '',
      previousPaid: previousPaidMap.get(row.id) ?? initialPreviousPaidMap.get(row.id) ?? row.previousPaid,
    }));
  };

  useEffect(() => {
    if (invoices.length === 0) return;
    setPaymentAllocations((prev) => {
      const next = { ...prev };
      let changed = false;

      invoices.forEach((invoice) => {
        if (!invoice.invoiceId) return;

        const existingRows = next[invoice.invoiceId] || [];
        const hasAllCharges = existingRows.some((row) => row.id === 'allCharges');
        const previousBalanceRowsCount = Number(invoice.previousBalance && Number(invoice.previousBalance) > 0 ? 1 : 0);
        const expectedRowCount = hasAllCharges ? 1 : (previousBalanceRowsCount + 1);

        if (!existingRows.length || existingRows.length !== expectedRowCount) {
          next[invoice.invoiceId] = buildPaymentAllocationRows(invoice, existingRows);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [invoices]);

  const loadSavedPaymentAllocations = async (invoiceIds: string[]) => {
    if (!invoiceIds.length) return;

    const updatedAllocations: Record<string, PaymentAllocationRow[]> = {};
    const invoiceResults = await Promise.all(
      invoiceIds.filter(Boolean).map(async (invoiceId) => {
        try {
          const invoice = findInvoiceById(invoiceId);
          if (!invoice) return null;

          const clientParam = encodeURIComponent(invoice.bookingId);
          const monthParam = encodeURIComponent(`${invoice.year}-${invoice.month}`);
          const response = await fetch(
            `/api/reports/ledger?invoiceId=${encodeURIComponent(invoiceId)}&accountId=${clientParam}&month=${monthParam}`
          );
          if (!response.ok) return null;
          const result = await response.json();
          if (!result.success || !Array.isArray(result.data)) return null;

          return { invoiceId, rows: buildPaymentAllocationRowsFromSavedPayments(invoice, result.data) };
        } catch (error) {
          console.error('Failed to load saved payment allocations:', error);
          return null;
        }
      })
    );

    invoiceResults.forEach((item) => {
      if (item?.invoiceId && item.rows) {
        updatedAllocations[item.invoiceId] = item.rows;
      }
    });

    setPaymentAllocations((prev) => ({ ...prev, ...updatedAllocations }));
  };

  useEffect(() => {
    if (!invoices.length) return;
    const invoiceIds = invoices.map((invoice) => invoice.invoiceId || '').filter(Boolean);
    loadSavedPaymentAllocations(invoiceIds);
  }, [invoices]);

  const findInvoiceById = (invoiceId: string) => invoices.find((invoice) => invoice.invoiceId === invoiceId);

  const getPaymentAllocationRows = (invoice: MonthlyInvoice) => {
    const rows = paymentAllocations[invoice.invoiceId || ''];
    return rows && rows.length ? rows : buildPaymentAllocationRows(invoice);
  };

  const getTotalPaidAmount = (invoice: MonthlyInvoice) => {
    return getPaymentAllocationRows(invoice).reduce((sum, row) => sum + (parseFloat(row.paid) || 0), 0);
  };

  const getSummaryPaymentAmount = (invoice: MonthlyInvoice) => {
    const invoiceId = invoice.invoiceId || '';
    if (summaryPaymentAmounts[invoiceId] !== undefined) {
      return summaryPaymentAmounts[invoiceId];
    }
    const totalPaid = getTotalPaidAmount(invoice);
    return totalPaid ? totalPaid.toFixed(2) : '';
  };

  const getTotalMonthlyCharges = (invoice: MonthlyInvoice) => {
    const baseRent = Number(invoice.totalRent || 0);
    const additionalCharges = getAdjustmentTotal(invoice);
    const taxAmount = Number(invoice.totalTaxAmount || 0);
    return roundCurrency(baseRent + additionalCharges + taxAmount);
  };

  const getTotalChargeAmount = (invoice: MonthlyInvoice) => {
    return roundCurrency(getTotalMonthlyCharges(invoice) + Number(invoice.previousBalance || 0));
  };

  const getTotalPreviousPaidAmount = (invoice: MonthlyInvoice) => {
    return getPaymentAllocationRows(invoice).reduce((sum, row) => sum + Number(row.previousPaid || 0), 0);
  };

  const getInvoicePaymentsReceived = (invoice: MonthlyInvoice) => {
    const rows = getPaymentAllocationRows(invoice);
    const totalPayments = rows.reduce((sum, row) => sum + Number(row.previousPaid || 0) + (parseFloat(row.paid) || 0), 0);
    return totalPayments > 0 ? totalPayments : Number(invoice.paymentsReceived || 0);
  };

  const getOutstandingAmount = (invoice: MonthlyInvoice) => {
    const totalOutstanding = getTotalChargeAmount(invoice) - getInvoicePaymentsReceived(invoice);
    return Math.max(0, roundCurrency(totalOutstanding));
  };

  const getTotalChargesPaidThisMonth = (invoice: MonthlyInvoice) => {
    return getPaymentAllocationRows(invoice)
      .filter((row) => row.id !== 'previousBalance')
      .reduce((sum, row) => sum + Number(row.previousPaid || 0) + (parseFloat(row.paid) || 0), 0);
  };

  const handleUpdatePaymentAllocation = (invoiceId: string, rowId: string, value: string) => {
    if (rowId === 'allCharges') {
      const invoice = findInvoiceById(invoiceId);
      const maxPayment = invoice ? roundCurrency(getTotalChargeAmount(invoice) - getTotalPreviousPaidAmount(invoice)) : 0;
      const decimalPattern = /^\d*(\.\d*)?$/;
      if (!decimalPattern.test(value) && value !== '.') {
        return;
      }

      const normalizedValue = (() => {
        if (value === '' || value === '.' || value.endsWith('.')) {
          return value;
        }

        const numericValue = parseFloat(value);
        if (Number.isNaN(numericValue)) {
          return '';
        }

        const clampedValue = Math.min(Math.max(numericValue, 0), maxPayment);
        return value.includes('.') ? value : String(Math.trunc(clampedValue));
      })();

      setSummaryPaymentAmounts((prev) => ({
        ...prev,
        [invoiceId]: normalizedValue,
      }));
      setSelectedInvoiceId(invoiceId);
      return;
    }

    setPaymentAllocations((prev) => {
      const invoice = findInvoiceById(invoiceId);
      const existingRows = prev[invoiceId] || (invoice ? buildPaymentAllocationRows(invoice) : []);
      return {
        ...prev,
        [invoiceId]: existingRows.map((row) => {
          if (row.id !== rowId) return row;
          const numericValue = parseFloat(value);
          const maxPayment = roundCurrency(row.charge - row.previousPaid);
          const normalizedValue = Number.isNaN(numericValue)
            ? ''
            : String(Math.min(Math.max(numericValue, 0), maxPayment).toFixed(2));
          return { ...row, paid: normalizedValue };
        }),
      };
    });
    setSelectedInvoiceId(invoiceId);
  };

  const getAdjustmentTotal = (invoice: MonthlyInvoice) => {
    if (invoice.additionalChargeItems && invoice.additionalChargeItems.length > 0) {
      return invoice.additionalChargeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }
    return Number(invoice.additionalCharges || 0);
  };

  const handleUpdateAdjustmentItem = (invoiceId: string, index: number, field: 'name' | 'amount', value: string) => {
    if (!invoiceId) return;

    setInvoices((prev) =>
      prev.map((item) => {
        if (item.invoiceId !== invoiceId) return item;

        const updatedItems = (item.additionalChargeItems || []).map((chargeItem, idx) => {
          if (idx !== index) return chargeItem;
          return {
            ...chargeItem,
            id: chargeItem.id || getAdditionalChargeItemRowId(invoiceId, chargeItem, idx),
            name: field === 'name' ? value : chargeItem.name,
            amount: field === 'amount' ? value : chargeItem.amount,
          };
        });

        return {
          ...item,
          additionalChargeItems: updatedItems,
          additionalCharges: updatedItems.reduce((sum, chargeItem) => sum + Number(chargeItem.amount || 0), 0),
        };
      })
    );
  };

  const handleAddAdjustmentRow = (invoice: MonthlyInvoice) => {
    if (!invoice.invoiceId) {
      toast.error('Invoice ID missing');
      return;
    }
    setInvoices((prev) =>
      prev.map((item) =>
        item.invoiceId === invoice.invoiceId
          ? {
            ...item,
            additionalChargeItems: [
              ...(item.additionalChargeItems || []),
              {
                id: `${invoice.invoiceId}-additional-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: '',
                amount: '',
              },
            ],
          }
          : item
      )
    );
  };

  const handleRemoveAdjustmentRow = (invoice: MonthlyInvoice, index: number) => {
    if (!invoice.invoiceId) return;
    setInvoices((prev) =>
      prev.map((item) => {
        if (item.invoiceId !== invoice.invoiceId) return item;
        const updatedItems = (item.additionalChargeItems || []).filter((_, idx) => idx !== index);
        return {
          ...item,
          additionalChargeItems: updatedItems,
          additionalCharges: updatedItems.reduce((sum, chargeItem) => sum + Number(chargeItem.amount || 0), 0),
        };
      })
    );
  };

  const handleUpdateAdditionalCharges = async (invoice: MonthlyInvoice) => {
    if (!invoice.invoiceId) {
      toast.error('Invoice identifier missing for adjustment');
      return;
    }

    const items = (invoice.additionalChargeItems || []).map((item) => ({
      description: String(item.name || '').trim(),
      amount: Number(item.amount || 0),
    }));

    if (items.some((item) => !item.description)) {
      toast.error('Please provide a description for all additional charge rows.');
      return;
    }

    if (items.some((item) => Number.isNaN(item.amount) || item.amount < 0)) {
      toast.error('Enter a valid non-negative amount for all additional charge rows.');
      return;
    }

    setSavingChargeFor(invoice.invoiceId);
    try {
      const response = await fetch('/api/invoice/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceId: invoice.invoiceId,
          additionalCharges: items,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to save additional charges');
      }

      const updatedSum = Number(result.data?.additionalCharges ?? items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0));
      const savedItems = result.data?.additionalChargeItems ?? items.map((item) => ({ name: item.description, amount: item.amount }));

      setInvoices((prev) =>
        prev.map((item) =>
          item.invoiceId === invoice.invoiceId
            ? {
              ...item,
              additionalCharges: updatedSum,
              additionalChargeItems: savedItems,
              totalTaxAmount: Number(result.data?.totalTaxAmount ?? item.totalTaxAmount ?? 0),
              cgstAmount: Number(result.data?.cgstAmount ?? item.cgstAmount ?? 0),
              sgstAmount: Number(result.data?.sgstAmount ?? item.sgstAmount ?? 0),
              igstAmount: Number(result.data?.igstAmount ?? item.igstAmount ?? 0),
              taxType: result.data?.taxType ?? item.taxType ?? '',
            }
            : item
        )
      );

      if (selectedClient && selectedWarehouses.length > 0 && selectedMonth) {
        await loadInvoices(selectedClient, selectedWarehouses, selectedMonth);
      }

      toast.success('Additional charges saved successfully');
    } catch (error) {
      console.error('Failed to save additional charges:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update additional charges');
    } finally {
      setSavingChargeFor(null);
    }
  };

  const handleTaxAutoSave = async (
    invoiceId: string,
    billingState: string,
    taxGroup: string,
    notes?: string
  ) => {
    if (!invoiceId) return;

    setTaxSavingStatus((prev) => ({ ...prev, [invoiceId]: 'saving' }));
    try {
      const response = await fetch('/api/invoice/tax-adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceId,
          billingState,
          taxGroup,
          adjustment: 0,
          notes,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to save tax settings');
      }

      const { data } = result;

      setInvoices((prev) =>
        prev.map((item) =>
          item.invoiceId === invoiceId
            ? {
              ...item,
              billingState: data.billingState,
              taxGroup: data.taxGroup,
              taxType: data.taxType,
              cgstAmount: Number(data.cgstAmount),
              sgstAmount: Number(data.sgstAmount),
              igstAmount: Number(data.igstAmount),
              totalTaxAmount: Number(data.totalTaxAmount),
              adjustmentAmount: Number(data.adjustmentAmount),
              notes: data.notes !== undefined ? data.notes : item.notes,
            }
            : item
        )
      );

      setTaxSavingStatus((prev) => ({ ...prev, [invoiceId]: 'saved' }));
      setTimeout(() => {
        setTaxSavingStatus((prev) => ({ ...prev, [invoiceId]: 'idle' }));
      }, 2000);
    } catch (error) {
      console.error('Failed to auto-save tax details:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save tax details');
      setTaxSavingStatus((prev) => ({ ...prev, [invoiceId]: 'error' }));
    }
  };

  // Record payment for invoice
  const handleRecordPayment = async (invoice: MonthlyInvoice) => {
    if (!invoice.invoiceId) {
      toast.error('Invoice ID is missing. Cannot record payment.');
      return;
    }

    const rows = getPaymentAllocationRows(invoice);
    const totalPaidValue = roundCurrency(parseFloat(summaryPaymentAmounts[invoice.invoiceId || ''] ?? String(getTotalPaidAmount(invoice))) || 0);
    const allocations = [
      {
        id: 'allCharges',
        name: 'All Charges',
        charge: getTotalChargeAmount(invoice),
        amount: totalPaidValue,
      },
    ].filter((row) => row.amount > 0);

    const totalOutstandingBeforePayment = getOutstandingAmount(invoice);
    if (totalPaidValue > totalOutstandingBeforePayment) {
      toast.error(`Paid amount cannot exceed outstanding amount of ₹${totalOutstandingBeforePayment.toFixed(2)}`);
      return;
    }

    const amount = allocations.reduce((sum, entry) => sum + entry.amount, 0);
    if (amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    const rawValue = summaryPaymentAmounts[invoice.invoiceId || ''] ?? String(getTotalPaidAmount(invoice));
    if (rawValue.trim() === '' || rawValue === '.' || Number.isNaN(parseFloat(rawValue))) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setRecordingPayment(true);
    try {
      const result = await recordPayment(
        invoice.bookingId,
        amount,
        new Date().toISOString(),
        invoice.invoiceId,
        `Payment for ${invoice.month} ${invoice.year} invoice`,
        allocations
      );

      if (result.success) {
        toast.success('Payment recorded successfully');
        setSelectedInvoiceId(null);
        setSummaryPaymentAmounts((prev) => {
          const next = { ...prev };
          delete next[invoice.invoiceId || ''];
          return next;
        });
        setPaymentAllocations((prev) => ({
          ...prev,
          [invoice.invoiceId || '']: [
            {
              id: 'allCharges',
              name: 'All Charges',
              charge: getTotalChargeAmount(invoice),
              paid: '',
              previousPaid: getTotalPreviousPaidAmount(invoice) + totalPaidValue,
            },
          ],
        }));

        if (selectedClient && selectedClient !== 'ALL' && selectedMonth && selectedWarehouses.length > 0) {
          await loadInvoices(selectedClient, selectedWarehouses, selectedMonth);
        }
      } else {
        toast.error(result.message || 'Failed to record payment');
      }
    } catch (error) {
      console.error('Failed to record payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleResetInvoicePayments = async (invoice: MonthlyInvoice) => {
    if (!invoice.invoiceId) {
      toast.error('Invoice ID is missing. Cannot reset payments.');
      return;
    }

    if (!window.confirm('Reset recorded payments for this invoice? This will zero out Payments Received and allow a fresh payment entry.')) {
      return;
    }

    try {
      const invoiceIdParam = encodeURIComponent(invoice.invoiceId);
      const accountIdParam = encodeURIComponent(invoice.bookingId);
      const monthParam = encodeURIComponent(selectedMonth || '');
      const response = await fetch(`/api/reports/ledger?invoiceId=${invoiceIdParam}&accountId=${accountIdParam}&month=${monthParam}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast.success('Invoice payments reset successfully');
        setPaymentAllocations((prev) => {
          const next = { ...prev };
          delete next[invoice.invoiceId || ''];
          return next;
        });
        if (selectedClient && selectedClient !== 'ALL' && selectedMonth && selectedWarehouses.length > 0) {
          await loadInvoices(selectedClient, selectedWarehouses, selectedMonth);
        }
      } else {
        toast.error(result.message || 'Failed to reset invoice payments');
      }
    } catch (error) {
      console.error('Failed to reset invoice payments:', error);
      toast.error('Failed to reset invoice payments');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Monthly Invoices
        </h1>
        <p className="text-slate-500 mt-2">
          View monthly invoices in an HTML preview page for easy printing and saving.
        </p>
      </div>

      {/* Client Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Client, Warehouse & Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasMounted ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                  <Select value={selectedClient} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.value} value={client.value}>
                          {getDropdownDisplayName(client, clients, isAdmin)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Warehouses *</label>
                  <div 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={() => setIsWarehouseDropdownOpen(!isWarehouseDropdownOpen)}
                  >
                    <span className={selectedWarehouses.length ? "text-slate-900" : "text-slate-500"}>
                      {selectedWarehouses.includes('ALL') || selectedWarehouses.length === 0 ? 'All Warehouses' : (selectedWarehouses.length === 1 ? (warehouses.find((w) => w.value === selectedWarehouses[0])?.label || 'Select Warehouse') : `${selectedWarehouses.length} warehouse(s) selected`)}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </div>
                  {isWarehouseDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsWarehouseDropdownOpen(false)} />
                      <div className="absolute z-20 w-full mt-1 border rounded-md max-h-60 overflow-y-auto bg-white p-2 text-sm flex flex-col gap-1 shadow-xl">
                        {warehouses.map((warehouse) => (
                          <label key={warehouse.value} className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 cursor-pointer rounded">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                              checked={selectedWarehouses.includes(warehouse.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleWarehouseChange([...selectedWarehouses, warehouse.value]);
                                } else {
                                  handleWarehouseChange(selectedWarehouses.filter(id => id !== warehouse.value));
                                }
                              }}
                            />
                            <span className="text-slate-700 font-medium">{warehouse.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Month *</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                  <div className="h-11 rounded-md border border-slate-200 bg-slate-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse *</label>
                  <div className="h-11 rounded-md border border-slate-200 bg-slate-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Month *</label>
                  <div className="h-11 rounded-md border border-slate-200 bg-slate-100" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Master Data Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Master Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Clients</span>
              <span className="text-lg font-semibold">{Math.max(0, clients.length - 1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Warehouses</span>
              <span className="text-lg font-semibold">{warehouses.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Commodities</span>
              <span className="text-lg font-semibold">{Math.max(0, commodities.length - 1)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Recent Records</span>
              <span className="text-lg font-semibold">{transactions.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500 uppercase">Inward</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{transactionCounts.inward}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500 uppercase">Outward</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{transactionCounts.outward}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Showing up to 50 recent transactions for the selected filters.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Client</span>
              <span className="font-medium">{clients.find((c) => c.value === selectedClient)?.label || 'All'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Warehouse</span>
              <span className="font-medium">{selectedWarehouses.includes('ALL') ? 'Any' : (selectedWarehouses.length === 1 ? (warehouses.find((w) => w.value === selectedWarehouses[0])?.label || 'Any') : `${selectedWarehouses.length} selected`)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Invoice Month</span>
              <span className="font-medium">{selectedMonth ? selectedMonth : 'Any'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inward / Outward Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactionLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading transactions...
            </div>
          ) : transactionError ? (
            <div className="py-8 text-center text-red-600">{transactionError}</div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              Select a client, warehouse and month to view inward/outward transactions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Direction</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Commodity</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Warehouse</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Qty (MT)</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Bags</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((record) => (
                    <tr key={record._id} className="bg-white">
                      <td className="px-4 py-2">{typeof record.date === 'string' ? record.date : (record.date instanceof Date ? record.date.toISOString().split('T')[0] : '—')}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${record.direction === 'INWARD' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {record.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2">{record.commodityName || ''}</td>
                      <td className="px-4 py-2">{record.warehouseName || ''}</td>
                      <td className="px-4 py-2 text-right font-medium">{Number(record.quantityMT || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">{record.bags || 0}</td>
                      <td className="px-4 py-2 text-center">{record.storageDays || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading invoices...
          </CardContent>
        </Card>
      )}

      {/* Account Balance Summary */}

      {/* Monthly Invoices */}
      {!loading && selectedClient && (
        <div className="space-y-4">
          {!selectedMonth ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-slate-600 text-center">
                  <span className="block mb-2">📅 Please select an invoice month to view invoices</span>
                  <span className="text-sm text-slate-500">Warehouse selection is required</span>
                </p>
              </CardContent>
            </Card>
          ) : invoices.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-slate-500">No invoices found for the selected criteria</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map((invoice, index) => (
              <Card key={`${invoice.invoiceId || `invoice-${index}`}`} className="border-l-4 border-l-indigo-500 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-indigo-600" />
                        {invoice.month} {invoice.year}
                      </CardTitle>
                      <div className="flex items-center gap-6 mt-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{invoice.warehouseName || 'General'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <span>{invoice.periods.length} period(s)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-slate-900">
                        ₹{(Number(invoice.totalRent || 0) + getAdjustmentTotal(invoice)).toLocaleString('en-IN')}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Total Monthly Charges</p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadInvoice(invoice)}
                          disabled={downloading === invoice.bookingId || savingChargeFor === invoice.invoiceId}
                        >
                          {downloading === invoice.bookingId ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Open Invoice
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Periods Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">Commodity</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">From Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">To Date</th>
                          <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty (MT)</th>
                          <th className="px-4 py-2 text-center font-semibold text-slate-700">Days</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-700">Rent (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(invoice.periods || []).map((period, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-2 font-medium text-slate-900">{period.commodityName}</td>
                            <td className="px-4 py-2">{period.startDate}</td>
                            <td className="px-4 py-2">{period.endDate}</td>
                            <td className="px-4 py-2 text-center font-medium">{Number(period.quantityMT || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-center">{period.daysTotal ?? 0}</td>
                            <td className="px-4 py-2 text-right font-semibold">₹{Number(period.rentTotal || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-slate-50 rounded-lg border">
                    <div>
                      <p className="text-xs text-slate-600">Monthly Storage Rent</p>
                      <p className="text-lg font-bold text-slate-900">₹{(invoice.totalRent || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Additional Charges</p>
                      <p className="text-lg font-bold text-slate-900">₹{getAdjustmentTotal(invoice).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Total Monthly Charges</p>
                      <p className="text-lg font-bold text-slate-900">₹{(Number(invoice.totalRent || 0) + getAdjustmentTotal(invoice)).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Previous Balance</p>
                      <p className="text-lg font-bold">₹{(invoice.previousBalance || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Payments Received</p>
                      <p className="text-lg font-bold text-green-600">-₹{getInvoicePaymentsReceived(invoice).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Outstanding Balance</p>
                      <p className={`text-lg font-bold ${getOutstandingAmount(invoice) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{getOutstandingAmount(invoice).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {/* Payment and Adjustment Input Section */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Additional Charge Entries</p>
                            <p className="text-xs text-slate-500">Add a description and amount for each additional charge row.</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleAddAdjustmentRow(invoice)}>
                            Add Charge Row
                          </Button>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-slate-700">Description</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">Charge (₹)</th>
                                <th className="px-3 py-2 text-center font-semibold text-slate-700">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(invoice.additionalChargeItems || []).length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                                    No additional charge rows added yet.
                                  </td>
                                </tr>
                              ) : (
                                (invoice.additionalChargeItems || []).map((item, idx) => (
                                  <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        value={item.name}
                                        onChange={(e) => handleUpdateAdjustmentItem(invoice.invoiceId || '', idx, 'name', e.target.value)}
                                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Description"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.amount?.toString() || ''}
                                        onChange={(e) => handleUpdateAdjustmentItem(invoice.invoiceId || '', idx, 'amount', e.target.value)}
                                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 text-right focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="0.00"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <Button size="sm" variant="outline" onClick={() => handleRemoveAdjustmentRow(invoice, idx)}>
                                        Remove
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm text-slate-700">
                          Total additional charge amount: <span className="font-semibold">₹{getAdjustmentTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateAdditionalCharges(invoice)}
                          disabled={!invoice.invoiceId || savingChargeFor === invoice.invoiceId}
                        >
                          {savingChargeFor === invoice.invoiceId ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Save Charges
                        </Button>
                      </div>
                    </div>

                    {/* Tax & Adjustment Section */}
                    <div className="space-y-4 border-t border-blue-200 pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            Tax & Adjustment
                            <span title="Auto-saves on field change or blur.">
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </span>
                            {taxSavingStatus[invoice.invoiceId || ''] === 'saving' && (
                              <span className="inline-flex items-center text-xs font-normal text-slate-500 animate-pulse">
                                <Loader2 className="h-3 w-3 animate-spin mr-1 text-indigo-600" />
                                Saving...
                              </span>
                            )}
                            {taxSavingStatus[invoice.invoiceId || ''] === 'saved' && (
                              <span className="text-xs font-normal text-emerald-600 flex items-center">
                                ✓ Saved
                              </span>
                            )}
                            {taxSavingStatus[invoice.invoiceId || ''] === 'error' && (
                              <span className="text-xs font-normal text-rose-600 flex items-center">
                                ⚠ Save Failed
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">Configure Billing State, Tax Group, and adjust the total amount manually.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-slate-200">
                        {/* Billing State */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-slate-600">Billing State *</label>
                          <Select
                            value={invoice.billingState || undefined}
                            onValueChange={(val) => {
                              handleTaxAutoSave(
                                invoice.invoiceId || '',
                                val,
                                invoice.taxGroup || 'No Tax',
                                invoice.notes
                              );
                            }}
                          >
                            <SelectTrigger className="w-full text-sm">
                              <SelectValue placeholder="Select Billing State..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              {INDIAN_STATES.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Tax Group */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-slate-600">Tax Group *</label>
                          <Select
                            value={invoice.taxGroup || 'No Tax'}
                            onValueChange={(val) => {
                              handleTaxAutoSave(
                                invoice.invoiceId || '',
                                invoice.billingState || '',
                                val,
                                invoice.notes
                              );
                            }}
                          >
                            <SelectTrigger className="w-full text-sm">
                              <SelectValue placeholder="Select Tax Group..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              {TAX_GROUPS.map((group) => (
                                <SelectItem key={group} value={group}>
                                  {group}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Tax calculations breakdown display */}
                      {invoice.taxGroup && invoice.taxGroup !== 'No Tax' && (
                        <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1 bg-slate-100/50 p-2.5 rounded border border-slate-200">
                          <span className="font-semibold text-slate-700">Tax Breakdown:</span>
                          {(() => {
                            const match = (invoice.taxGroup || '').match(/\d+(\.\d+)?/);
                            const gstRate = match ? Number(match[0]) : 0;
                            const halfRate = gstRate / 2;
                            const cgstLabel = gstRate > 0 ? `CGST ${halfRate} (${halfRate}%)` : 'CGST';
                            const sgstLabel = gstRate > 0 ? `SGST ${halfRate} (${halfRate}%)` : 'SGST';
                            const igstLabel = gstRate > 0 ? `IGST ${gstRate} (${gstRate}%)` : 'IGST';

                            return invoice.taxType === 'CGST_SGST' ? (
                              <>
                                <span>{cgstLabel}: ₹{Number(invoice.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span>{sgstLabel}: ₹{Number(invoice.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </>
                            ) : (
                              <span>{igstLabel}: ₹{Number(invoice.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            );
                          })()}
                          <span className="ml-auto font-bold text-slate-800">Total Tax: ₹{Number(invoice.totalTaxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 border-t border-blue-200 pt-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Invoice Notes</p>
                        <p className="text-xs text-slate-500 mb-2">These notes will be displayed in the invoice footer.</p>
                        <textarea
                          rows={3}
                          value={invoice.notes || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInvoices((prev) => prev.map((item) => item.invoiceId === invoice.invoiceId ? { ...item, notes: val } : item));
                          }}
                          onBlur={() => {
                            handleTaxAutoSave(
                              invoice.invoiceId || '',
                              invoice.billingState || '',
                              invoice.taxGroup || 'No Tax',
                              invoice.notes
                            );
                          }}
                          placeholder="e.g. Thanks for your business."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-blue-200 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Payment Allocation</p>
                          <p className="text-xs text-slate-500">Enter how much is paid against each charge line item, including total monthly charges and additional charges.</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-600">Total Charges Paid this month</p>
                          <p className="text-lg font-semibold text-slate-900">₹{getTotalChargesPaidThisMonth(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-xs text-slate-500 mt-1">This value is the sum of all paid charge amounts recorded for this invoice month.</p>
                        </div>
                      </div>
                      {Number(invoice.previousBalance || 0) > 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
                          <p className="text-sm font-semibold text-slate-700">Previous Balance</p>
                          <p className="text-lg font-bold text-slate-900">₹{Number(invoice.previousBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      ) : null}

                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Charge Amount</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Previous Payment</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Paid Amount</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Outstanding Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(() => {
                              const totalCharge = getTotalChargeAmount(invoice);
                              const totalPreviousPaid = getTotalPreviousPaidAmount(invoice);
                              const totalPaid = parseFloat(getSummaryPaymentAmount(invoice)) || 0;
                              const totalOutstanding = getOutstandingAmount(invoice);

                              return (
                                <tr className="bg-white">
                                  <td className="px-3 py-2 text-right">₹{totalCharge.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">₹{totalPreviousPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={getSummaryPaymentAmount(invoice)}
                                      onChange={(e) => handleUpdatePaymentAllocation(invoice.invoiceId || '', 'allCharges', e.target.value)}
                                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 text-right focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                                    ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-center">
                        {invoice.paymentsReceived && invoice.paymentsReceived > 0 ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleResetInvoicePayments(invoice)}
                          >
                            Reset Payments
                          </Button>
                        ) : <div />}
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRecordPayment(invoice)}
                            disabled={recordingPayment}
                          >
                            {recordingPayment ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Record Payment
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}