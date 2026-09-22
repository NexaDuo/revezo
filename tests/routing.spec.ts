import { test, expect } from '@playwright/test';

test('navigation links work', async ({ page }) => {
  await page.goto('/');
  
  // Click on "Regras & Conferência"
  await page.click('text=Regras & Conferência');
  await expect(page).toHaveURL(/.*\/regras/);
  
  // Click on "Equipe (21)"
  await page.click('text=Equipe');
  await expect(page).toHaveURL(/.*\/equipe/);
  
  // Click on "Sítios"
  await page.click('text=Sítios');
  await expect(page).toHaveURL(/.*\/sitios/);

  // Click on "Histórico"
  await page.click('text=Histórico');
  await expect(page).toHaveURL(/.*\/historico/);
  
  // Click on "Grade da Semana"
  await page.click('text=Grade da Semana');
  await expect(page).toHaveURL(/\/$/);
});
