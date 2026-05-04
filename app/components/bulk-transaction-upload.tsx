'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, CheckCircle, AlertCircle, Loader2, File } from 'lucide-react';
import toast from 'react-hot-toast';

interface BulkUploadResponse {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; error: string }>;
  warnings?: string[];
}

export function BulkTransactionUpload() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/transactions/bulk-template');
      if (!response.ok) throw new Error('Failed to download template');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'transaction-template.csv';
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

      const response = await fetch('/api/transactions/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      const data: BulkUploadResponse = await response.json();
      setResult(data);

      if (data.success) {
        toast.success(`Successfully uploaded ${data.successCount} transactions`);
        setSelectedFile(null);
        // Reset after 3 seconds
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
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Transaction Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a CSV file with multiple inward and outward transactions. Download the template below to see the required format.
          </p>

          {/* Download Template */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">CSV Template</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Download the template to see the required format and start entering your data.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Select CSV File
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploading}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="gap-2"
              >
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
                <File className="h-4 w-4" />
                {selectedFile.name}
              </div>
            )}
          </div>

          {/* Upload Instructions */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm space-y-2">
            <h4 className="font-semibold text-blue-900">CSV Format Guidelines:</h4>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>
                <strong>Type:</strong> Either INWARD or OUTWARD
              </li>
              <li>
                <strong>ClientName:</strong> Must match an existing client in the system
              </li>
              <li>
                <strong>CommodityName:</strong> Must match an existing commodity
              </li>
              <li>
                <strong>WarehouseName:</strong> Must match an existing warehouse
              </li>
              <li>
                <strong>QuantityMT:</strong> Quantity in metric tons (decimal allowed)
              </li>
              <li>
                <strong>BagsCount:</strong> Number of bags (optional but recommended)
              </li>
              <li>
                <strong>StackNo, LotNo, GatePass:</strong> Optional reference numbers
              </li>
              <li>
                <strong>Date:</strong> Transaction date in YYYY-MM-DD format
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
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
            {/* Summary */}
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

            {/* Error Details */}
            {result.errors.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  {showDetails ? 'Hide' : 'Show'} Error Details
                </button>
                {showDetails && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {result.errors.map((error, idx) => (
                        <div key={idx} className="text-sm text-red-800">
                          <strong>Row {error.row}:</strong> {error.error}
                        </div>
                      ))}
                      {result.errorCount > result.errors.length && (
                        <div className="text-sm text-red-800 italic">
                          ... and {result.errorCount - result.errors.length} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-sm font-medium text-yellow-800">Warnings:</p>
                <ul className="list-disc list-inside text-sm text-yellow-800 mt-2">
                  {result.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
