'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Inward from '@/lib/models/Inward';
import Client from '@/lib/models/Client';
import Commodity from '@/lib/models/Commodity';
import Warehouse from '@/lib/models/Warehouse';
import Assayer from '@/lib/models/Assayer';
import { requireSession, getTenantFilterForMongo, isAdmin, isWsp } from '@/lib/ownership';
import { getApprovalWindowDetails } from '@/lib/assaying-utils';
import { revalidatePath } from 'next/cache';

/**
 * Checks if the current session user has authorization to approve or reject grading records.
 * Authorized users: ADMIN, SUPER_ADMIN, and WSP warehouse owners / staff with inward permission.
 * Clients (FARMER, FPO, COMPANY) are strictly unauthorized.
 */
function isUserAuthorizedForDecision(session: any): boolean {
  if (!session?.user) return false;
  const role = session.user.role?.toString().toUpperCase();

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  if (role === 'WSP') {
    // If staff user, check if staff has inward/approve permission
    if (session.user.isStaff) {
      const perms = session.user.permissions;
      if (!perms) return false;
      return Boolean(perms.inward?.approve || perms.inward?.edit || perms.inward?.view);
    }
    return true;
  }

  return false;
}

/**
 * Fetches all Dry Storage inward records where Assaying/Grading = Yes (isAssayingRequired: true).
 * Strictly scoped by tenant ownership.
 * Does NOT display inward transactions where Assaying/Grading = No.
 */
export async function getAssayingInwards() {
  const session = await requireSession();
  await connectToDatabase();

  const tenantFilter = getTenantFilterForMongo(session);

  const rawInwards = await Inward.find({
    isAssayingRequired: true,
    ...tenantFilter,
  })
    .populate({ path: 'clientId', model: Client })
    .populate({ path: 'commodityId', model: Commodity })
    .populate({ path: 'warehouseId', model: Warehouse })
    .populate({ path: 'assayerId', model: Assayer })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Sanitize to clean plain objects
  const inwards = rawInwards.map((item: any) => ({
    _id: item._id.toString(),
    receiptNumber: item.receiptNumber || '',
    lotNo: item.lotNo || '',
    stackNo: item.stackNo || '',
    gatePass: item.gatePass || '',
    date: item.date ? new Date(item.date).toISOString() : '',
    outwardDate: item.outwardDate ? new Date(item.outwardDate).toISOString() : '',
    quantityMT: Number(item.quantityMT) || 0,
    bagsCount: Number(item.bagsCount) || 0,
    vehicleNumber: item.vehicleNumber || '',
    transportationName: item.transportationName || '',
    driverName: item.driverName || '',
    note: item.note || '',
    isAssayingRequired: Boolean(item.isAssayingRequired),
    assayingDate: item.assayingDate ? new Date(item.assayingDate).toISOString() : '',
    assayingExpiryDate: item.assayingExpiryDate ? new Date(item.assayingExpiryDate).toISOString() : '',
    marketValuePerMT: Number(item.marketValuePerMT) || 0,
    totalMarketValue: Number(item.totalMarketValue) || 0,
    gradingResults: Array.isArray(item.gradingResults)
      ? item.gradingResults.map((g: any) => ({
          parameterName: g.parameterName || '',
          observedValue: g.observedValue || '',
          status: g.status || '',
        }))
      : [],
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
          name: item.clientId.name || '',
          identifier: item.clientId.identifier || '',
          address: item.clientId.address || '',
          phone: item.clientId.phone || '',
        }
      : null,
    commodity: item.commodityId
      ? {
          _id: item.commodityId._id?.toString() || '',
          name: item.commodityId.name || '',
          ratePerMtPerDay: item.commodityId.ratePerMtPerDay || 0,
          gradingParameters: Array.isArray(item.commodityId.gradingParameters)
            ? item.commodityId.gradingParameters.map((gp: any) => ({
                _id: gp._id?.toString() || '',
                name: gp.name || '',
                remarks: gp.remarks || '',
                lowRange: gp.lowRange !== undefined && gp.lowRange !== null ? Number(gp.lowRange) : undefined,
                highRange: gp.highRange !== undefined && gp.highRange !== null ? Number(gp.highRange) : undefined,
              }))
            : [],
        }
      : null,
    warehouse: item.warehouseId
      ? {
          _id: item.warehouseId._id?.toString() || '',
          name: item.warehouseId.name || '',
          location: item.warehouseId.location || '',
          warehouseId: item.warehouseId.warehouseId || '',
        }
      : null,
    assayer: item.assayerId
      ? {
          _id: item.assayerId._id?.toString() || '',
          name: item.assayerId.name || '',
          licenceNumber: item.assayerId.licenceNumber || item.assayerId.licenseNumber || '',
          status: item.assayerId.status || '',
        }
      : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
  }));

  return JSON.parse(JSON.stringify(inwards));
}

/**
 * Updates the approval status (Approve / Reject) of an assaying/grading record.
 * Validates date restrictions on backend:
 * - Allow approval or rejection only from Assaying Date through 7 calendar days after Assaying Date.
 * - Prevents unauthorized users from changing the decision.
 * - Records decision, decision date, and authorized user's details.
 */
export async function updateGradingDecision(data: {
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

  // 1. Authorization check
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
  const tenantFilter = getTenantFilterForMongo(session);

  // 2. Fetch the target inward record with tenant isolation
  const inward = await Inward.findOne({
    _id: new mongoose.Types.ObjectId(data.inwardId),
    ...tenantFilter,
  });

  if (!inward) {
    throw new Error('Inward record not found or access denied.');
  }

  if (!inward.isAssayingRequired) {
    throw new Error('Assaying/Grading is not applicable for this inward entry.');
  }

  // 3. Strict Date Window Validation:
  // Allow approval or rejection only from Assaying Date through 7 calendar days after Assaying Date.
  const windowDetails = getApprovalWindowDetails(inward.assayingDate);
  if (!windowDetails.isOpen) {
    throw new Error(`Action prohibited: ${windowDetails.reason}`);
  }

  // 4. Record decision details and save modified parameters
  const user = session.user as any;
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
      // Save updated values against the inward transaction
      inward.gradingResults = updatedList;
      inward.approvedGradingResults = updatedList;
    } else {
      inward.approvedGradingResults = inward.gradingResults || [];
    }
  } else {
    inward.approvedGradingResults = [];
  }

  await inward.save();

  // Also sync to shared transactions collection if present
  try {
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('transactions').updateMany(
        { sourceId: inward._id.toString() },
        {
          $set: {
            gradingStatus: data.decision,
            gradingDecisionDate: inward.gradingDecisionDate,
            gradingResults: inward.gradingResults,
            approvedGradingResults: inward.approvedGradingResults,
          },
        }
      );
    }
  } catch (err) {
    console.warn('Could not sync to transactions collection:', err);
  }

  // 5. Revalidate cache
  revalidatePath('/dashboard/assaying');
  revalidatePath('/dashboard/inward');
  revalidatePath('/dashboard/transactions-report');
  revalidatePath('/dashboard');

  return {
    success: true,
    message: `Grading record successfully ${data.decision === 'APPROVED' ? 'Approved' : 'Rejected'}.`,
    gradingStatus: data.decision,
    gradingDecisionDate: inward.gradingDecisionDate.toISOString(),
    gradingResults: inward.gradingResults,
    approvedGradingResults: inward.approvedGradingResults,
  };
}
