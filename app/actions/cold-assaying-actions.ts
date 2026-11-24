'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import Client from '@/lib/models/Client';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdAssayer from '@/lib/models/ColdAssayer';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import { getApprovalWindowDetails } from '@/lib/assaying-utils';
import { logColdActivity } from '@/lib/cold-logger';
import { revalidatePath } from 'next/cache';

/**
 * Checks if the current session user has authorization to approve or reject grading records in Cold Storage.
 * Authorized users: ADMIN, SUPER_ADMIN, and WSP owners / staff with inward or assaying permission.
 * Clients (FARMER, FPO, COMPANY) are strictly unauthorized.
 */
function isUserAuthorizedForDecision(session: any): boolean {
  if (!session?.user) return false;
  const role = session.user.role?.toString().toUpperCase();

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  if (role === 'WSP') {
    if (session.user.isStaff) {
      const perms = session.user.permissions;
      if (!perms) return false;
      return Boolean(
        perms.assaying?.approve || 
        perms.assaying?.edit || 
        perms.assaying?.view ||
        perms.inward?.approve || 
        perms.inward?.edit
      );
    }
    return true;
  }

  return false;
}

/**
 * Fetches all Cold Storage inward records where Assaying/Grading = Yes (isAssayingRequired: true).
 * Strictly scoped by tenant ownership.
 */
