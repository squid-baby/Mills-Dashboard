/**
 * tenantInfoColumns.js
 *
 * Single source of truth for the Tenant Info tab column → field mapping
 * used by scripts/sync-from-neo.mjs.
 *
 * Header lookup is name-based and case-insensitive, with aliases for both
 * the Neo Google Sheet header names (current) and the legacy `.numbers`
 * file header names. Adding a new tenant field = add one entry here.
 *
 * To add support for a renamed column: append the new header to the `headers`
 * array — older deployments / sources will still match the old name.
 */

// Field keys are the contract used by sync-from-neo.mjs. Do not rename
// these without updating the sync script.
export const TENANT_FIELD_SPECS = [
  { key: 'address',       headers: ['Property'],                                                                   required: true },
  { key: 'residentName',  headers: ['Resident'],                                                                   required: true },
  { key: 'residentEmail', headers: ['Email'] },
  { key: 'residentPhone', headers: ['Phone'] },
  { key: 'leaseEnd',      headers: ['Lease End', 'Lease end date'] },
  { key: 'status',        headers: ['Status'] },
  { key: 'leaseSigned',   headers: ['Lease Signed', 'lease signed'] },
  { key: 'depositPaid',   headers: ['Deposit Paid', 'Deposit paid'] },
  { key: 'moveOut',       headers: ['Move Out Date'] },
  { key: 'notes',         headers: ['Notes'] },
  { key: 'nextResident',  headers: ['Next Resident', 'Resident for Next Year'] },
  { key: 'nextEmail',     headers: ['Next Email', "Next Resident's Email", 'Next Resident’s Email'] },
  { key: 'nextPhone',     headers: ['Next Phone', "Next Resident's Phone Number (if new tenant)", 'Next Resident’s Phone Number (if new tenant)'] },
  { key: 'nextMoveIn',    headers: ['Next Move In', 'Next Residents Move In Date'] },
  { key: 'owner',         headers: ['Owner'] },
  { key: 'area',          headers: ['Area'] },
];

// Normalize a header for matching: lowercase, collapse whitespace, normalize
// smart quotes to straight, trim.
export function normalizeHeader(h) {
  return (h ?? '')
    .toString()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a `fieldKey -> columnIndex` map by scanning the header row.
 * Returns { indices, missing } where `missing` lists required fields not found.
 */
export function buildHeaderIndex(headerRow) {
  const normToIdx = new Map();
  headerRow.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (n && !normToIdx.has(n)) normToIdx.set(n, i);
  });

  const indices = {};
  const missing = [];
  for (const spec of TENANT_FIELD_SPECS) {
    let foundIdx;
    for (const candidate of spec.headers) {
      const idx = normToIdx.get(normalizeHeader(candidate));
      if (idx != null) { foundIdx = idx; break; }
    }
    if (foundIdx != null) {
      indices[spec.key] = foundIdx;
    } else if (spec.required) {
      missing.push(spec.key);
    }
  }
  return { indices, missing };
}
