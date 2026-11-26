import { expect, test, type Page } from '@playwright/test';

const userId = 'offline-test-user';

const offlineData = {
  auth: {
    userId,
    email: 'offline@example.test',
    fullName: 'Offline Test User',
    role: 'ADMIN',
    storagePlan: 'COLD',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  warehouses: [{
    _id: 'warehouse-1',
    name: 'Test Warehouse',
    chambers: [{
      name: 'C1',
      chamberNo: 1,
      floors: [{
        name: 'Floor 1',
        floorNo: 1,
        stacks: [
          { name: 'Stack 1', stackNo: 1 },
          { name: 'Stack 2', stackNo: 2 },
        ],
      }],
    }],
  }],
  clients: [{ _id: 'client-1', name: 'Test Farmer', clientType: 'FARMER', commodityIds: ['commodity-1'] }],
  commodities: [{ _id: 'commodity-1', name: 'Test Wheat', unit: 'KG' }],
  inwards: [{
    _id: 'inward-1',
    qrId: 'test-rack-qr',
    lotNo: 'LOT-1',
    quantityKg: 500,
    bagsCount: 50,
    clientId: { _id: 'client-1', name: 'Test Farmer' },
    commodityId: { _id: 'commodity-1', name: 'Test Wheat', unit: 'KG' },
    warehouseId: { _id: 'warehouse-1', name: 'Test Warehouse' },
    stackAllocations: [{
      chamberName: 'C1',
      chamberNo: 1,
      floorNo: 1,
      stackNo: 1,
      allocatedWeight: 500,
      bagsCount: 50,
    }],
  }],
  outwardStock: [{
    ownerId: 'client-1',
    isWarehouse: false,
    inwards: [{
      _id: 'inward-1',
      uniqueKey: 'inward-1',
      _offlineOwnerId: 'client-1',
      qrId: 'test-rack-qr',
      lotNo: 'LOT-1',
      receiptNumber: 'RECEIPT-1',
      quantityKg: 500,
      remainingQuantityKg: 500,
      availableQty: 500,
      bagsCount: 50,
      clientId: { _id: 'client-1', name: 'Test Farmer' },
      commodityId: { _id: 'commodity-1', name: 'Test Wheat', unit: 'KG' },
      warehouseId: { _id: 'warehouse-1', name: 'Test Warehouse' },
      availableAllocations: [
        {
          chamberName: 'C1',
          chamberNo: 1,
          floorNo: 1,
          stackNo: 1,
          allocatedWeight: 300,
          availableQty: 300,
          bagsCount: 30,
        },
        {
          chamberName: 'C1',
          chamberNo: 1,
          floorNo: 1,
          stackNo: 2,
          allocatedWeight: 200,
          availableQty: 200,
          bagsCount: 20,
        },
      ],
    }],
  }],
};

interface MockSharedDraft {
  transactionId: string;
  type: 'COLD_INWARD' | 'COLD_OUTWARD';
  payload: Record<string, unknown>;
  status: 'DRAFT';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

async function mockSharedDraftApi(page: Page, drafts: MockSharedDraft[]) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: userId, email: offlineData.auth.email, role: 'ADMIN' },
        expires: offlineData.auth.expiresAt,
      }),
    });
  });
  await page.route('**/api/offline/bootstrap', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId,
        warehouses: offlineData.warehouses,
        clients: offlineData.clients,
        commodities: offlineData.commodities,
        inwards: offlineData.inwards,
        outwardStock: offlineData.outwardStock,
      }),
    });
  });
  await page.route('**/api/offline/drafts', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          allowedTypes: ['COLD_INWARD', 'COLD_OUTWARD'],
          drafts,
          submittedTransactionIds: [],
        }),
      });
      return;
    }

    const body = request.postDataJSON() as {
      transactionId: string;
      type?: MockSharedDraft['type'];
      payload?: Record<string, unknown>;
      expectedRevision?: number;
    };
    if (request.method() === 'DELETE') {
      const index = drafts.findIndex((draft) => draft.transactionId === body.transactionId);
      if (index >= 0) drafts.splice(index, 1);
      await route.fulfill({
        status: index < 0 ? 404 : 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: index >= 0 }),
      });
      return;
    }

    const existing = drafts.find((draft) => draft.transactionId === body.transactionId);
    if (existing && body.expectedRevision !== existing.revision &&
      JSON.stringify(body.payload) !== JSON.stringify(existing.payload)) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Revision conflict.' }),
      });
      return;
    }
    const now = new Date().toISOString();
    const saved: MockSharedDraft = existing
      ? { ...existing, payload: body.payload || {}, revision: existing.revision + 1, updatedAt: now }
      : {
        transactionId: body.transactionId,
        type: body.type || 'COLD_INWARD',
        payload: body.payload || {},
        status: 'DRAFT',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    if (existing) drafts[drafts.indexOf(existing)] = saved;
    else drafts.push(saved);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, draft: saved }),
    });
  });
}

