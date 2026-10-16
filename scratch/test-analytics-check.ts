import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getClientRevenueAnalytics } from '../app/actions/transaction-actions';

async function test() {
  console.log('--- Calling getClientRevenueAnalytics for Bharat Agri Depot (70% Plat / 30% Owner) ---');
  const whId = '6a26b4ac259d35805de83ba7';
  const result = await getClientRevenueAnalytics(whId);

  console.log('Summary:', result.summary);
  console.log('Warehouse Revenue Entries:', result.warehouseRevenue.length);
  if (result.warehouseRevenue.length > 0) {
    const row = result.warehouseRevenue[0];
    console.log('First Warehouse Row:', {
      warehouseName: row.warehouseName,
      warehouseType: row.warehouseType,
      platformCommission: row.platformCommission,
      ownerEarnings: row.ownerEarnings,
      totalRevenue: row.totalRevenue,
      ownerShare: row.ownerShare,
      platformShare: row.platformShare,
    });

    const expectedOwner = Math.round(row.totalRevenue * 0.3 * 100) / 100;
    const expectedPlatform = Math.round(row.totalRevenue * 0.7 * 100) / 100;

    console.log(`Expected Owner Share (30%): ₹${expectedOwner}, Actual: ₹${row.ownerShare}`);
    console.log(`Expected Platform Share (70%): ₹${expectedPlatform}, Actual: ₹${row.platformShare}`);

    if (row.ownerEarnings !== 30 || row.platformCommission !== 70) {
      throw new Error(`FAIL: Expected 30% owner and 70% platform, got ${row.ownerEarnings}% / ${row.platformCommission}%`);
    }

    if (row.totalRevenue > 0) {
      if (Math.abs(row.ownerShare - expectedOwner) > 0.05) {
        throw new Error(`FAIL: Owner share mismatch`);
      }
      if (Math.abs(row.platformShare - expectedPlatform) > 0.05) {
        throw new Error(`FAIL: Platform share mismatch`);
      }
    }

    console.log('✅ ALL PERCENTAGES AND CALCULATIONS MATCH 70% PLATFORM / 30% OWNER EXACTLY!');
  } else {
    console.log('No revenue rows found for this warehouse.');
  }

  console.log('\n--- Calling getClientRevenueAnalytics across ALL warehouses ---');
  const allResult = await getClientRevenueAnalytics();
  console.log('All Warehouses Count:', allResult.warehouseRevenue.length);
  const targetInAll = allResult.warehouseRevenue.find((w: any) => w.warehouseName === 'Bharat Agri Depot');
  if (targetInAll) {
    console.log('Bharat Agri Depot in full list:', {
      platformCommission: targetInAll.platformCommission,
      ownerEarnings: targetInAll.ownerEarnings,
      ownerShare: targetInAll.ownerShare,
      platformShare: targetInAll.platformShare,
    });
    if (targetInAll.platformCommission !== 70 || targetInAll.ownerEarnings !== 30) {
      throw new Error('FAIL: Target in full list did not reflect 70% platform / 30% owner');
    }
  }

  // Check unconfigured warehouses in full list
  const otherWh = allResult.warehouseRevenue.find((w: any) => w.warehouseName !== 'Bharat Agri Depot' && w.warehouseType !== 'Rented');
  if (otherWh) {
    console.log(`Unconfigured warehouse "${otherWh.warehouseName}" in full list:`, {
      platformCommission: otherWh.platformCommission,
      ownerEarnings: otherWh.ownerEarnings,
      ownerShare: otherWh.ownerShare,
      platformShare: otherWh.platformShare,
    });
    if (otherWh.ownerEarnings !== 60 || otherWh.platformCommission !== 40) {
      throw new Error(`FAIL: Unconfigured warehouse should preserve 60% owner / 40% platform, got ${otherWh.ownerEarnings} / ${otherWh.platformCommission}`);
    }
    console.log('✅ Unconfigured warehouse preserved 60% Owner / 40% Platform default!');
  }
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
