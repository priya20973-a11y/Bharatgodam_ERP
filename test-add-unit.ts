import { addColdUnit } from './app/actions/cold-units';
import { updateColdUnit } from './app/actions/cold-units';

async function run() {
  const res = await addColdUnit({
    name: 'Test Unit ' + Date.now(),
    code: 'TST' + Date.now(),
    isActive: true
  });
  console.log("Add Unit result:", res);
}

run();
