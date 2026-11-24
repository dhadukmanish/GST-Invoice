/** Indian states / UTs with their GST state codes (first two digits of a GSTIN). */
export const STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

export const stateName = (code?: string | null) => STATES.find((s) => s.code === code)?.name ?? '';

/** GSTIN format: 2-digit state, 10-char PAN, entity no, Z, checksum. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const stateFromGstin = (gstin?: string | null) => {
  const g = (gstin ?? '').trim().toUpperCase();
  return GSTIN_RE.test(g) && STATES.some((s) => s.code === g.slice(0, 2)) ? g.slice(0, 2) : '';
};

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
export const UNITS = ['PCS', 'NOS', 'KG', 'GM', 'LTR', 'MTR', 'BOX', 'PACK', 'SET', 'DOZ', 'PAIR', 'BAG', 'HRS', 'JOB', 'SQFT'];
export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank', 'Card', 'Cheque', 'Other'] as const;
