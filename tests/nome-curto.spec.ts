import { test, expect } from '@playwright/test';
import { nomeCurto, nomesCurtos } from '../src/lib/excelParser';
import type { Pessoa } from '../src/lib/solver/types';

// Lógica pura: roda igual com e sem `.env`. O apelido vem da Equipe, não do código.
const equipe: Pessoa[] = [
  { n: 'Bia P', c: 'tec', t: 'manha', completo: 'Beatriz Paiva' },
  { n: 'Bia J', c: 'tec', t: 'tarde', completo: 'Beatriz Juliano' },
  { n: 'Lia', c: 'enf', t: 'manha', completo: 'Lia' },
  { n: 'Tainá', c: 'enf', t: 'manha' },
];

test('nome da planilha acha o nome curto pelo nome cadastrado na Equipe', () => {
  expect(nomeCurto('Beatriz Paiva Nunes', equipe)).toBe('Bia P');
  expect(nomeCurto('BEATRIZ JULIANO VIDAL', equipe)).toBe('Bia J');
  expect(nomeCurto('Lia Moreira Campos', equipe)).toBe('Lia');
});

test('prefixo só casa em palavra inteira', () => {
  expect(nomeCurto('Liana Souza', equipe)).toBeNull();
});

test('sem nome cadastrado, cai no primeiro nome igual ao nome curto', () => {
  expect(nomeCurto('Tainá Rocha Leite', equipe)).toBe('Tainá');
});

test('fora da Equipe, homônimos ganham a inicial do sobrenome', () => {
  expect(nomesCurtos([{ nome: 'Noemi Bastos' }, { nome: 'Noemi Viana' }], [])).toEqual(['Noemi B', 'Noemi V']);
});
