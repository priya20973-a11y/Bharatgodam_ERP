'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, CheckCircle, AlertCircle, Loader2, File as FileIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface BulkUploadResponse {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors?: Array<{ row: number; error: string }>;
  warnings?: string[];
  error?: string;
}

export function ColdBulkInwardUpload({
  clients,
  commodities,
  warehouses,
}: {
  clients: any[];
  commodities: any[];
  warehouses: any[];
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/cold/bulk-template');
      if (!response.ok) throw new Error('Failed to download template');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cold-inward-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download template');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a CSV file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/cold/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as BulkUploadResponse | { error: string };

      if (!response.ok || 'error' in data) {
        const errorMessage = typeof data.error === 'string' && data.error ? data.error : 'Upload failed';
        const errorResult: BulkUploadResponse = {
          success: false,
          totalRows: 0,
          successCount: 0,
          errorCount: 1,
          errors: [{ row: 0, error: errorMessage }],
          error: errorMessage,
        };
        setResult(errorResult);
        toast.error(errorMessage);
        setShowDetails(true);
        return;
      }

      setResult(data);

      if (data.success) {
        toast.success(`Successfully uploaded ${data.successCount} cold inward transactions`);
        setSelectedFile(null);
        setTimeout(() => {
          setResult(null);
          window.location.reload();
        }, 2000);
      } else {
        toast.error(`Upload completed with ${data.errorCount} errors`);
        setShowDetails(true);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Cold Storage Inward Bulk Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a CSV file with multiple cold inward transactions. Only inward records are accepted in this page.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">CSV Template</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Download the template, fill in your transaction rows, and upload the file.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Select CSV File</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploading}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <Button onClick={handleUpload} disabled={!selectedFile || uploading} className="gap-2">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileIcon className="h-4 w-4" />
                {selectedFile.name}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm space-y-2">
            <h4 className="font-semibold text-blue-900">CSV Format Guidelines:</h4>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>
                <strong>Type:</strong> Keep as INWARD
              </li>
              <li>
                <strong>ClientName:</strong> Must match an existing client.
              </li>
              <li>
                <strong>CommodityName:</strong> Must match an existing cold commodity.
              </li>
              <li>
                <strong>WarehouseName:</strong> Must match an existing cold warehouse.
              </li>
              <li>
                <strong>Date:</strong> Use YYYY-MM-DD format.
              </li>
              <li>
                <strong>TruckNo + WeighbridgeSlipNo:</strong> Rows with the same client and same truck/weighbridge are grouped into one inward receipt.
              </li>
              <li>
                <strong>ChamberNo, FloorNo, StackNo:</strong> Required stack location for each row.
              </li>
              <li>
                <strong>AllocatedWeight:</strong> Quantity in KG for each stack row.
              </li>
              <li>
                <strong>AllocatedBagsCount:</strong> Bags for this stack row.
              </li>
              <li>
                <strong>GrossWeight, EmptyWeight, TotalBags, NetWeight:</strong> Shared receipt-level summary values.
              </li>
              <li>
                <strong>VillageName:</strong> The client/farmer's village name (optional).
              </li>
              <li>
                <strong>LargeBag, SmallBag:</strong> Large and small bags breakdown (optional).
              </li>
              <li>
                <strong>SelfPurchase:</strong> Use Self or Purchase.
              </li>
              <li>
                <strong>Grading:</strong> Use Y/N.
              </li>
              <li>
                <strong>Multiple stacks for same client:</strong> Add multiple rows with the same client, truck, and weighbridge receipt; they will be merged into one inward record.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Upload Successful
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Upload Completed with Issues
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-600">Total Rows</p>
                <p className="text-2xl font-bold text-slate-900">{result.totalRows}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-sm text-green-600">Successful</p>
                <p className="text-2xl font-bold text-green-600">{result.successCount}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-sm text-red-600">Errors</p>
                <p className="text-2xl font-bold text-red-600">{result.errorCount}</p>
              </div>
            </div>

            {(result.errors?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  {showDetails ? 'Hide' : 'Show'} Error Details
                </button>
                {showDetails && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <ul className="space-y-2">
                      {result.errors?.map((error, index) => (
                        <li key={`${error.row}-${index}`}>
                          <strong>Row {error.row}:</strong> {error.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {(result.warnings?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  {showDetails ? 'Hide' : 'Show'} Warning Details
                </button>
                {showDetails && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <ul className="space-y-2">
                      {result.warnings?.map((warning, index) => (
                        <li key={`warning-${index}`}>
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
