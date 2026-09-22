import { test, expect } from '@playwright/test';

test('tela de disponibilidade abre e explica o estado vazio', async ({ page }) => {
  await page.goto('/disponibilidade');
  await expect(page.getByRole('heading', { name: 'Disponibilidade da semana' })).toBeVisible();

  // sem semana importada, a tela tem de dizer o que fazer — não ficar em branco.
  // O texto é procurado DENTRO do estado vazio: "Importar Planilha" também
  // aparece no botão da barra de ações, e um locator solto casa com os dois
  // sempre que o usuário tem permissão de escrita.
  const vazio = page.locator('div', { hasText: 'Nenhuma semana importada ainda' }).last();
  await expect(vazio).toBeVisible();
  await expect(vazio.getByText(/Importar Planilha/)).toBeVisible();
});

test('link de disponibilidade aparece na navegacao', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Disponibilidade' }).click();
  await expect(page).toHaveURL(/\/disponibilidade$/);
});
