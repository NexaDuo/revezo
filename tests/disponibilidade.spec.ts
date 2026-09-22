import { test, expect } from '@playwright/test';

test('tela de disponibilidade abre e explica o estado vazio', async ({ page }) => {
  await page.goto('/disponibilidade');
  await expect(page.getByRole('heading', { name: 'Disponibilidade da semana' })).toBeVisible();

  // sem semana importada, a tela tem de dizer o que fazer — não ficar em branco
  await expect(page.getByText('Nenhuma semana importada ainda')).toBeVisible();
  await expect(page.getByText(/Importar Planilha/)).toBeVisible();
});

test('link de disponibilidade aparece na navegacao', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Disponibilidade');
  await expect(page).toHaveURL(/\/disponibilidade$/);
});