export async function getColdAssayingInwards() {
  const session = await requireSession();
  await connectToDatabase();

  if (!session?.user?.id) {
    return [];
  }

  const role = session.user.role?.toString().toUpperCase();
  let ownershipFilter: any = {};
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    const orConditions: any[] = [{ userId: session.user.id }];
    try {
      orConditions.push({ userId: new mongoose.Types.ObjectId(session.user.id) });
    } catch {}
    if (session.user.email) {
      orConditions.push({ userEmail: session.user.email });
      orConditions.push({ userEmail: session.user.email.toLowerCase() });
    }
    ownershipFilter = { $or: orConditions };
  }

  const query: any = {
    $and: [
      { isAssayingRequired: { $nin: [false, 'false'] } },
      {
        $or: [
          { isAssayingRequired: true },
          { isAssayingRequired: 'true' },
          { assayerId: { $exists: true, $ne: null } },
          { gradingStatus: { $in: ['PENDING', 'APPROVED', 'REJECTED'] } },
          { 'gradingResults.0': { $exists: true } },
          { 'approvedGradingResults.0': { $exists: true } },
        ]
      }
    ],
    ...(Object.keys(ownershipFilter).length > 0 ? ownershipFilter : {})
  };

  const rawInwards = await ColdInward.find(query)
    .populate({ path: 'clientId', model: Client })
    .populate({ path: 'commodityId', model: ColdCommodity })
    .populate({ path: 'warehouseId', model: ColdWarehouse })
    .populate({ path: 'assayerId', model: ColdAssayer })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const inwards = rawInwards.map((item: any) => {
    // Map grading/quality parameters from ColdCommodity
    const commodityGradingParams = Array.isArray(item.commodityId?.gradingParameters) && item.commodityId.gradingParameters.length > 0
      ? item.commodityId.gradingParameters.map((gp: any) => ({
          _id: gp._id?.toString() || '',
          name: gp.name || '',
          remarks: gp.remarks || '',
          lowRange: gp.lowRange !== undefined && gp.lowRange !== null ? Number(gp.lowRange) : undefined,
          highRange: gp.highRange !== undefined && gp.highRange !== null ? Number(gp.highRange) : undefined,
        }))
      : (Array.isArray(item.commodityId?.qualityParameters)
          ? item.commodityId.qualityParameters.map((qp: any) => ({
              _id: qp._id?.toString() || '',
              name: qp.name || '',
              remarks: '',
              lowRange: qp.lowerLimit !== undefined && qp.lowerLimit !== null ? Number(qp.lowerLimit) : undefined,
              highRange: qp.upperLimit !== undefined && qp.upperLimit !== null ? Number(qp.upperLimit) : undefined,
            }))
          : []);

    const calculatedQty = Number(item.quantityKg) || (Array.isArray(item.stackAllocations) ? item.stackAllocations.reduce((sum: number, s: any) => sum + (Number(s.allocatedWeight) || 0), 0) : 0);
    const calculatedBags = Number(item.bagsCount) || (Array.isArray(item.stackAllocations) ? item.stackAllocations.reduce((sum: number, s: any) => sum + (Number(s.bagsCount) || 0), 0) : 0);

    return {
      _id: item._id.toString(),
      receiptNumber: item.receiptNumber || item.receiptNo || 'N/A',
      lotNo: item.lotNo || '',
      stackAllocations: Array.isArray(item.stackAllocations) ? item.stackAllocations : [],
      truckNo: item.truckNo || '',
      weighbridgeSlipNo: item.weighbridgeSlipNo || '',
      grossWeight: Number(item.grossWeight) || calculatedQty,
      emptyWeight: Number(item.emptyWeight) || 0,
      date: item.date ? new Date(item.date).toISOString() : (item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()),
      quantityKg: calculatedQty,
      bagsCount: calculatedBags,
      unit: item.unit || 'KG',
      farmerName: item.farmerName || '',
      farmerId: item.farmerId || '',
      remarks: item.remarks || '',
      note: item.note || '',
      isAssayingRequired: Boolean(item.isAssayingRequired !== false && item.isAssayingRequired !== 'false'),
      assayingDate: item.assayingDate ? new Date(item.assayingDate).toISOString() : (item.date ? new Date(item.date).toISOString() : new Date().toISOString()),
      assayingExpiryDate: item.assayingExpiryDate ? new Date(item.assayingExpiryDate).toISOString() : '',
      marketValuePerUnit: Number(item.marketValuePerUnit) || 0,
      totalMarketValue: Number(item.totalMarketValue) || 0,
      gradingResults: Array.isArray(item.gradingResults) && item.gradingResults.length > 0
        ? item.gradingResults.map((g: any) => ({
            parameterName: g.parameterName || '',
            observedValue: g.observedValue || '',
            status: g.status || '',
          }))
        : (Array.isArray(item.qualityEntries) && item.qualityEntries.length > 0
            ? item.qualityEntries.map((qe: any) => ({
                parameterName: qe.parameterName || '',
                observedValue: qe.value !== undefined ? String(qe.value) : '',
                status: qe.status || '',
              }))
            : []),
      approvedGradingResults: Array.isArray(item.approvedGradingResults)
        ? item.approvedGradingResults.map((g: any) => ({
            parameterName: g.parameterName || '',
            observedValue: g.observedValue || '',
            status: g.status || '',
          }))
        : [],
      gradingStatus: (item.gradingStatus || 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
      gradingDecisionDate: item.gradingDecisionDate ? new Date(item.gradingDecisionDate).toISOString() : null,
      gradingDecisionBy: item.gradingDecisionBy ? item.gradingDecisionBy.toString() : null,
      gradingDecisionByName: item.gradingDecisionByName || '',
      gradingDecisionByEmail: item.gradingDecisionByEmail || '',
      gradingDecisionRole: item.gradingDecisionRole || '',
      gradingDecisionRemarks: item.gradingDecisionRemarks || '',
      client: item.clientId
        ? {
            _id: item.clientId._id?.toString() || '',
            name: item.clientId.name || item.farmerName || 'Client',
            identifier: item.clientId.identifier || '',
            address: item.clientId.address || '',
            phone: item.clientId.phone || item.clientId.mobile || '',
          }
        : (item.farmerName ? { _id: '', name: item.farmerName, identifier: '', address: '', phone: '' } : null),
      commodity: item.commodityId
        ? {
            _id: item.commodityId._id?.toString() || '',
            name: item.commodityId.name || 'Commodity',
            type: item.commodityId.type || '',
            unit: item.commodityId.unit || item.unit || 'KG',
            gradingParameters: commodityGradingParams,
          }
        : null,
      warehouse: item.warehouseId
        ? {
            _id: item.warehouseId._id?.toString() || '',
            name: item.warehouseId.name || 'Cold Warehouse',
            address: item.warehouseId.address || item.warehouseId.location || '',
            warehouseId: item.warehouseId.warehouseId || '',
          }
        : null,
      assayer: item.assayerId
        ? {
            _id: item.assayerId._id?.toString() || '',
            name: item.assayerId.name || '',
            licenceNumber: item.assayerId.licenceNumber || '',
            status: item.assayerId.status || '',
          }
        : null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
    };
  });

  return JSON.parse(JSON.stringify(inwards));
}

