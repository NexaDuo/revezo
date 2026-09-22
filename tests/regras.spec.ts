import { test, expect } from '@playwright/test';

test('regras page loads and displays header', async ({ page }) => {
  await page.goto('/regras');
  
  // Wait for the main container or header
  await expect(page.getByRole('heading', { name: 'Gerenciador de Regras' })).toBeVisible();
  
  // Verify if it shows "Carregando..." initially or the table is visible
  // We can just verify if the loading text or the table appears
  const loading = page.locator('text=Carregando...');
  const table = page.locator('table');
  
  await expect(loading.or(table.first())).toBeVisible();
});
