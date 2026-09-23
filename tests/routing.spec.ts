import { test, expect } from '@playwright/test';
import { visitanteSemDados } from './supabase-mock';

test.beforeEach(async ({ page }) => { await visitanteSemDados(page); });

const ROTAS = ['/regras', '/equipe', '/sitios', '/disponibilidade', '/historico'] as const;

test('navigation links work', async ({ page }) => {
  await page.goto('/');
  // A raiz redireciona para o contexto padrão; clicar antes disso perde a navegação.
  await expect(page).toHaveURL(/\/\d{4}-\d{2}-\d{2}$/);

  await page.getByRole('link', { name: 'Regras & Conferência' }).click();
  await expect(page).toHaveURL(/\/regras$/);

  await page.getByRole('link', { name: 'Equipe' }).click();
  await expect(page).toHaveURL(/\/equipe$/);

  await page.getByRole('link', { name: 'Sítios' }).click();
  await expect(page).toHaveURL(/\/sitios$/);

  await page.getByRole('link', { name: 'Histórico' }).click();
  await expect(page).toHaveURL(/\/historico$/);

  await page.getByRole('link', { name: 'Grade da Semana' }).click();
  await expect(page).toHaveURL(/(?:\/|\/\d{4}-\d{2}-\d{2})$/);
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