/**
 * Updates the approval status (Approve / Reject) of a Cold Storage assaying/grading record.
 * Validates date restrictions:
 * - Allow approval or rejection only from Assaying Date through 7 calendar days after Assaying Date.
 * - Prevents unauthorized users from changing the decision.
 * - Records decision, decision date, and authorized user's details.
 */
export async function updateColdGradingDecision(data: {
  inwardId: string;
  decision: 'APPROVED' | 'REJECTED';
  remarks?: string;
  parameters?: {
    parameterName: string;
    observedValue: string;
    status?: string;
  }[];
  selectedParameters?: {
    parameterName: string;
    observedValue: string;
    status?: string;
  }[];
}) {
  const session = await requireSession();

  if (!isUserAuthorizedForDecision(session)) {
    throw new Error('Unauthorized: You do not have permission to approve or reject assaying records.');
  }

  if (!data.inwardId || !mongoose.Types.ObjectId.isValid(data.inwardId)) {
    throw new Error('Invalid inward transaction identifier.');
  }

  if (data.decision !== 'APPROVED' && data.decision !== 'REJECTED') {
    throw new Error('Invalid decision. Must be APPROVED or REJECTED.');
  }

  await connectToDatabase();

  const userRole = session.user.role?.toString().toUpperCase();
  let ownershipFilter: any = {};
  if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
    const orConditions: any[] = [{ userId: session.user.id }];
    try {
      orConditions.push({ userId: new mongoose.Types.ObjectId(session.user.id) });
    } catch {}
    if (session.user.email) {
      orConditions.push({ userEmail: session.user.email });
      orConditions.push({ userEmail: session.user.email.toLowerCase() });
    }
    ownershipFilter = { $or: orConditions };
  }

  const inward = await ColdInward.findOne({
    _id: new mongoose.Types.ObjectId(data.inwardId),
    ...ownershipFilter,
  });

  if (!inward) {
    throw new Error('Cold Inward record not found or access denied.');
  }

  inward.isAssayingRequired = true;

  // Strict Date Window Validation:
  // Allow approval or rejection only from Assaying Date through 7 calendar days after Assaying Date.
  const windowDetails = getApprovalWindowDetails(inward.assayingDate);
  if (!windowDetails.isOpen) {
    throw new Error(`Action prohibited: ${windowDetails.reason}`);
  }

  const user = session.user as any;
  const previousStatus = inward.gradingStatus;
  
  inward.gradingStatus = data.decision;
  inward.gradingDecisionDate = new Date();
  inward.gradingDecisionBy = new mongoose.Types.ObjectId(String(user.id));
  inward.gradingDecisionByName = user.name || user.email || 'Authorized Signatory';
  inward.gradingDecisionByEmail = user.email || '';
  inward.gradingDecisionRole = user.role?.toString().toUpperCase() || 'WSP';
  inward.gradingDecisionRemarks = data.remarks?.trim() || '';

  const incomingParams = data.parameters || data.selectedParameters;
  if (data.decision === 'APPROVED') {
    if (incomingParams && incomingParams.length > 0) {
      const updatedList = incomingParams.map((p) => ({
        parameterName: p.parameterName,
        observedValue: p.observedValue,
        status: p.status || '',
      }));
      inward.gradingResults = updatedList;
      inward.approvedGradingResults = updatedList;
    } else {
      inward.approvedGradingResults = inward.gradingResults || [];
    }
  } else {
    inward.approvedGradingResults = [];
  }

  await inward.save();

  await logColdActivity({
    actionType: 'UPDATE',
    module: 'Inward',
    recordId: inward._id.toString(),
    description: `Assaying decision ${data.decision} recorded for Inward ${inward.receiptNumber || inward.lotNo}`,
    previousValue: { gradingStatus: previousStatus },
    newValue: {
      gradingStatus: data.decision,
      gradingDecisionDate: inward.gradingDecisionDate,
      gradingDecisionRemarks: inward.gradingDecisionRemarks,
    },
    sessionFallback: session
  });

  revalidatePath('/cold/assaying');
  revalidatePath('/cold/inward');
  revalidatePath('/cold/dashboard');

  return {
    success: true,
    message: `Grading record successfully ${data.decision === 'APPROVED' ? 'Approved' : 'Rejected'}.`,
    gradingStatus: data.decision,
    gradingDecisionDate: inward.gradingDecisionDate.toISOString(),
    gradingResults: inward.gradingResults,
    approvedGradingResults: inward.approvedGradingResults,
  };
}

