const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function test() {
  try {
    const { updateWarehouse } = require('./app/actions/warehouse-actions.ts');
    console.log('updateWarehouse loaded');
  } catch (e) {
    console.error('Error loading updateWarehouse:', e);
  }
}
test();
