const { getClientRevenueAnalytics } = require('./app/actions/transaction-actions.ts');

async function testDashboard() {
  console.log('Testing dashboard function...');

  try {
    const result = await getClientRevenueAnalytics();
    console.log('Dashboard result:');
    console.log(`Summary: ₹${result.summary.totalRevenue} total`);
    console.log(`Rows: ${result.clientWarehouseRevenue.length}`);

    // Check for April data
    let aprilRows = 0;
    result.clientWarehouseRevenue.forEach(row => {
      if (row.monthlyCharges['2026-04']) {
        aprilRows++;
        console.log(`April data: ${row.clientName} - ${row.warehouseName}: ₹${row.monthlyCharges['2026-04']}`);
      }
    });

    console.log(`\nRows with April data: ${aprilRows}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

testDashboard();