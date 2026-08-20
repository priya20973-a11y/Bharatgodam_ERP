import ManufacturingItemMasterClient from '../items/ManufacturingItemMasterClient';

export default function RawMaterialsPage() {
  return (
    <ManufacturingItemMasterClient
      itemType="RAW_MATERIAL"
      title="Raw Material Master"
      subtitle="Create and manage raw materials, grades, and lot-ready inventory definitions for production planning."
    />
  );
}
