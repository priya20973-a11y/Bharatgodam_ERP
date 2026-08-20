import ManufacturingItemMasterClient from '../items/ManufacturingItemMasterClient';

export default function WasteMaterialsPage() {
  return (
    <ManufacturingItemMasterClient
      itemType="WASTE"
      title="Waste Material Master"
      subtitle="Track by-product, recoverable waste, scrap, reject, and process-loss materials as distinct inventory identities."
    />
  );
}
