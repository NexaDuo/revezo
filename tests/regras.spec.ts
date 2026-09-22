import { test, expect } from '@playwright/test';

test('regras page loads and displays header', async ({ page }) => {
  await page.goto('/regras');

  await expect(page.getByRole('heading', { name: 'Gerenciador de Regras' })).toBeVisible();

  // Sem Supabase configurado (o caso do CI) a lista volta vazia na hora, então
  // não há tabela nem frame de "Carregando...". Os três estados são válidos —
  // o que não pode é a tela ficar em branco.
  const carregando = page.locator('text=Carregando...');
  const tabela = page.locator('table');
  const vazio = page.locator('text=Nenhuma regra cadastrada');

  await expect(carregando.or(tabela.first()).or(vazio)).toBeVisible();
});
