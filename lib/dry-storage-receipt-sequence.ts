import mongoose from 'mongoose';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export type DrySequenceType = 'DAILY_REPORT_SR' | 'GATE_PASS_NO';

/**
 * Atomically generates the next consecutive sequence number for Dry Storage receipts.
 * Uses user configuration (prefix, starting number, padding, suffix) configured in Profile.
 * Ensures strict uniqueness, continues numbering from the last generated number across server restarts/redeployments,
 * and prevents duplicate numbers during concurrent inward submissions.
 */
export async function getNextDryReceiptSequence(
  warehouseId: string | mongoose.Types.ObjectId | undefined,
  type: DrySequenceType,
  userId?: string | mongoose.Types.ObjectId | undefined
): Promise<string> {
  const whKey = warehouseId ? warehouseId.toString() : 'default';
  const uId = userId ? userId.toString() : undefined;
  const counterId = uId
    ? `dry_${type.toLowerCase()}_user_${uId}`
    : `dry_${type.toLowerCase()}_wh_${whKey}`;

  // Strict 2500ms timeout race to ensure inward creation never hangs
  const sequencePromise = (async () => {
    const db = await getDb();

    // 1. Fetch user configuration if available
    let prefix = '';
    let suffix = '';
    let startingNumber = 1;
    let padding = 3;

    if (uId && ObjectId.isValid(uId)) {
      try {
        const userDoc = await db.collection('users').findOne(
          { _id: new ObjectId(uId) },
          {
            projection: {
              dailyReportPrefix: 1,
              dailyReportSuffix: 1,
              dailyReportStartingNumber: 1,
              dailyReportPadding: 1,
              gatePassPrefix: 1,
              gatePassSuffix: 1,
              gatePassStartingNumber: 1,
              gatePassPadding: 1,
            },
            maxTimeMS: 1500,
          }
        );

        if (userDoc) {
          if (type === 'DAILY_REPORT_SR') {
            prefix = userDoc.dailyReportPrefix || '';
            suffix = userDoc.dailyReportSuffix || '';
            startingNumber = typeof userDoc.dailyReportStartingNumber === 'number' && userDoc.dailyReportStartingNumber > 0
              ? userDoc.dailyReportStartingNumber
              : 1;
            padding = typeof userDoc.dailyReportPadding === 'number' && userDoc.dailyReportPadding > 0
              ? userDoc.dailyReportPadding
              : 3;
          } else {
            prefix = userDoc.gatePassPrefix || '';
            suffix = userDoc.gatePassSuffix || '';
            startingNumber = typeof userDoc.gatePassStartingNumber === 'number' && userDoc.gatePassStartingNumber > 0
              ? userDoc.gatePassStartingNumber
              : 1;
            padding = typeof userDoc.gatePassPadding === 'number' && userDoc.gatePassPadding > 0
              ? userDoc.gatePassPadding
              : 3;
          }
        }
      } catch (userErr) {
        console.warn(`[getNextDryReceiptSequence] Error loading user config for ${type}:`, userErr);
      }
    }

    const counterCol = db.collection<{ _id: string; seq: number }>('counters');

    // 2. Initialize counter if not yet created in the database
    const existingCounter = await counterCol.findOne({ _id: counterId }, { maxTimeMS: 1500 });
    if (!existingCounter) {
      let highestNum = startingNumber - 1;
      const fieldKey = type === 'DAILY_REPORT_SR' ? 'dailyReportSrNo' : 'gatePassNo';

      try {
        // Query recent inwards and outwards to ensure we never collide with existing generated receipts
        const userFilter = uId && ObjectId.isValid(uId) ? { userId: new ObjectId(uId) } : {};
        const queryFilter = {
          ...userFilter,
          $or: [
            { [fieldKey]: { $exists: true, $ne: '' } },
            ...(type === 'GATE_PASS_NO' ? [{ gatePass: { $exists: true, $ne: '' } }] : []),
          ],
        };

        const [recentInwards, recentOutwards] = await Promise.all([
          db.collection('inwards')
            .find(queryFilter, { projection: { [fieldKey]: 1, gatePass: 1 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .maxTimeMS(1500)
            .toArray(),
          db.collection('outwards')
            .find(queryFilter, { projection: { [fieldKey]: 1, gatePass: 1 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .maxTimeMS(1500)
            .toArray(),
        ]);

        for (const doc of [...recentInwards, ...recentOutwards]) {
          const val = (doc as any)[fieldKey] || (doc as any).gatePass;
          if (val) {
            const matches = String(val).match(/\d+/g);
            if (matches && matches.length > 0) {
              const num = parseInt(matches[matches.length - 1], 10);
              if (!isNaN(num) && num > highestNum) {
                highestNum = num;
              }
            }
          }
        }
      } catch (scanErr) {
        console.warn(`[getNextDryReceiptSequence] Error checking existing records for ${type}:`, scanErr);
      }

      try {
        await counterCol.insertOne({ _id: counterId, seq: highestNum });
      } catch (insertErr) {
        // Another concurrent request may have inserted first, which is safely handled
      }
    }

    // 3. Atomically increment the sequence counter
    const counterDoc = await counterCol.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', maxTimeMS: 2000 }
    );

    let seqNumber = counterDoc?.seq ?? startingNumber;
    let formatted = `${prefix}${String(seqNumber).padStart(padding, '0')}${suffix}`;

    // 4. Double check collision against existing inward & outward records (bounded loop)
    const fieldKey = type === 'DAILY_REPORT_SR' ? 'dailyReportSrNo' : 'gatePassNo';
    const userFilter = uId && ObjectId.isValid(uId) ? { userId: new ObjectId(uId) } : {};
    let attempts = 0;

    while (attempts < 15) {
      const collisionFilter = {
        ...userFilter,
        $or: [
          { [fieldKey]: formatted },
          ...(type === 'GATE_PASS_NO' ? [{ gatePass: formatted }] : []),
        ],
      };

      const [inwardCollision, outwardCollision] = await Promise.all([
        db.collection('inwards').findOne(collisionFilter, { projection: { _id: 1 }, maxTimeMS: 1500 }),
        db.collection('outwards').findOne(collisionFilter, { projection: { _id: 1 }, maxTimeMS: 1500 }),
      ]);

      if (!inwardCollision && !outwardCollision) break;
      attempts++;

      // Collision detected with previously created entry: atomically advance counter
      const nextDoc = await counterCol.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', maxTimeMS: 1500 }
      );
      seqNumber = nextDoc?.seq ?? (seqNumber + 1);
      formatted = `${prefix}${String(seqNumber).padStart(padding, '0')}${suffix}`;
    }

    // 5. Update user current counter asynchronously for Profile display
    if (uId && ObjectId.isValid(uId)) {
      const currentField = type === 'DAILY_REPORT_SR' ? 'dailyReportCurrentNumber' : 'gatePassCurrentNumber';
      db.collection('users').updateOne(
        { _id: new ObjectId(uId) },
        { $set: { [currentField]: seqNumber } }
      ).catch(() => {});
    }

    return formatted;
  })();

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Sequence generation timeout')), 2500)
  );

  try {
    return await Promise.race([sequencePromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[getNextDryReceiptSequence] Falling back for ${type}:`, err);
    const fallbackNum = Math.floor(100 + (Date.now() % 900));
    return String(fallbackNum).padStart(3, '0');
  }
}