async function prepareAuthenticatedOfflinePage(page: Page) {
  await page.goto('/offline', { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await seedOfflineDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Cold storage offline workspace' })).toBeVisible();
}

async function seedOfflineDatabase(page: Page) {
  await page.evaluate(async (data) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bharatgodam-offline', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth', { keyPath: 'userId' });
        if (!db.objectStoreNames.contains('references')) {
          const references = db.createObjectStore('references', { keyPath: 'key' });
          references.createIndex('byUser', 'userId');
          references.createIndex('byUserAndKind', ['userId', 'kind']);
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const transactions = db.createObjectStore('transactions', { keyPath: 'transactionId' });
          transactions.createIndex('byUser', 'userId');
          transactions.createIndex('byUserAndStatus', ['userId', 'status']);
          transactions.createIndex('byUserAndNextAttempt', ['userId', 'nextAttemptAt']);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['auth', 'references'], 'readwrite');
      transaction.objectStore('auth').put(data.auth);
      const references = transaction.objectStore('references');
      for (const [kind, values] of Object.entries({
        warehouses: data.warehouses,
        clients: data.clients,
        commodities: data.commodities,
        inwards: data.inwards,
        outwardStock: data.outwardStock,
      })) {
        values.forEach((value, index) => references.put({
          key: `${data.auth.userId}:${kind}:${index}`,
          userId: data.auth.userId,
          kind,
          value,
          updatedAt: new Date().toISOString(),
        }));
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, offlineData);
}

async function readOfflineTransactions(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('bharatgodam-offline', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = await new Promise<Array<{
      transactionId: string;
      userId: string;
      type: string;
      status: string;
      lastError?: string;
      payload: {
        common?: { truckNo?: string };
        truckNo?: string;
        clients?: Array<{
          stacks?: Array<{
            chamberName: string;
            chamberNo: number;
            floorNo: number;
            stackNo: number;
            allocatedWeight: number;
            allocatedBags: number;
          }>;
        }>;
        items?: Array<{
          quantityKg?: number;
          bagsCount?: number;
          truckNo?: string;
        }>;
      };
    }>>((resolve, reject) => {
      const request = database.transaction('transactions').objectStore('transactions').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return entries;
  });
}

async function openOfflineWorkspace(page: Page) {
  await page.goto('/offline', { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await seedOfflineDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Cold storage offline workspace' })).toBeVisible();
  await expect(page.getByText('Offline Test User')).toBeVisible();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline Test User')).toBeVisible();
}

async function scanCachedOutwardReceipt(page: Page, qrText = 'test-rack-qr') {
  const form = page.locator('form').last();
  await form.getByRole('button', { name: 'Scan Receipt QR' }).click();
  await page.getByPlaceholder('Scan or paste Receipt QR code text...').fill(qrText);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
}

async function saveOfflineOutwardDraft(
  page: Page,
  truckNo: string,
  firstStackWeight: string,
  firstStackBags: string,
  secondStackWeight?: string,
) {
  await scanCachedOutwardReceipt(page);
  const form = page.locator('form').first();
  await expect(form.getByLabel('Verify Stock with QR')).toBeVisible();
  await form.getByLabel('Verify Stock with QR').uncheck();
  if (secondStackWeight === undefined) {
    await form.getByLabel('Use stack 2').uncheck();
  } else {
    await form.getByLabel('Outward weight for stack 2').fill(secondStackWeight);
    await form.getByLabel('Large bags for stack 2').fill('1');
  }
  await form.getByPlaceholder('Enter Truck Number').fill(truckNo);
  await form.getByLabel('Outward weight for stack 1').fill(firstStackWeight);
  await form.getByLabel('Large bags for stack 1').fill(firstStackBags);
  await form.getByRole('button', { name: 'Save Outward Draft' }).click();
}

test.describe('Cold-storage offline workspace', () => {
  test('opens the offline workspace from the PWA start URL without first visiting it online', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        });
      }
    });
    await seedOfflineDatabase(page);
    await page.context().setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Cold storage offline workspace' })).toBeVisible();
    await expect(page.getByText('Offline Test User')).toBeVisible();
  });

  test('shares an offline draft after reconnect and lets another device resume and delete it', async ({ page, browser }) => {
    const sharedDrafts: MockSharedDraft[] = [];
    let finalSubmissionCount = 0;
    await page.route('**/api/offline/sync', async (route) => {
      finalSubmissionCount += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Automatic final submission is not allowed.' }),
      });
    });
    await mockSharedDraftApi(page, sharedDrafts);
    await prepareAuthenticatedOfflinePage(page);
    await expect(page.getByText('Offline Test User')).toBeVisible();
    await page.waitForTimeout(300);

    await page.context().setOffline(true);
    const form = page.locator('form').first();
    await form.locator('select').nth(0).selectOption('warehouse-1');
    await form.locator('select').nth(1).selectOption('client-1');
    await form.locator('select').nth(2).selectOption('commodity-1');
    await form.getByPlaceholder('Lot number').fill('CROSS-DEVICE-LOT');
    await form.getByPlaceholder('Truck number').fill('CROSS-DEVICE-TRUCK');
    await form.getByPlaceholder('Net weight (kg)').fill('100');
    await form.getByPlaceholder('Bags').fill('10');
    await form.locator('select').nth(3).selectOption('1');
    await form.locator('select').nth(4).selectOption('1');
    await form.locator('select').nth(5).selectOption('1');
    await form.getByRole('button', { name: 'Save inward offline' }).click();
    const [localDraft] = await readOfflineTransactions(page);
    expect(sharedDrafts).toHaveLength(0);

    await page.context().setOffline(false);
    await expect.poll(() => sharedDrafts.length).toBe(1);
    expect(finalSubmissionCount).toBe(0);
    expect(sharedDrafts[0].transactionId).toBe(localDraft.transactionId);
    expect(sharedDrafts[0].status).toBe('DRAFT');
    expect(sharedDrafts[0].payload).toMatchObject({
      common: { truckNo: 'CROSS-DEVICE-TRUCK' },
    });

    const secondContext = await browser.newContext({ baseURL: 'http://localhost:3100' });
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.route('**/api/offline/sync', async (route) => {
        finalSubmissionCount += 1;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Automatic final submission is not allowed.' }),
        });
      });
      await mockSharedDraftApi(secondPage, sharedDrafts);
      await prepareAuthenticatedOfflinePage(secondPage);
      await expect(secondPage.getByText('Saved transactions: 1')).toBeVisible();
      await secondPage.getByText('View Transaction').click();
      await expect(secondPage.locator('pre').first()).toContainText('CROSS-DEVICE-LOT');
      await secondPage.getByRole('button', { name: 'Resume Transaction' }).click();
      await expect(secondPage.getByPlaceholder('Truck number')).toHaveValue('CROSS-DEVICE-TRUCK');
      await secondPage.getByRole('button', { name: 'Save Draft Changes' }).click();
      await expect.poll(() => sharedDrafts[0].revision).toBeGreaterThan(1);
      expect(finalSubmissionCount).toBe(0);

      secondPage.once('dialog', (dialog) => dialog.accept());
      await secondPage.getByRole('button', { name: 'Delete Draft' }).click();
      await expect(secondPage.getByText('No saved transactions are available.')).toBeVisible();
      expect(sharedDrafts).toHaveLength(0);
    } finally {
      await secondContext.close();
    }
  });

  test('queues inward data in IndexedDB and keeps it after an offline reload', async ({ page }) => {
    await openOfflineWorkspace(page);

    const form = page.locator('form').first();
    for (let index = 1; index <= 5; index += 1) {
      await form.locator('select').nth(0).selectOption('warehouse-1');
      await form.locator('select').nth(1).selectOption('client-1');
      await form.locator('select').nth(2).selectOption('commodity-1');
      await form.getByPlaceholder('Lot number').fill(`OFFLINE-LOT-${index}`);
      await form.getByPlaceholder('Truck number').fill(`TRUCK-${index}`);
      await form.getByPlaceholder('Net weight (kg)').fill('100');
      await form.getByPlaceholder('Bags').fill('10');
      await form.locator('select').nth(3).selectOption('1');
      await form.locator('select').nth(4).selectOption('1');
      await form.locator('select').nth(5).selectOption('1');
      await form.getByRole('button', { name: 'Save inward offline' }).click();
      await expect(page.getByText(`Saved transactions: ${index}`)).toBeVisible();
    }

    await expect(page.getByText(/Saved as a draft/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Offline Test User')).toBeVisible();
    await expect(page.getByText('Saved transactions: 5')).toBeVisible();

    const saved = await readOfflineTransactions(page);
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((transaction) => transaction.transactionId)).size).toBe(5);
    for (const transaction of saved) {
      expect(transaction).toMatchObject({
        userId,
        type: 'COLD_INWARD',
        status: 'DRAFT',
      });
    }
  });

  test('keeps inward Drafts local on reconnect and submits only after an explicit retryable action', async ({ page }) => {
    let syncAttempts = 0;
    const submittedIds: string[] = [];
    await page.route('**/api/offline/sync', async (route) => {
      syncAttempts += 1;
      const requestBody = route.request().postDataJSON() as { transactionId: string };
      submittedIds.push(requestBody.transactionId);
      if (syncAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporarily unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { receiptNumber: 'COLD-RECEIPT-1' } }),
      });
    });

    await openOfflineWorkspace(page);
    const form = page.locator('form').first();
    await form.locator('select').nth(0).selectOption('warehouse-1');
    await form.locator('select').nth(1).selectOption('client-1');
    await form.locator('select').nth(2).selectOption('commodity-1');
    await form.getByPlaceholder('Lot number').fill('EXPLICIT-SUBMIT-LOT');
    await form.getByPlaceholder('Truck number').fill('TRUCK-SUBMIT');
    await form.getByPlaceholder('Net weight (kg)').fill('100');
    await form.getByPlaceholder('Bags').fill('10');
    await form.locator('select').nth(3).selectOption('1');
    await form.locator('select').nth(4).selectOption('1');
    await form.locator('select').nth(5).selectOption('1');
    await form.getByRole('button', { name: 'Save inward offline' }).click();
    await expect(page.getByText('Saved transactions: 1')).toBeVisible();

    await page.context().setOffline(false);
    await page.waitForTimeout(500);
    expect(syncAttempts).toBe(0);
    expect(await readOfflineTransactions(page)).toMatchObject([
      { type: 'COLD_INWARD', status: 'DRAFT' },
    ]);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByRole('status').filter({
      hasText: 'Temporarily unavailable',
    })).toBeVisible();
    expect(await readOfflineTransactions(page)).toMatchObject([
      { type: 'COLD_INWARD', status: 'DRAFT', lastError: 'Temporarily unavailable' },
    ]);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByText('Synced')).toBeVisible();
    expect(syncAttempts).toBe(2);
    expect(submittedIds).toHaveLength(2);
    expect(submittedIds[0]).toBe(submittedIds[1]);
    expect(await readOfflineTransactions(page)).toMatchObject([
      { type: 'COLD_INWARD', status: 'SYNCED' },
    ]);
  });

  test('splits inward across multiple stacks and rejects mismatched allocation totals', async ({ page }) => {
    await openOfflineWorkspace(page);

    const form = page.locator('form').first();
    await form.locator('select').nth(0).selectOption('warehouse-1');
    await form.locator('select').nth(1).selectOption('client-1');
    await form.locator('select').nth(2).selectOption('commodity-1');
    await form.getByPlaceholder('Lot number').fill('MULTI-STACK-LOT');
    await form.getByPlaceholder('Truck number').fill('TRUCK-MULTI');
    await form.getByPlaceholder('Net weight (kg)').fill('100');
    await form.getByPlaceholder('Bags').fill('10');
    await form.getByLabel('Chamber for stack 1').selectOption('1');
    await form.getByLabel('Floor for stack 1').selectOption('1');
    await form.getByLabel('Rack / stack 1').selectOption('1');
    await form.getByRole('button', { name: 'Add another stack' }).click();
    await form.getByLabel('Chamber for stack 2').selectOption('1');
    await form.getByLabel('Floor for stack 2').selectOption('1');
    await form.getByLabel('Rack / stack 2').selectOption('2');
    await form.getByLabel('Allocated weight for stack 1').fill('40');
    await form.getByLabel('Allocated bags for stack 1').fill('4');
    await form.getByLabel('Allocated weight for stack 2').fill('50');
    await form.getByLabel('Allocated bags for stack 2').fill('5');
    await form.getByRole('button', { name: 'Save inward offline' }).click();
    await expect(page.getByRole('status').filter({
      hasText: 'Stack allocations must add up to the total inward weight and bags.',
    })).toBeVisible();
    expect(await readOfflineTransactions(page)).toHaveLength(0);

    await form.getByLabel('Allocated weight for stack 2').fill('60');
    await form.getByLabel('Allocated bags for stack 2').fill('6');
    await form.getByRole('button', { name: 'Save inward offline' }).click();
    await expect(page.getByText('Saved transactions: 1')).toBeVisible();

    const [saved] = await readOfflineTransactions(page);
    expect(saved.payload.clients?.[0].stacks).toEqual([
      {
        chamberName: 'C1',
        chamberNo: 1,
        floorNo: 1,
        stackNo: 1,
        allocatedWeight: 40,
        allocatedBags: 4,
      },
      {
        chamberName: 'C1',
        chamberNo: 1,
        floorNo: 1,
        stackNo: 2,
        allocatedWeight: 60,
        allocatedBags: 6,
      },
    ]);
  });

  test('resumes and edits an inward Draft without changing its transaction ID', async ({ page }) => {
    let submittedId = '';
    await page.route('**/api/offline/sync', async (route) => {
      submittedId = (route.request().postDataJSON() as { transactionId: string }).transactionId;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { receiptNumber: 'INWARD-RESUME-1' } }),
      });
    });

    await openOfflineWorkspace(page);
    const form = page.locator('form').first();
    await form.locator('select').nth(0).selectOption('warehouse-1');
    await form.locator('select').nth(1).selectOption('client-1');
    await form.locator('select').nth(2).selectOption('commodity-1');
    await form.getByPlaceholder('Lot number').fill('RESUME-INWARD-LOT');
    await form.getByPlaceholder('Truck number').fill('TRUCK-BEFORE');
    await form.getByPlaceholder('Net weight (kg)').fill('100');
    await form.getByPlaceholder('Bags').fill('10');
    await form.locator('select').nth(3).selectOption('1');
    await form.locator('select').nth(4).selectOption('1');
    await form.locator('select').nth(5).selectOption('1');
    await form.getByRole('button', { name: 'Save inward offline' }).click();
    const [beforeEdit] = await readOfflineTransactions(page);

    await page.getByRole('button', { name: 'Resume Transaction' }).click();
    await expect(page.getByRole('heading', { name: 'Resume inward draft' })).toBeVisible();
    await page.getByPlaceholder('Truck number').fill('TRUCK-AFTER');
    await page.getByRole('button', { name: 'Save Draft Changes' }).click();

    let [afterEdit] = await readOfflineTransactions(page);
    expect(afterEdit.transactionId).toBe(beforeEdit.transactionId);
    expect(afterEdit.status).toBe('DRAFT');
    expect(afterEdit.payload.common?.truckNo).toBe('TRUCK-AFTER');

    await page.reload();
    await expect(page.getByText('Saved transactions: 1')).toBeVisible();
    await page.getByRole('button', { name: 'Resume Transaction' }).click();
    await expect(page.getByPlaceholder('Truck number')).toHaveValue('TRUCK-AFTER');
    await page.getByRole('button', { name: 'Save Draft Changes' }).click();
    await page.context().setOffline(false);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByText('Synced')).toBeVisible();
    [afterEdit] = await readOfflineTransactions(page);
    expect(afterEdit.transactionId).toBe(beforeEdit.transactionId);
    expect(submittedId).toBe(beforeEdit.transactionId);
  });

  test('resolves receipt QR locally and queues full-featured outward drafts', async ({ page }) => {
    await openOfflineWorkspace(page);
    await page.getByRole('button', { name: 'Outward', exact: true }).click();
    await scanCachedOutwardReceipt(page, 'unknown-rack');
    await expect(page.getByText(/No matching inward or ownership-transfer stock/)).toBeVisible();

    for (let index = 1; index <= 5; index += 1) {
      await saveOfflineOutwardDraft(page, `TRUCK-${index}`, '25', '2');
      await expect(page.getByText(`Saved transactions: ${index}`)).toBeVisible();
    }

    await expect(page.getByText(/Outward saved as a draft/i)).toBeVisible();
    await expect(page.getByText(/OUTWARD ·/)).toHaveCount(5);
    await page.getByText('View Transaction').first().click();
    await expect(page.locator('pre').first()).toContainText(/"truckNo": "TRUCK-[1-5]"/);
    const saved = await readOfflineTransactions(page);
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((transaction) => transaction.transactionId)).size).toBe(5);
    for (const transaction of saved) {
      expect(transaction).toMatchObject({
        userId,
        type: 'COLD_OUTWARD',
        status: 'DRAFT',
      });
    }
  });

  test('searches and selects outward lots from cached data without a server action', async ({ page }) => {
    let serverActionRequests = 0;
    await openOfflineWorkspace(page);
    page.on('request', (request) => {
      if (request.headers()['next-action']) serverActionRequests += 1;
    });
    await page.getByRole('button', { name: 'Outward', exact: true }).click();
    const form = page.locator('form').first();
    await form.getByText('Select Lot Numbers...', { exact: true }).click();
    await form.getByPlaceholder('Search by Lot No...').fill('LOT-1');
    await expect(form.getByText('LOT-1', { exact: true })).toBeVisible();
    await form.getByText('LOT-1', { exact: true }).click();
    await form.getByRole('button', { name: 'Add Selected' }).click();
    await expect(form.getByText('1 inward(s) selected')).toBeVisible();
    expect(serverActionRequests).toBe(0);
  });

  test('resumes a full outward draft and syncs only after explicit confirmation', async ({ page }) => {
    let submittedId = '';
    const submittedIds: string[] = [];
    await page.route('**/api/offline/sync', async (route) => {
      submittedId = (route.request().postDataJSON() as { transactionId: string }).transactionId;
      submittedIds.push(submittedId);
      if (submittedIds.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporarily unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { receiptNumber: 'OUTWARD-RESUME-1' } }),
      });
    });

    await openOfflineWorkspace(page);
    await page.getByRole('button', { name: 'Outward', exact: true }).click();
    await saveOfflineOutwardDraft(page, 'OUTWARD-BEFORE', '25', '2');
    const [beforeEdit] = await readOfflineTransactions(page);

    await page.getByRole('button', { name: 'Resume Transaction' }).click();
    await expect(page.getByRole('heading', { name: 'Resume outward draft' })).toBeVisible();
    const form = page.locator('form').first();
    await form.getByPlaceholder('Enter Truck Number').fill('OUTWARD-AFTER');
    await form.getByLabel('Outward weight for stack 1').fill('30');
    await page.getByRole('button', { name: 'Save Draft Changes' }).click();

    let [afterEdit] = await readOfflineTransactions(page);
    expect(afterEdit.transactionId).toBe(beforeEdit.transactionId);
    expect(afterEdit.status).toBe('DRAFT');
    expect(afterEdit.payload.truckNo).toBe('OUTWARD-AFTER');
    expect(afterEdit.payload.items?.[0]).toMatchObject({
      quantityKg: 30,
      bagsCount: 3,
    });

    await page.context().setOffline(false);
    await page.waitForTimeout(500);
    expect(submittedIds).toHaveLength(0);

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByText('Pending Sync', { exact: true })).toBeVisible();
    expect(submittedIds).toHaveLength(0);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByText('Sync Failed')).toBeVisible();
    [afterEdit] = await readOfflineTransactions(page);
    expect(afterEdit.transactionId).toBe(beforeEdit.transactionId);
    expect(afterEdit.payload).toEqual(expect.objectContaining({ truckNo: 'OUTWARD-AFTER' }));
    expect(afterEdit.lastError).toBe('Temporarily unavailable');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit Transaction' }).click();
    await expect(page.getByText('Synced')).toBeVisible();
    [afterEdit] = await readOfflineTransactions(page);
    expect(afterEdit.transactionId).toBe(beforeEdit.transactionId);
    expect(submittedId).toBe(beforeEdit.transactionId);
    expect(submittedIds).toEqual([beforeEdit.transactionId, beforeEdit.transactionId]);
  });

  test('supports multi-stack outward and deducts local drafts from available stock', async ({ page }) => {
    await openOfflineWorkspace(page);
    await page.getByRole('button', { name: 'Outward', exact: true }).click();
    await saveOfflineOutwardDraft(page, 'MULTI-STACK-TRUCK', '30', '3', '20');
    const [saved] = await readOfflineTransactions(page);
    expect(saved.payload.items).toHaveLength(2);
    expect(saved.payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ stackNo: 1, quantityKg: 30, bagsCount: 3 }),
      expect.objectContaining({ stackNo: 2, quantityKg: 10, bagsCount: 1 }),
    ]));

    await scanCachedOutwardReceipt(page);
    const form = page.locator('form').first();
    await form.getByLabel('Verify Stock with QR').uncheck();
    await form.getByLabel('Use stack 2').uncheck();
    await form.getByPlaceholder('Enter Truck Number').fill('OVER-STOCK-TRUCK');
    await form.getByLabel('Large bags for stack 1').fill('2');
    await form.getByLabel('Outward weight for stack 1').fill('271');
    await form.getByRole('button', { name: 'Save Outward Draft' }).click();
    await expect(page.getByText(/exceeds available quantity/)).toBeVisible();
    expect(await readOfflineTransactions(page)).toHaveLength(1);
  });
});
