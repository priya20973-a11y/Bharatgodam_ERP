import ManufacturingItemMasterClient from '../items/ManufacturingItemMasterClient';

export default function FinishedGoodsPage() {
  return (
    <ManufacturingItemMasterClient
      itemType="FINISHED_GOOD"
      title="Finished Goods Master"
      subtitle="Maintain finished goods definitions, trade variants, and sales/inventory readiness without creating transaction logic yet."
    />
  );
}
