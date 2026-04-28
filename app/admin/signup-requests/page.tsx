'use client';

import React, { useState, useEffect } from 'react';
import { Check, X, Eye, Building, Phone, MapPin, FileText } from 'lucide-react';

interface SignupRequest {
  _id: string;
  fullName: string;
  email: string;
  companyName: string;
  phoneNumber: string;
  warehouseLocation: string;
  gstNumber?: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function SignupRequestsPage() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<SignupRequest | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/signup-requests');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
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
      <h1 className="text-3xl font-bold mb-8">Signup Requests</h1>

      <div className="grid gap-6">
        {requests.map((request) => (
          <div key={request._id} className="bg-white rounded-lg shadow-md p-6 border">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">{request.fullName}</h3>
                <p className="text-gray-600">{request.email}</p>
                <p className="text-sm text-gray-500">
                  Requested on {new Date(request.createdAt).toLocaleDateString()}
                </p>
              </div>
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
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-500" />
                <span>{request.warehouseLocation}</span>
              </div>
              {request.gstNumber && (
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <span>{request.gstNumber}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                request.status === 'approved' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {request.status.toUpperCase()}
              </span>
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
              <div><strong>Phone:</strong> {selectedRequest.phoneNumber}</div>
              <div><strong>Location:</strong> {selectedRequest.warehouseLocation}</div>
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