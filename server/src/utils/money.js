// All persisted money is an integer number of paise. Never use floats for money math.

function rupeesToPaise(input) {
  if (input === null || input === undefined || input === '') return NaN;
  const normalized = String(input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  const [rupees, paise = ''] = normalized.split('.');
  const paisePadded = (paise + '00').slice(0, 2);
  return parseInt(rupees, 10) * 100 + parseInt(paisePadded || '0', 10);
}

function paiseToRupeesString(paise) {
  const n = Number(paise) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const rupees = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${rupees}.${cents}`;
}

function isValidPositivePaise(paise) {
  return Number.isInteger(paise) && paise > 0 && paise <= 100000000000; // sanity ceiling: 1e9 rupees
}

module.exports = { rupeesToPaise, paiseToRupeesString, isValidPositivePaise };
