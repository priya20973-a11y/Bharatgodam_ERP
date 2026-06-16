



'use client';

import { activateUserAction, deactivateUserAction, deleteUserAction, resetUserPasswordAction, updateUserProfileAction, type User } from '@/app/actions/user-actions';
import { Users, Mail, Shield, UserCheck, UserX, Trash2, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function UsersManagementClient({ users }: { users: User[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetModal, setResetModal] = useState<{ userId: string; tempPassword: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editableUser, setEditableUser] = useState({
    fullName: '',
    companyName: '',
    phoneNumber: '',
    warehouseLocation: '',
    gstNumber: '',
  });

  const generateTemporaryPassword = () => {
    // Generate a readable password with mix of uppercase, lowercase, numbers
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const all = uppercase + lowercase + numbers;
    
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    
    for (let i = 0; i < 5; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleResetPassword = async (userId: string) => {
    const tempPassword = generateTemporaryPassword();
    setResetModal({ userId, tempPassword });
  };

  const copyPasswordToClipboard = () => {
    if (resetModal) {
      navigator.clipboard.writeText(resetModal.tempPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const confirmResetPassword = async () => {
    if (!resetModal) return;

    try {
      const formData = new FormData();
      formData.append('userId', resetModal.userId);
      formData.append('newPassword', resetModal.tempPassword);
      formData.append('confirmPassword', resetModal.tempPassword);

      await resetUserPasswordAction(formData);
      setResetModal(null);
      alert('Password reset successfully!');
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Failed to reset password');
    }
  };

  const getStatusBadge = (user: User) => {
    const status = user.status || 'ACTIVE';
    const isActive = status === 'ACTIVE';

    return (
      <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
        {status}
      </Badge>
    );
  };

  const getRoleBadge = (role: string) => {
    return (
      <Badge variant={role === 'ADMIN' ? "destructive" : "outline"}>
        <Shield className="h-3 w-3 mr-1" />
        {role}
      </Badge>
    );
  };

  const startEditingUser = (user: User) => {
    setEditingUserId(user._id);
    setEditableUser({
      fullName: user.fullName ?? '',
      companyName: user.companyName ?? '',
      phoneNumber: user.phoneNumber ?? '',
      warehouseLocation: user.warehouseLocation ?? '',
      gstNumber: user.gstNumber ?? '',
    });
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditableUser({
      fullName: '',
      companyName: '',
      phoneNumber: '',
      warehouseLocation: '',
      gstNumber: '',
    });
  };

  const handleFieldChange = (field: keyof typeof editableUser, value: string) => {
    setEditableUser((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async (userId: string) => {
    try {
      await updateUserProfileAction(
        userId,
        editableUser.fullName,
        editableUser.companyName,
        editableUser.phoneNumber,
        editableUser.warehouseLocation,
        editableUser.gstNumber
      );
      startTransition(() => {
        router.refresh();
      });
      cancelEditing();
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile.');
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete this user (${email})?`)) {
      return;
    }
    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('email', email);
      await deleteUserAction(formData);
      startTransition(() => {
        router.refresh();
      });
      alert('User deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(error.message || 'Failed to delete user');
    }
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6" />
          User Management
        </h1>
        <p className="text-slate-500 mt-1">
          View and manage all WSP user accounts, their access levels, and account status.
        </p>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            All Users ({users.length})
          </h2>
        </div>

        <div className="divide-y divide-slate-200">
          {users.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">
              No users found
            </div>
          ) : (
            users.map((user) => (
              <div key={user._id} className="px-6 py-4 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <div>
                        <span className="font-medium text-slate-900">
                          {user.email}
                        </span>
                        {user.fullName && (
                          <div className="text-sm text-slate-500">
                            {user.fullName}
                          </div>
                        )}
                        <div className="text-sm text-slate-500 mt-1 space-y-1">
                          <div>
                            <strong>Full Name:</strong> {user.fullName || 'Not provided'}
                          </div>
                          <div>
                            <strong>Phone:</strong> {user.phoneNumber || 'Not provided'}
                          </div>
                          <div>
                            <strong>Company:</strong> {user.companyName || 'Not provided'}
                          </div>
                          <div>
                            <strong>Warehouse:</strong> {user.warehouseLocation || 'Not provided'}
                          </div>
                          <div>
                            <strong>GST:</strong> {user.gstNumber || 'Not provided'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      {getRoleBadge(user.role)}
                      {getStatusBadge(user)}
                    </div>

                    <div className="space-y-1 text-sm text-slate-600">
                      <div>
                        <strong>Clients:</strong>{' '}
                        <a
                          href="/dashboard/clients"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View in Client Master ({user.clientAssociations?.length || 0})
                        </a>
                      </div>
                      <div>
                        <strong>Commodities:</strong>{' '}
                        <a
                          href="/dashboard/commodities"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View in Commodity Master ({user.commodityAssociations?.length || 0})
                        </a>
                      </div>
                      <div>
                        <strong>Warehouses:</strong>{' '}
                        <a
                          href="/dashboard/warehouses"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View in Warehouse Master ({user.warehouseAssociations?.length || 0})
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {user.createdAt && (
                        <span className="text-sm text-slate-500 hidden md:block">
                          Created: {new Date(user.createdAt).toLocaleDateString('en-GB')}
                        </span>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={editingUserId === user._id ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => (editingUserId === user._id ? cancelEditing() : startEditingUser(user))}
                        >
                          {editingUserId === user._id ? 'Close Editor' : 'Edit Profile'}
                        </Button>

                        {user.role !== 'ADMIN' && (
                          <>
                            {(user.status || 'ACTIVE') === 'ACTIVE' ? (
                              <form action={deactivateUserAction}>
                                <input type="hidden" name="userId" value={user._id.toString()} />
                                <input type="hidden" name="email" value={user.email} />
                                <Button
                                  type="submit"
                                  variant="outline"
                                  size="sm"
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                >
                                  <UserX className="h-4 w-4 mr-1" />
                                  Deactivate
                                </Button>
                              </form>
                            ) : (
                              <form action={activateUserAction}>
                                <input type="hidden" name="userId" value={user._id.toString()} />
                                <input type="hidden" name="email" value={user.email} />
                                <Button
                                  type="submit"
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Activate
                                </Button>
                              </form>
                            )}

                            <Button
                              onClick={() => handleResetPassword(user._id.toString())}
                              variant="outline"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              🔑 Reset Password
                            </Button>

                            <Button
                               type="button"
                               onClick={() => handleDeleteUser(user._id.toString(), user.email)}
                               variant="outline"
                               size="sm"
                               className="text-red-600 hover:text-red-700 hover:bg-red-50"
                             >
                               <Trash2 className="h-4 w-4 mr-1" />
                               Delete
                             </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {editingUserId === user._id && (
                  <div className="px-6 pb-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm text-slate-700">
                          <span>Full Name</span>
                          <input
                            type="text"
                            value={editableUser.fullName}
                            onChange={(e) => handleFieldChange('fullName', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          />
                        </label>

                        <label className="space-y-1 text-sm text-slate-700">
                          <span>Phone Number</span>
                          <input
                            type="text"
                            value={editableUser.phoneNumber}
                            onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          />
                        </label>

                        <label className="space-y-1 text-sm text-slate-700">
                          <span>Company</span>
                          <input
                            type="text"
                            value={editableUser.companyName}
                            onChange={(e) => handleFieldChange('companyName', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          />
                        </label>

                        <label className="space-y-1 text-sm text-slate-700">
                          <span>Warehouse Location</span>
                          <input
                            type="text"
                            value={editableUser.warehouseLocation}
                            onChange={(e) => handleFieldChange('warehouseLocation', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          />
                        </label>

                        <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
                          <span>GST Number</span>
                          <input
                            type="text"
                            value={editableUser.gstNumber}
                            onChange={(e) => handleFieldChange('gstNumber', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => handleSaveProfile(user._id.toString())}
                          disabled={isPending}
                        >
                          Save Profile
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Temporary Password</h2>
            
            <p className="text-sm text-slate-600">
              A temporary password has been generated. Please copy it and share with the user.
              The user can use this password to log in.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <code className="text-sm font-mono font-bold text-blue-900">
                {resetModal.tempPassword}
              </code>
              <button
                onClick={copyPasswordToClipboard}
                className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
              >
                {copiedPassword ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              <strong>Security Note:</strong> This is a temporary password. The user should change it after logging in.
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setResetModal(null)}
                className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetPassword}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors"
              >
                Confirm & Set Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
