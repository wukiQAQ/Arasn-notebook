async function selectOption(page, label, value) {
  if (label === '外观主题') {
    const mode = page.getByRole('button', { name: { light: '浅色', dark: '深色', system: '跟随系统' }[value], exact: true });
    if (!await mode.isVisible()) await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^外观/ }).click();
    await mode.click();
    await page.locator('.appearance-actions').getByText('更改实时生效并自动保存').waitFor();
    return;
  }
  const control = page.getByRole('combobox', { name: label, exact: true });
  // The same desktop suites also run against previously packaged native selects.
  if (await control.evaluate(element => element.tagName === 'SELECT')) { await control.selectOption(value); return; }
  await control.click();
  const popup = page.locator(`[id=${JSON.stringify(await control.getAttribute('aria-controls'))}]`);
  await page.getByRole('option').and(page.locator(`[data-value=${JSON.stringify(value)}]`)).click();
  await popup.waitFor({ state: 'hidden' });
}
module.exports = { selectOption };