/**
 * Assigns or updates the Cold Storage Assayer for an inward entry.
 * Validates that:
 * - The session user is authorized.
 * - The assayer belongs to Cold Assayer Master (tenant scoped).
 * - Expired assayers are rejected according to business rules.
 * - Assaying date is valid and not earlier than the Inward date.
 */
export async function updateColdAssayerAssignment(data: {
  inwardId: string;
  assayerId?: string | null;
  assayingDate?: string;
  assayingExpiryDate?: string;
}) {
  const session = await requireSession();

  if (!isUserAuthorizedForDecision(session)) {
    throw new Error('Unauthorized: You do not have permission to manage assayer assignments.');
  }

  if (!data.inwardId || !mongoose.Types.ObjectId.isValid(data.inwardId)) {
    throw new Error('Invalid inward transaction identifier.');
  }

  await connectToDatabase();

  const userRole = session.user.role?.toString().toUpperCase();
  let ownershipFilter: any = {};
  if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
    const orConditions: any[] = [{ userId: session.user.id }];
    try {
      orConditions.push({ userId: new mongoose.Types.ObjectId(session.user.id) });
    } catch {}
    if (session.user.email) {
      orConditions.push({ userEmail: session.user.email });
      orConditions.push({ userEmail: session.user.email.toLowerCase() });
    }
    ownershipFilter = { $or: orConditions };
  }

  const inward = await ColdInward.findOne({
    _id: new mongoose.Types.ObjectId(data.inwardId),
    ...ownershipFilter,
  });

  if (!inward) {
    throw new Error('Cold Inward record not found or access denied.');
  }

  const previousAssayerId = inward.assayerId?.toString();
  const previousAssayingDate = inward.assayingDate;
  let populatedAssayer: any = null;

  if (data.assayerId && data.assayerId !== 'none' && data.assayerId.trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(data.assayerId)) {
      throw new Error('Invalid Assayer identifier.');
    }

    const assayer = await ColdAssayer.findOne({
      _id: new mongoose.Types.ObjectId(data.assayerId),
      ...getTenantFilterForMongo(session),
    });

    if (!assayer) {
      throw new Error('Assayer not found in Cold Assayer Master.');
    }

    if (assayer.status === 'Expired') {
      throw new Error('Selected Assayer licence has expired. Please select an active assayer.');
    }

    inward.assayerId = assayer._id;
    populatedAssayer = {
      _id: assayer._id.toString(),
      name: assayer.name,
      licenceNumber: assayer.licenceNumber || '',
      status: assayer.status,
    };
  } else {
    inward.assayerId = undefined;
  }

  if (data.assayingDate) {
    const parsedAssayingDate = new Date(data.assayingDate);
    if (isNaN(parsedAssayingDate.getTime())) {
      throw new Error('Invalid assaying date provided.');
    }

    if (inward.date) {
      const inwardDay = new Date(inward.date);
      inwardDay.setHours(0, 0, 0, 0);
      const testAssayingDay = new Date(parsedAssayingDate);
      testAssayingDay.setHours(0, 0, 0, 0);
      if (testAssayingDay < inwardDay) {
        throw new Error('Assaying date cannot be earlier than the Inward date.');
      }
    }

    inward.assayingDate = parsedAssayingDate;
  }

  if (data.assayingExpiryDate) {
    const parsedExpiryDate = new Date(data.assayingExpiryDate);
    if (!isNaN(parsedExpiryDate.getTime())) {
      if (inward.assayingDate && parsedExpiryDate < new Date(inward.assayingDate)) {
        throw new Error('Stock expiry date cannot be earlier than the Assaying date.');
      }
      inward.assayingExpiryDate = parsedExpiryDate;
    }
  }

  inward.isAssayingRequired = true;
  await inward.save();

  await logColdActivity({
    actionType: 'UPDATE',
    module: 'Inward',
    recordId: inward._id.toString(),
    description: `Assayer assignment updated for Inward ${inward.receiptNumber || inward.lotNo}`,
    previousValue: { assayerId: previousAssayerId, assayingDate: previousAssayingDate },
    newValue: {
      assayerId: inward.assayerId,
      assayingDate: inward.assayingDate,
      assayingExpiryDate: inward.assayingExpiryDate,
    },
    sessionFallback: session,
  });

  revalidatePath('/cold/assaying');
  revalidatePath('/cold/inward');
  revalidatePath('/cold/dashboard');

  return {
    success: true,
    message: 'Assayer assignment updated successfully.',
    assayer: populatedAssayer,
    assayingDate: inward.assayingDate ? inward.assayingDate.toISOString() : null,
    assayingExpiryDate: inward.assayingExpiryDate ? inward.assayingExpiryDate.toISOString() : null,
  };
}

