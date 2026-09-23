import { test, expect } from '@playwright/test';
import { HAS_ENV } from './supabase-mock';

test('clique fora fecha o modal, a menos que haja alteração não salva', async ({ page }) => {
  test.skip(HAS_ENV, 'Modo demonstração: entra como coordenador e grava em memória.');
  await page.goto('/equipe');
  const fundo = (m: ReturnType<typeof page.getByRole>) => m.locator('xpath=..');

  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Novo registro' });
  await expect(modal).toBeVisible();
  await fundo(modal).click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Novo registro' });
  await modal.getByLabel('Nome', { exact: true }).fill('Pessoa Fictícia');
  await fundo(modal).click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('status')).toHaveText('Há alterações não salvas: salve ou cancele para fechar.');

  // Clique dentro do modal nunca fecha.
  await modal.getByRole('heading').click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(modal).toHaveCount(0);
});
