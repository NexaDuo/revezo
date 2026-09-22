import { test, expect } from '@playwright/test';

const ROTAS = ['/regras', '/equipe', '/sitios', '/disponibilidade', '/historico'] as const;

test('navigation links work', async ({ page }) => {
  await page.goto('/');

  await page.click('text=Regras & Conferência');
  await expect(page).toHaveURL(/\/regras$/);

  await page.click('text=Equipe');
  await expect(page).toHaveURL(/\/equipe$/);

  await page.click('text=Sítios');
  await expect(page).toHaveURL(/\/sitios$/);

  await page.click('text=Histórico');
  await expect(page).toHaveURL(/\/historico$/);

  await page.click('text=Grade da Semana');
  await expect(page).toHaveURL(/\/$/);
});

// Regressão: os <Link> precisam respeitar o basename. Sem ele, num site
// servido sob um subcaminho (/revezo/) a navegação caía para a raiz do
// domínio e a tela sumia.
test('links respeitam o basename do site', async ({ page }) => {
  await page.goto('/');
  const base = await page.evaluate(() => document.querySelector('base')?.href ?? location.origin + '/');

  for (const rota of ROTAS) {
    const href = await page.locator(`a[href$="${rota}"]`).first().getAttribute('href');
    expect(href, `link para ${rota} deve começar pelo base do site`).not.toBeNull();
    expect(new URL(href!, base).pathname.endsWith(rota)).toBe(true);
  }
});

// Regressão: abrir a rota direto (ou recarregar) tem de renderizar a tela,
// não cair na raiz. Em produção isso depende do 404.html do GitHub Pages.
test('entrar direto numa rota funciona', async ({ page }) => {
  for (const rota of ROTAS) {
    await page.goto(rota);
    await expect(page).toHaveURL(new RegExp(`${rota}$`));
    await expect(page.locator('header')).toBeVisible();
  }
});
