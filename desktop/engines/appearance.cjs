const options = require('../appearance-options.json');

function validAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const color = entry => entry === null || (typeof entry === 'string' && /^#[\da-f]{6}$/i.test(entry));
  return Object.keys(value).length === 6 && options.presets.includes(value.preset)
    && options.fonts.includes(value.font) && options.scales.includes(value.scale)
    && color(value.accent) && color(value.background) && color(value.foreground);
}

module.exports = { validAppearance };
