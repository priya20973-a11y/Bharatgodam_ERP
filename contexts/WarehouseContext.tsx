'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Warehouse, Commodity, Client, Transaction } from '@/types/client';

interface WarehouseContextType {
  warehouses: Warehouse[];
  commodities: Commodity[];
  clients: Client[];
  transactions: Transaction[];
  isLoading: boolean;
  addWarehouse: (warehouse: Omit<Warehouse, 'id'>) => void;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => void;
  addCommodity: (commodity: Omit<Commodity, 'id'>) => void;
  addClient: (client: Omit<Client, 'id'>) => void;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  getCurrentStock: (clientId: string, commodityId: string, warehouseId: string) => number;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export const useWarehouse = () => {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error('useWarehouse must be used within a WarehouseProvider');
  }
  return context;
};

interface WarehouseProviderProps {
  children: ReactNode;
}

export const WarehouseProvider: React.FC<WarehouseProviderProps> = ({ children }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data from APIs
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Fetch each resource independently so one failure doesn't block the others
        const [warehousesRes, commoditiesRes, clientsRes, transactionsRes] = await Promise.allSettled([
          fetch('/api/warehouses'),
          fetch('/api/commodities'),
          fetch('/api/clients'),
          fetch('/api/transactions')
        ]);

        // Process warehouses
        if (warehousesRes.status === 'fulfilled') {
          const warehousesData = await warehousesRes.value.json();
          if (warehousesData.success) {
            setWarehouses(warehousesData.warehouses);
          }
        }

        // Process commodities
        if (commoditiesRes.status === 'fulfilled') {
          const commoditiesData = await commoditiesRes.value.json();
          if (commoditiesData.success) {
            setCommodities(commoditiesData.commodities);
          }
        }

        // Process clients
        if (clientsRes.status === 'fulfilled') {
          const clientsData = await clientsRes.value.json();
          if (clientsData.success) {
            setClients(clientsData.clients);
          }
        }

        // Process transactions (optional - may fail if user not authenticated)
        if (transactionsRes.status === 'fulfilled') {
          const transactionsData = await transactionsRes.value.json();
          if (transactionsData.success) {
            setTransactions(transactionsData.transactions);
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const addWarehouse = (warehouseData: Omit<Warehouse, 'id'>) => {
    const newWarehouse: Warehouse = {
      ...warehouseData,
      id: Date.now().toString(),
    };
    setWarehouses(prev => [...prev, newWarehouse]);
  };

  const updateWarehouse = (id: string, updates: Partial<Warehouse>) => {
    setWarehouses(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const addCommodity = (commodityData: Omit<Commodity, 'id'>) => {
    const newCommodity: Commodity = {
      ...commodityData,
      id: Date.now().toString(),
    };
    setCommodities(prev => [...prev, newCommodity]);
  };

  const addClient = (clientData: Omit<Client, 'id'>) => {
    const newClient: Client = {
      ...clientData,
      commodityIds: clientData.commodityIds || [],
      id: Date.now().toString(),
    };
    setClients(prev => [...prev, newClient]);
  };

  const addTransaction = (transactionData: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = {
      ...transactionData,
      id: Date.now().toString(),
    };
    setTransactions(prev => [...prev, newTransaction]);

    // Update warehouse capacity for inward transactions
    if (transactionData.type === 'Inward') {
      setWarehouses(prev => prev.map(w =>
        w.id === transactionData.warehouseId
          ? { ...w, availableCapacity: w.availableCapacity - transactionData.quantity }
          : w
      ));
    }
  };

  const getCurrentStock = (clientId: string, commodityId: string, warehouseId: string): number => {
    const relevantTransactions = transactions.filter(t =>
      t.clientId === clientId &&
      t.commodityId === commodityId &&
      t.warehouseId === warehouseId
    );

    return relevantTransactions.reduce((stock, t) => {
      return t.type === 'Inward' ? stock + t.quantity : stock - t.quantity;
    }, 0);
  };

  return (
    <WarehouseContext.Provider value={{
      warehouses,
      commodities,
      clients,
      transactions,
      isLoading,
      addWarehouse,
      updateWarehouse,
      addCommodity,
      addClient,
      addTransaction,
      getCurrentStock
    }}>
      {children}
    </WarehouseContext.Provider>
  );
};