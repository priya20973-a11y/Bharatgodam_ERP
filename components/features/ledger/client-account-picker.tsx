'use client';

import { useState, useCallback, useEffect } from 'react';
import { searchClientAccounts, createClientAccount } from '@/app/actions/consolidated-ledger';
import { toast } from 'react-hot-toast';
import type { IClientAccount } from '@/types/schemas';
import { ChevronDown, Users, Plus } from 'lucide-react';
import { sanitizeClientName } from '@/lib/ledger-engine';

interface ClientAccountPickerProps {
  onSelectAccount: (account: IClientAccount) => void;
  onCreateNew?: (clientName: string) => void;
  placeholder?: string;
  className?: string;
}

export function ClientAccountPicker({
  onSelectAccount,
  onCreateNew,
  placeholder = 'Search or create client account...',
  className = '',
}: ClientAccountPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IClientAccount[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<IClientAccount | null>(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const result = await searchClientAccounts(searchQuery);
        if (result.success && result.data) {
          setSearchResults(result.data);
        } else {
          toast.error(result.message || 'Search failed');
        }
      } catch (error) {
        toast.error('Search error');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectAccount = useCallback(
    (account: IClientAccount) => {
      setSelectedAccount(account);
      setSearchQuery(account.clientName);
      setIsDropdownOpen(false);
      onSelectAccount(account);
    },
    [onSelectAccount]
  );

  const handleCreateNew = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a client name');
      return;
    }

    setIsCreatingNew(true);
    try {
      const result = await createClientAccount(searchQuery.trim());
      if (result.success && result.data) {
        toast.success('Account created successfully');
        handleSelectAccount(result.data.account);
        setSearchQuery('');
        setSearchResults([]);
        onCreateNew?.(searchQuery);
      } else {
        toast.error(result.message || 'Failed to create account');
      }
    } catch (error) {
      toast.error('Error creating account');
      console.error(error);
    } finally {
      setIsCreatingNew(false);
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Selected Account Display */}
      {selectedAccount && (
        <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm font-medium text-blue-900">
            ✓ Selected: {selectedAccount.clientName}
          </p>
          <p className="text-xs text-blue-700">ID: {selectedAccount.bookingId}</p>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <div className="relative flex items-center">
          <Users className="absolute left-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
              if (!selectedAccount || selectedAccount.clientName !== e.target.value) {
                setSelectedAccount(null);
              }
            }}
            placeholder={placeholder}
            onFocus={() => setIsDropdownOpen(true)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <ChevronDown
            className={`absolute right-3 w-4 h-4 text-gray-400 transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-72 overflow-y-auto">
            {isLoading && (
              <div className="p-4 text-center text-gray-500">Searching...</div>
            )}

            {!isLoading && searchQuery.length < 2 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Type at least 2 characters to search
              </div>
            )}

            {!isLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="p-3 space-y-2">
                <p className="text-sm text-gray-600">No accounts found</p>
                <button
                  onClick={handleCreateNew}
                  disabled={isCreatingNew}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded border border-green-300 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreatingNew ? 'Creating...' : 'Create New Account'}
                </button>
              </div>
            )}

            {/* Search Results */}
            {!isLoading && searchResults.length > 0 && (
              <div className="py-2">
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600">
                  Use Existing ({searchResults.length})
                </div>
                {searchResults.map((account) => (
                  <button
                    key={account.bookingId}
                    onClick={() => handleSelectAccount(account)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 flex items-start justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{sanitizeClientName(account.clientName)}</p>
                      <p className="text-xs text-gray-500">ID: {account.bookingId}</p>
                      {account.clientLocation && (
                        <p className="text-xs text-gray-500">{account.clientLocation}</p>
                      )}
                    </div>
                    <span className="text-green-600 text-lg">✓</span>
                  </button>
                ))}

                <button
                  onClick={handleCreateNew}
                  disabled={isCreatingNew}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 m-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded border border-green-300 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreatingNew ? 'Creating...' : 'Create New Account'}
                </button>
              </div>
            )}

            {/* No results, create new */}
            {!isLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600">
                Or create new below ↓
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      <p className="mt-2 text-xs text-gray-500">
        {selectedAccount
          ? `Selected: ${sanitizeClientName(selectedAccount.clientName)} (${selectedAccount.bookingId})`
          : 'Search for existing clients or create a new account'}
      </p>
    </div>
  );
}
