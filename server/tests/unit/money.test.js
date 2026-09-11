const { rupeesToPaise, paiseToRupeesString, isValidPositivePaise } = require('../../src/utils/money');

describe('money utils', () => {
  test('converts plain rupees to paise', () => {
    expect(rupeesToPaise('100')).toBe(10000);
  });

  test('converts rupees with decimals to paise', () => {
    expect(rupeesToPaise('4064.50')).toBe(406450);
  });

  test('strips comma formatting', () => {
    expect(rupeesToPaise('10,000')).toBe(1000000);
  });

  test('rejects malformed amounts', () => {
    expect(rupeesToPaise('abc')).toBeNaN();
    expect(rupeesToPaise('12.345')).toBeNaN();
    expect(rupeesToPaise('')).toBeNaN();
    expect(rupeesToPaise(null)).toBeNaN();
    expect(rupeesToPaise('-50')).toBeNaN();
  });

  test('formats paise back to a rupees string', () => {
    expect(paiseToRupeesString(551700)).toBe('5517.00');
    expect(paiseToRupeesString(-40650)).toBe('-406.50');
  });

  test('validates positive integer paise', () => {
    expect(isValidPositivePaise(100)).toBe(true);
    expect(isValidPositivePaise(0)).toBe(false);
    expect(isValidPositivePaise(-5)).toBe(false);
    expect(isValidPositivePaise(1.5)).toBe(false);
  });
});
