import { test, expect } from '@playwright/test';
import { visitanteSemDados } from './supabase-mock';

test.beforeEach(async ({ page }) => { await visitanteSemDados(page); });

test('regras page loads and displays header', async ({ page }) => {
  await page.goto('/regras');

  await expect(page.getByRole('heading', { name: /^Regras/ })).toBeVisible();

  // A tabela padrão mostra "Carregando..." e depois a própria tabela — vazia
  // ou não, "Nenhum registro encontrado." fica dentro dela. O que não pode é
  // a tela ficar em branco.
  await expect(page.locator('text=Carregando...').or(page.locator('table')).first()).toBeVisible();
});