/**
 * Saves grading observations without modifying the decision status (remains PENDING unless approved/rejected).
 */
export async function saveColdGradingObservations(data: {
  inwardId: string;
  parameters: {
    parameterName: string;
    observedValue: string;
    status?: string;
  }[];
  assayingDate?: string;
  remarks?: string;
}) {
  const session = await requireSession();

  if (!isUserAuthorizedForDecision(session)) {
    throw new Error('Unauthorized: You do not have permission to record assaying observations.');
  }

  if (!data.inwardId || !mongoose.Types.ObjectId.isValid(data.inwardId)) {
    throw new Error('Invalid inward transaction identifier.');
  }

  await connectToDatabase();

  const userRole = session.user.role?.toString().toUpperCase();
  let ownershipFilter: any = {};
  if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
    const orConditions: any[] = [{ userId: session.user.id }];
    try {
      orConditions.push({ userId: new mongoose.Types.ObjectId(session.user.id) });
    } catch {}
    if (session.user.email) {
      orConditions.push({ userEmail: session.user.email });
      orConditions.push({ userEmail: session.user.email.toLowerCase() });
    }
    ownershipFilter = { $or: orConditions };
  }

  const inward = await ColdInward.findOne({
    _id: new mongoose.Types.ObjectId(data.inwardId),
    ...ownershipFilter,
  });

  if (!inward) {
    throw new Error('Cold Inward record not found or access denied.');
  }

  inward.isAssayingRequired = true;

  if (data.assayingDate) {
    const parsed = new Date(data.assayingDate);
    if (!isNaN(parsed.getTime())) {
      if (inward.date) {
        const inwDay = new Date(inward.date);
        inwDay.setHours(0, 0, 0, 0);
        const assDay = new Date(parsed);
        assDay.setHours(0, 0, 0, 0);
        if (assDay < inwDay) {
          throw new Error('Assaying date cannot be earlier than the Inward date.');
        }
      }
      inward.assayingDate = parsed;
    }
  }

  if (Array.isArray(data.parameters)) {
    inward.gradingResults = data.parameters.map((p) => ({
      parameterName: p.parameterName,
      observedValue: p.observedValue,
      status: p.status || '',
    }));
  }

  if (data.remarks) {
    inward.remarks = data.remarks;
  }

  await inward.save();

  await logColdActivity({
    actionType: 'UPDATE',
    module: 'Inward',
    recordId: inward._id.toString(),
    description: `Grading observations saved for Inward ${inward.receiptNumber || inward.lotNo}`,
    newValue: {
      gradingResults: inward.gradingResults,
      assayingDate: inward.assayingDate,
    },
    sessionFallback: session,
  });

  revalidatePath('/cold/assaying');
  revalidatePath('/cold/inward');

  return {
    success: true,
    message: 'Grading observations saved successfully.',
    gradingResults: inward.gradingResults,
    assayingDate: inward.assayingDate ? inward.assayingDate.toISOString() : null,
  };
}
