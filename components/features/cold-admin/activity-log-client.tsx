'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Search, Filter, Eye, ChevronLeft, ChevronRight, Download, Calendar, RefreshCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Log {
  _id: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  module: string;
  recordId: string;
  description: string;
  previousValue: any;
  newValue: any;
  storageType?: string;
  createdAt: string;
}

export default function ActivityLogClient() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [storageType, setStorageType] = useState('All');
  const [sort, setSort] = useState('newest');

  // Modal state
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sort,
      });

      if (search) query.append('search', search);
      if (moduleFilter) query.append('module', moduleFilter);
      if (actionFilter) query.append('action', actionFilter);
      if (dateStart) query.append('dateStart', dateStart);
      if (dateEnd) query.append('dateEnd', dateEnd);
      if (storageType !== 'All') query.append('storageType', storageType);

      const res = await fetch(`/api/cold/activity-log?${query.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages || 1);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching activity logs');
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, moduleFilter, actionFilter, dateStart, dateEnd, storageType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleResetFilters = () => {
    setSearch('');
    setModuleFilter('');
    setActionFilter('');
    setDateStart('');
    setDateEnd('');
    setStorageType('All');
    setPage(1);
  };

  const renderValue = (val: any) => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'object') {
      return (
        <pre className="text-xs bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-3 rounded-lg overflow-auto max-h-60 custom-scrollbar border border-gray-200 dark:border-gray-700">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return String(val);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Filters Section */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search user, module, id..."
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm w-full sm:w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            />
          </div>

          <select
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={storageType}
            onChange={(e) => { setStorageType(e.target.value); setPage(1); }}
          >
            <option value="All">All Storage</option>
            <option value="Cold Storage">Cold Storage</option>
            <option value="Dry Storage">Dry Storage</option>
          </select>

          <select
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Modules</option>
            <option value="Warehouse Master">Warehouse Master</option>
            <option value="Commodities">Commodities</option>
            <option value="Client Master">Client Master</option>
            <option value="Inward">Inward</option>
            <option value="Outward">Outward</option>
            <option value="Report">Report</option>
            <option value="Environmental Record">Environmental Record</option>
            <option value="Bulk Upload">Bulk Upload</option>
            <option value="Ownership Transfer">Ownership Transfer</option>
            <option value="Stock Shifting">Stock Shifting</option>
            <option value="Invoices">Invoices</option>
            <option value="Staff Permission">Staff Permission</option>
          </select>

          <select
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="OTHER">Other</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={dateStart}
              onChange={(e) => { setDateStart(e.target.value); setPage(1); }}
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={dateEnd}
              onChange={(e) => { setDateEnd(e.target.value); setPage(1); }}
            />
          </div>

          <button
            onClick={handleResetFilters}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        <select
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full xl:w-auto"
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading activity logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No logs found matching your criteria.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {format(new Date(log.createdAt), 'dd-MM-yyyy hh:mm a')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{log.userName}</div>
                    <div className="text-xs">{log.userRole}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      log.actionType === 'CREATE' ? 'bg-green-100 text-green-800' :
                      log.actionType === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                      log.actionType === 'DELETE' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white">{log.module}</div>
                    <div className="text-xs text-gray-500">{log.storageType || 'Cold Storage'}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{log.description}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-blue-600 hover:text-blue-800 flex items-center justify-end gap-1 ml-auto"
                    >
                      <Eye className="h-4 w-4" /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Log Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">User:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{selectedLog.userName} ({selectedLog.userRole})</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Date & Time:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {format(new Date(selectedLog.createdAt), 'dd-MM-yyyy hh:mm a')}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Module / Screen:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{selectedLog.module}</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Action:</span>
                  <div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      selectedLog.actionType === 'CREATE' ? 'bg-green-100 text-green-800' :
                      selectedLog.actionType === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                      selectedLog.actionType === 'DELETE' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedLog.actionType}
                    </span>
                  </div>
                </div>
                {selectedLog.recordId && (
                  <div className="md:col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">Reference ID:</span>
                    <div className="font-medium text-gray-900 dark:text-white">{selectedLog.recordId}</div>
                  </div>
                )}
                <div className="md:col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">Description:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{selectedLog.description}</div>
                </div>
              </div>

              {/* Old vs New Values */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {selectedLog.previousValue && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Previous Value</h4>
                    {renderValue(selectedLog.previousValue)}
                  </div>
                )}
                {selectedLog.newValue && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Value</h4>
                    {renderValue(selectedLog.newValue)}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end sticky bottom-0 bg-white dark:bg-gray-800">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
