import { test, expect } from '@playwright/test';
import { defaultConfig, generateSchedule, validar, criarEscalaVazia, canon } from '../src/lib/solver';
import type { Config } from '../src/lib/solver/types';
import { HAS_ENV, autenticarComoCoordenador, mockarUnidade } from './supabase-mock';
import fs from 'node:fs';

// `defaultConfig.equipe` vem vazio (a equipe é dado da unidade); a do modo
// demonstração sai do fixture fictício, como em versoes-grade.spec.ts.
const fixture = JSON.parse(fs.readFileSync(new URL('../docs/referencia/disponibilidade_03a07.json', import.meta.url), 'utf8'));
const configDemo: Config = {
  ...defaultConfig,
  equipe: fixture.disponibilidade.map((d: any) => ({ n: d.nome, c: d.categoria === 'enfermeiro' ? 'enf' : 'tec', t: d.turno === 'manhã' ? 'manha' : d.turno })),
  disp: Object.fromEntries(fixture.disponibilidade.map((d: any) => [d.nome, Object.values(d.status).slice(0, defaultConfig.dias.length)])),
};

test('duplicidade é alerta nas duas células, mesmo com regras desligadas', () => {
  const config = structuredClone(configDemo);
  for (const regra of Object.values(config.regras)) regra.on = false;
  const escala = criarEscalaVazia(config);
  const [a, b] = config.sitios.manha;
  const nome = config.equipe[0].n;
  escala.manha[a.n][0] = [nome];
  escala.manha[b.n][0] = [nome];
  expect(validar(config, escala)).toEqual([
    { hard: false, regra: 'duplicidade', turno: 'manha', sitio: a.n, d: 0, msg: `${nome} também está em ${canon(b.n)} neste turno` },
    { hard: false, regra: 'duplicidade', turno: 'manha', sitio: b.n, d: 0, msg: `${nome} também está em ${canon(a.n)} neste turno` },
  ]);
  escala.manha[b.n][0] = [];
  escala.tarde[config.sitios.tarde[0].n][0] = [nome];
  expect(validar(config, escala)).toEqual([]);
});

test('solver padrão não gera duplicidade', () => {
  const { escala, violacoes } = generateSchedule(configDemo);
  // Sem gente escalada o teste não provaria nada.
  expect(Object.values(escala.manha).flat(2).length).toBeGreaterThan(0);
  expect(violacoes.filter(v => v.regra === 'duplicidade')).toEqual([]);
});

test('Adicionar informa duplicidade, permite escolher e marca ambas as células', async ({ page }) => {
  const semana = '2026-08-03';
  if (HAS_ENV) {
    await autenticarComoCoordenador(page);
    await mockarUnidade(page, {
      equipe: [
        { id: 'p1', nome: 'Pessoa Alfa', nome_curto: 'Pessoa Alfa', categoria: 'tec', turno_base: 'ambos', ativo: true, ordem: 1 },
        { id: 'p2', nome: 'Pessoa Beta', nome_curto: 'Pessoa Beta', categoria: 'tec', turno_base: 'ambos', ativo: true, ordem: 2 },
      ],
      sitios: [
        { id: 's1', nome: 'Sala Alfa', categoria_permitida: 'ambos', ativo: true, ordem: 1 },
        { id: 's2', nome: 'Sala Beta', categoria_permitida: 'ambos', ativo: true, ordem: 2 },
      ],
      disponiveis: { data_inicio: semana, dias: defaultConfig.dias },
    });
  } else {
    await page.addInitScript(s => localStorage.setItem('demo_disponibilidade', JSON.stringify([s])), {
      data_inicio: semana, data_fim: '2026-08-07', dias: defaultConfig.dias, dados: configDemo.disp,
    });
  }
  await page.goto(`/${HAS_ENV ? 'hospital-teste' : 'demonstracao'}/${semana}`);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  const tabela = page.getByRole('table').first();
  await expect(tabela).toBeVisible();
  const linhas = tabela.locator('tbody tr');
  const origem = linhas.filter({ has: page.locator('td:nth-child(2) [draggable="true"]') }).first();
  const nome = (await origem.locator('td').nth(1).locator('[draggable="true"] span').first().innerText()).trim();
  const sitioOrigem = (await origem.locator('td').first().innerText()).trim();
  const destino = linhas.filter({ hasNot: page.getByRole('cell', { name: sitioOrigem, exact: true }) }).first();
  const sitioDestino = (await destino.locator('td').first().innerText()).trim();
  const celula = destino.locator('td').nth(1);
  const select = celula.getByRole('combobox');
  await select.focus();
  const opcao = select.locator('option').filter({ hasText: `${nome} —` }).first();
  // O rótulo mostra o motivo mais grave; todos os motivos ficam no title.
  await expect(opcao).toHaveAttribute('title', new RegExp(`${nome} também está em ${canon(sitioOrigem)} neste turno`));
  await expect(opcao).toBeEnabled();
  await select.selectOption(nome);
  await expect(celula.locator('li').filter({ hasText: `${nome} também está em ${canon(sitioOrigem)} neste turno` })).toBeVisible();
  await expect(origem.locator('td').nth(1).locator('li').filter({ hasText: `${nome} também está em ${canon(sitioDestino)} neste turno` })).toBeVisible();
  await expect(celula.locator('.marca-alerta').filter({ hasText: nome })).toBeVisible();
  await expect(origem.locator('td').nth(1).locator('.marca-alerta').filter({ hasText: nome })).toBeVisible();
});
