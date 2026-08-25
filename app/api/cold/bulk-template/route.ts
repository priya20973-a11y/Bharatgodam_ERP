import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const csvContent = `\uFEFFType,ClientName,CommodityName,WarehouseName,Date,TruckNo,WeighbridgeSlipNo,Seed,TableLabel,Marko,FarmerName,VillageName,ReferencePersonName,GrossWeight,EmptyWeight,SelfPurchase,LargeBag,SmallBag,TotalBags,NetWeight,ChamberNo,FloorNo,StackNo,AllocatedWeight,AllocatedBagsCount,Grading,Remarks\nINWARD,Sample Client,Sample Commodity,Sample Cold Warehouse,2026-03-02,GH-12,WB-101,Sample Seed,Table-01,MR-88,Farmer Name,Sample Village,Reference Person,1300,100,Self,8,4,12,1200,1,1,1,1200,10,Y,Sample inward entry`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cold-inward-template.csv"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Cold bulk template error:', error);
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 }
    );
  }
}
