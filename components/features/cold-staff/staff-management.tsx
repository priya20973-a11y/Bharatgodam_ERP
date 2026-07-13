'use client';

import { useState, useEffect } from 'react';
import { getStaffList, createStaff, updateStaff, deleteStaff, toggleStaffStatus, resetStaffPassword } from '@/app/actions/cold-staff-actions';
import { Plus, Edit, Trash2, Key, UserCheck, UserX } from 'lucide-react';
import { PermissionModule } from '@/lib/permissions';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

const MODULES: { id: PermissionModule; key: string }[] = [
  { id: 'dashboard', key: 'dashboard' },
  { id: 'warehouse', key: 'warehouse' },
  { id: 'commodity', key: 'commodity' },
  { id: 'inward', key: 'inward' },
  { id: 'outward', key: 'outward' },
  { id: 'ledger', key: 'ledger' },
  { id: 'invoice', key: 'invoice' },
  { id: 'reports', key: 'reports' },
  { id: 'clientMaster', key: 'clientMaster' },
  { id: 'floorMapping', key: 'floorMapping' },
];

const ACTIONS = ['view', 'create', 'edit', 'delete', 'print', 'approve'];

export default function StaffManagement() {
  const { t } = useColdTranslation();
  const [staff, setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phoneNumber: '',
    permissions: {} as any
  });

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    setIsLoading(true);
    try {
      const data = await getStaffList();
      setStaff(data);
    } catch (error) {
      console.error(error);
      alert(t('staff.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingStaff(null);
    setFormData({
      fullName: '',
      email: '',
      password: '',
      phoneNumber: '',
      permissions: {}
    });
    setIsModalOpen(true);
  };

  const openEditModal = (s: any) => {
    setEditingStaff(s);
    setFormData({
      fullName: s.fullName,
      email: s.email,
      password: '',
      phoneNumber: s.phoneNumber,
      permissions: s.permissions || {}
    });
    setIsModalOpen(true);
  };

  const handlePermissionChange = (mod: string, act: string, checked: boolean) => {
    setFormData(prev => {
      const currentMod = prev.permissions[mod] || {};
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [mod]: {
            ...currentMod,
            [act]: checked
          }
        }
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStaff) {
        await updateStaff(editingStaff._id, formData);
        alert(t('staff.updatedSuccess'));
      } else {
        await createStaff(formData);
        alert(t('staff.createdSuccess'));
      }
      setIsModalOpen(false);
      loadStaff();
    } catch (error: any) {
      alert(error.message || t('staff.failedToSave'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('staff.deleteConfirm'))) return;
    try {
      await deleteStaff(id);
      loadStaff();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await toggleStaffStatus(id, newStatus);
      loadStaff();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return alert(t('staff.enterNewPassword'));
    try {
      await resetStaffPassword(selectedStaffId, newPassword);
      alert(t('staff.passwordResetSuccess'));
      setPasswordModalOpen(false);
      setNewPassword('');
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (isLoading) return <div>{t('staff.loadingStaff')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('staff.pageTitle')}</h1>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> {t('staff.addStaff')}
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('staff.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('staff.email')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('staff.status')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('staff.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {staff.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">{t('staff.noStaffFound')}</td></tr>
            )}
            {staff.map((s) => (
              <tr key={s._id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{s.fullName}</div>
                  <div className="text-sm text-gray-500">{s.phoneNumber}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button onClick={() => openEditModal(s)} className="text-indigo-600 hover:text-indigo-900" title="Edit">
                    <Edit className="h-4 w-4 inline" />
                  </button>
                  <button onClick={() => handleToggleStatus(s._id, s.status)} className={`${s.status === 'ACTIVE' ? 'text-orange-600' : 'text-green-600'} hover:text-gray-900`} title={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}>
                    {s.status === 'ACTIVE' ? <UserX className="h-4 w-4 inline" /> : <UserCheck className="h-4 w-4 inline" />}
                  </button>
                  <button onClick={() => { setSelectedStaffId(s._id); setPasswordModalOpen(true); }} className="text-blue-600 hover:text-blue-900" title="Reset Password">
                    <Key className="h-4 w-4 inline" />
                  </button>
                  <button onClick={() => handleDelete(s._id)} className="text-red-600 hover:text-red-900" title="Delete">
                    <Trash2 className="h-4 w-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Main Staff Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">{editingStaff ? t('staff.editStaff') : t('staff.addStaff')}</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('staff.fullName')}</label>
                    <input type="text" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('staff.phoneNumber')}</label>
                    <input type="text" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('staff.loginId')}</label>
                    <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                  </div>
                  {!editingStaff && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t('staff.password')}</label>
                      <input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">{t('staff.permissions')}</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('staff.module')}</th>
                          {ACTIONS.map(act => (
                            <th key={act} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">{t(`staff.actionsList.${act}` as any)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {MODULES.map(mod => (
                          <tr key={mod.id}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{t(`staff.modules.${mod.key}` as any)}</td>
                            {ACTIONS.map(act => {
                              const isChecked = !!(formData.permissions[mod.id]?.[act]);
                              return (
                                <td key={act} className="px-4 py-2 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={(e) => handlePermissionChange(mod.id, act, e.target.checked)}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">{t('staff.cancel')}</button>
                  <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">{t('staff.save')}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{t('staff.resetPasswordTitle')}</h2>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('staff.newPassword')}</label>
                <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => { setPasswordModalOpen(false); setNewPassword(''); }} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">{t('staff.cancel')}</button>
                <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">{t('staff.update')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
