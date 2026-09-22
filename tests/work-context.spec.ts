import { test, expect } from '@playwright/test';

/** Extrai o dia (DD) de um ISO `YYYY-MM-DD` sem depender de fuso horário. */
function diaDe(iso: string): string {
  return iso.split('-')[2];
}

test.describe('WorkContext — semana e unidade dirigem o que a tela carrega', () => {
  test('o título da semana vem de semanaInicio, não de new Date() solto', async ({ page }) => {
    await page.goto('/');

    const titulo = page.getByTestId('titulo-semana');
    await expect(titulo).toBeVisible();

    const semanaInicio = await titulo.getAttribute('data-semana-inicio');
    expect(semanaInicio, 'App.tsx precisa expor a semana do WorkContext em data-semana-inicio').not.toBeNull();
    expect(semanaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // O texto renderizado ("Semana DD a DD de mês / ano") tem que bater com a
    // segunda-feira que o contexto guarda — não com uma data calculada de novo
    // dentro do componente.
    const texto = await titulo.innerText();
    expect(texto).toContain(diaDe(semanaInicio!));
  });

  test('semana sem disponibilidade salva mostra aviso explícito, não fica em silêncio', async ({ page }) => {
    await page.goto('/disponibilidade');

    const titulo = await page.getByRole('heading', { name: 'Disponibilidade da semana' });
    await expect(titulo).toBeVisible();

    // A semana em contexto (a mesma do título em "/") ainda não tem nada
    // salvo neste ambiente de teste: um aviso explícito precisa aparecer —
    // seja sobre a semana (sessão com unidade resolvida) seja sobre a
    // ausência de unidade (sem sessão, rodando com Supabase real). O que não
    // pode acontecer é a tela ficar em silêncio, sem dizer por que está vazia.
    const avisoSemana = page.getByText(/Nenhuma disponibilidade salva para a semana de/);
    const avisoSemUnidade = page.getByText(/Nenhuma unidade selecionada/);
    await expect(avisoSemana.or(avisoSemUnidade)).toBeVisible();
  });

  test('Gerar Grade usa a semana do contexto e avisa quando ela não tem disponibilidade salva', async ({ page }) => {
    await page.goto('/');

    const botaoGerar = page.getByRole('button', { name: /Gerar Grade/ });
    // Deslogado (ou logado como visualizador) o botão nem existe — a tela vira
    // "Modo Leitura". Esse cenário já é coberto pelo comportamento de
    // isCoordenador e não é o que este teste verifica.
    const visivel = await botaoGerar.isVisible().catch(() => false);
    test.skip(!visivel, 'Botão "Gerar Grade" só aparece para coordenador/admin — sem sessão autenticada, este ambiente entra como visualizador.');

    await botaoGerar.click();

    const aviso = page.getByText(/Não há disponibilidade salva para a semana de/);
    await expect(aviso).toBeVisible();
  });
});
