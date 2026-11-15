async function selectOption(page, label, value) {
  const control = page.getByRole('combobox', { name: label, exact: true });
  // The same desktop suites also run against previously packaged native selects.
  if (await control.evaluate(element => element.tagName === 'SELECT')) { await control.selectOption(value); return; }
  await control.click();
  const popup = page.locator(`[id=${JSON.stringify(await control.getAttribute('aria-controls'))}]`);
  await page.getByRole('option').and(page.locator(`[data-value=${JSON.stringify(value)}]`)).click();
  await popup.waitFor({ state: 'hidden' });
}
module.exports = { selectOption };
