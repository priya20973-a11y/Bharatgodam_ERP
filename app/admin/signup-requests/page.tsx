'use client';

import React, { useState, useEffect } from 'react';
import { Check, X, Eye, Building, Phone, MapPin, FileText } from 'lucide-react';

interface SignupRequest {
  _id: string;
  fullName: string;
  email: string;
  companyName: string;
  phoneNumber: string;
  address?: string;
  warehouseLocation: string;
  gstNumber?: string;
  bankName?: string;
  accountName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankBranch?: string;
  companyLogo?: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export default function SignupRequestsPage() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<SignupRequest | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/signup-requests');
      const data = await response.json();
      if (response.ok) {
        setRequests(data.requests);
        setError(null);
      } else {
        setError(data?.message || 'Failed to load signup requests');
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
      setError('Failed to load signup requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      const response = await fetch('/api/admin/signup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', requestId }),
      });

      if (response.ok) {
        await fetchRequests(); // Refresh the list
        alert('Request approved successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Approval error:', error);
      alert('Failed to approve request');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const response = await fetch('/api/admin/signup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', requestId }),
      });

      if (response.ok) {
        await fetchRequests(); // Refresh the list
        alert('Request rejected successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Rejection error:', error);
      alert('Failed to reject request');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      <h1 className="text-3xl font-bold mb-8">Signup Requests</h1>

      <div className="grid gap-6">
        {requests.map((request) => (
          <div key={request._id} className="bg-white rounded-lg shadow-md p-6 border">
            <div className="flex justify-between items-start mb-4 gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{request.fullName}</h3>
                <p className="text-gray-600">{request.email}</p>
                <p className="text-sm text-gray-500">
                  Requested on {new Date(request.createdAt).toLocaleDateString()}
                </p>
              </div>
              {request.companyLogo && (
                <img
                  src={request.companyLogo}
                  alt={`${request.companyName} logo`}
                  className="h-16 w-auto rounded-md border border-slate-200 object-contain"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedRequest(request)}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 flex items-center gap-1"
                >
                  <Eye size={16} />
                  View
                </button>
                <button
                  onClick={() => handleApprove(request._id)}
                  className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
                >
                  <Check size={16} />
                  Approve
                </button>
                <button
                  onClick={() => handleReject(request._id)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 flex items-center gap-1"
                >
                  <X size={16} />
                  Reject
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Building size={16} className="text-gray-500" />
                <span>{request.companyName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gray-500" />
                <span>{request.phoneNumber}</span>
              </div>
              {request.address && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Address:</span>
                  <span>{request.address}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-500" />
                <span>{request.warehouseLocation}</span>
              </div>
              {request.bankName && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Bank:</span>
                  <span>{request.bankName}</span>
                </div>
              )}
              {request.accountName && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">A/C Name:</span>
                  <span>{request.accountName}</span>
                </div>
              )}
              {request.bankAccountNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">A/C:</span>
                  <span>{request.bankAccountNumber}</span>
                </div>
              )}
              {request.ifscCode && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">IFSC:</span>
                  <span>{request.ifscCode}</span>
                </div>
              )}
              {request.bankBranch && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Branch:</span>
                  <span>{request.bankBranch}</span>
                </div>
              )}
              {request.gstNumber && (
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <span>{request.gstNumber}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              {(() => {
                const normalizedStatus = request.status?.toString().toLowerCase();
                const statusLabel = request.status?.toString().toUpperCase();
                const badgeClass =
                  normalizedStatus === 'pending' || normalizedStatus === 'pending_approval'
                    ? 'bg-yellow-100 text-yellow-800'
                    : normalizedStatus === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800';

                return (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${badgeClass}`}>
                    {statusLabel}
                  </span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {requests.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No signup requests found.</p>
        </div>
      )}

      {/* Modal for detailed view */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Signup Request Details</h2>
            <div className="space-y-3">
              <div><strong>Full Name:</strong> {selectedRequest.fullName}</div>
              <div><strong>Email:</strong> {selectedRequest.email}</div>
              <div><strong>Company:</strong> {selectedRequest.companyName}</div>
              {selectedRequest.companyLogo && (
                <div className="pt-2">
                  <strong>Logo:</strong>
                  <div className="mt-2">
                    <img
                      src={selectedRequest.companyLogo}
                      alt={`${selectedRequest.companyName} logo`}
                      className="h-24 w-auto rounded-md border border-slate-200 object-contain"
                    />
                  </div>
                </div>
              )}
              <div><strong>Phone:</strong> {selectedRequest.phoneNumber}</div>
              {selectedRequest.address && <div><strong>Address:</strong> {selectedRequest.address}</div>}
              <div><strong>Location:</strong> {selectedRequest.warehouseLocation}</div>
              {selectedRequest.bankName && <div><strong>Bank Name:</strong> {selectedRequest.bankName}</div>}
              {selectedRequest.accountName && <div><strong>Account Name:</strong> {selectedRequest.accountName}</div>}
              {selectedRequest.bankAccountNumber && <div><strong>Account Number:</strong> {selectedRequest.bankAccountNumber}</div>}
              {selectedRequest.ifscCode && <div><strong>IFSC Code:</strong> {selectedRequest.ifscCode}</div>}
              {selectedRequest.bankBranch && <div><strong>Branch:</strong> {selectedRequest.bankBranch}</div>}
              {selectedRequest.gstNumber && <div><strong>GST:</strong> {selectedRequest.gstNumber}</div>}
              <div><strong>Role:</strong> {selectedRequest.role}</div>
              <div><strong>Status:</strong> {selectedRequest.status}</div>
              <div><strong>Requested:</strong> {new Date(selectedRequest.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
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