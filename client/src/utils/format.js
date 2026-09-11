export function paiseToInr(paise, { withSymbol = true } = {}) {
  const rupees = (Number(paise) || 0) / 100;
  const formatted = rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `₹${formatted}` : formatted;
}

export function rupeesInputToPaise(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [rupees, paise = ''] = s.split('.');
  return parseInt(rupees, 10) * 100 + parseInt((paise + '00').slice(0, 2), 10);
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function toDateInputValue(date) {
  const d = date ? new Date(date) : new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}
