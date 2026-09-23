import { test, expect } from '@playwright/test';
import { visitanteSemDados } from './supabase-mock';

test.beforeEach(async ({ page }) => { await visitanteSemDados(page); });

test('o estado colapsado do menu persiste entre reloads', async ({ page }) => {
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav).toBeVisible();

  const botaoRecolher = page.getByRole('button', { name: 'Recolher menu' });
  await expect(botaoRecolher).toBeVisible();
  await expect(botaoRecolher).toHaveAttribute('aria-expanded', 'true');
  await botaoRecolher.click();

  const botaoExpandir = page.getByRole('button', { name: 'Expandir menu' });
  await expect(botaoExpandir).toHaveAttribute('aria-expanded', 'false');

  // O rótulo do link some quando colapsado — o link continua alcançável
  // pelo aria-label estável.
  await expect(page.getByRole('link', { name: 'Grade da Semana' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
});

test('o link ativo tem aria-current', async ({ page }) => {
  await page.goto('/regras');
  await expect(page.getByRole('link', { name: 'Regras & Conferência' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Grade da Semana' })).not.toHaveAttribute('aria-current', 'page');
});

test.describe('menu off-canvas em viewport pequena', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('abre pelo hambúrguer e fecha pelo overlay e pelo Esc', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav).not.toBeInViewport();

    const hamburguer = page.getByRole('button', { name: 'Abrir menu' });
    await expect(hamburguer).toHaveAttribute('aria-expanded', 'false');
    await hamburguer.click();

    await expect(page.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Disponibilidade' })).toBeInViewport();

    // Fecha clicando no overlay.
    await page.mouse.click(340, 700);
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');

    // Reabre e fecha com Esc.
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');

    // Reabre e fecha pelo X do header — o drawer não pode cobri-lo.
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('drawer fechado fica fora do teclado; aberto recebe o foco', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside')).toHaveJSProperty('inert', true);

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.getByRole('link', { name: 'Grade da Semana' })).toBeFocused();
  });

  test('menu recolhido no desktop não recolhe o drawer do celular', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('revezo:sidebar-collapsed', '1'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' }).getByText('Disponibilidade')).toBeVisible();
  });
});

test('impressão esconde a sidebar e o main não fica deslocado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeHidden();

  const caixaMain = await page.locator('main').boundingBox();
  expect(caixaMain, 'main precisa ter geometria em modo impressão').not.toBeNull();
  expect(caixaMain!.x).toBeLessThanOrEqual(1);
});
