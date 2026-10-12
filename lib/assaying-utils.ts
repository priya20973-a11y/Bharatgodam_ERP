/**
 * Utilities for Assaying/Grading module in Dry Storage
 *
 * Rules:
 * - Approval or rejection is allowed only from the Assaying Date through 7 calendar days after the Assaying Date.
 * - Both actions are disabled before the Assaying Date and after the 7-day approval window.
 */

export interface ApprovalWindowInfo {
  isOpen: boolean;
  status: 'OPEN' | 'BEFORE' | 'EXPIRED' | 'MISSING_DATE' | 'INVALID_DATE';
  reason: string;
  windowStartText: string;
  windowEndText: string;
  startDate?: Date;
  endDate?: Date;
  daysLeft: number;
}

export function formatAssayingDate(val: any): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAssayingDateTime(val: any): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })} ${d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Calculates whether the 7-calendar-day approval/rejection window is currently active.
 *
 * Window:
 * - Starts at 00:00:00 on the Assaying Date.
 * - Ends at 23:59:59.999 on the 7th calendar day AFTER the Assaying Date (inclusive of all 7 days).
 */
export function getApprovalWindowDetails(assayingDateInput: Date | string | undefined | null): ApprovalWindowInfo {
  if (!assayingDateInput) {
    return {
      isOpen: false,
      status: 'MISSING_DATE',
      reason: 'Assaying date is not specified for this transaction.',
      windowStartText: '—',
      windowEndText: '—',
      daysLeft: 0,
    };
  }

  const parsed = new Date(assayingDateInput);
  if (isNaN(parsed.getTime())) {
    return {
      isOpen: false,
      status: 'INVALID_DATE',
      reason: 'Invalid assaying date provided.',
      windowStartText: '—',
      windowEndText: '—',
      daysLeft: 0,
    };
  }

  // To support dates cleanly across timezones, use the calendar date components
  let year: number;
  let month: number;
  let day: number;

  if (typeof assayingDateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(assayingDateInput)) {
    const parts = assayingDateInput.split('T')[0].split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    // If Date object or ISO string, retrieve UTC date to match database storage
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth();
    day = parsed.getUTCDate();
  }

  // Start of window: 00:00:00 on Assaying Date (local comparison with start of today)
  const startDate = new Date(year, month, day, 0, 0, 0, 0);

  // End of window: 7 calendar days after Assaying Date at 23:59:59.999
  const endDate = new Date(year, month, day + 7, 23, 59, 59, 999);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const windowStartText = formatAssayingDate(startDate);
  const windowEndText = formatAssayingDate(endDate);

  if (endOfToday < startDate) {
    return {
      isOpen: false,
      status: 'BEFORE',
      reason: `Approval/Rejection is disabled before the Assaying Date (${windowStartText}).`,
      windowStartText,
      windowEndText,
      startDate,
      endDate,
      daysLeft: 0,
    };
  }

  if (startOfToday > endDate) {
    return {
      isOpen: false,
      status: 'EXPIRED',
      reason: `Approval window expired on ${windowEndText} (actions allowed only up to 7 days after Assaying Date).`,
      windowStartText,
      windowEndText,
      startDate,
      endDate,
      daysLeft: 0,
    };
  }

  // Calculate remaining days in window
  const remainingMs = endDate.getTime() - now.getTime();
  const daysLeft = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

  return {
    isOpen: true,
    status: 'OPEN',
    reason: `Approval window is active (${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining until ${windowEndText}).`,
    windowStartText,
    windowEndText,
    startDate,
    endDate,
    daysLeft,
  };
}

/**
 * Calculates grading status (OK, LOW, HIGH) based on parameter limits
 */
export function getGradingStatus(
  observedValue: string | undefined | null,
  lowRange: number | undefined | null,
  highRange: number | undefined | null
): string {
  if (!observedValue || observedValue.trim() === '') return '';
  const val = parseFloat(observedValue);
  if (isNaN(val)) return '';

  if (lowRange !== undefined && lowRange !== null && val < lowRange) return 'LOW';
  if (highRange !== undefined && highRange !== null && val > highRange) return 'HIGH';
  if (lowRange !== undefined && lowRange !== null && highRange !== undefined && highRange !== null) return 'OK';
  return '';
}
