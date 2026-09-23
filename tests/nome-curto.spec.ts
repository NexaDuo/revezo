import { test, expect } from '@playwright/test';
import { nomeCurto, nomesCurtos, casarComEquipe, avisoNaoCasados } from '../src/lib/excelParser';
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

// Casos da planilha real da unidade piloto, com nomes fictícios: o cadastro
// omite sobrenomes do meio, abrevia com inicial, e o apelido não é o primeiro
// nome. Antes, só casava se o cadastro fosse prefixo do nome da planilha.
const piloto: Pessoa[] = [
  { n: 'Clara K', c: 'enf', t: 'tarde', completo: 'Clara K' },
  { n: 'Cacá V', c: 'enf', t: 'noite', completo: 'Clara Fonseca Valente' },
  { n: 'Mirela', c: 'enf', t: 'tarde', completo: 'Mirela Fontes' },
  { n: 'Dani P', c: 'tec', t: 'manha', completo: 'Daniela Paiva' },
  { n: 'Dani J', c: 'tec', t: 'tarde', completo: 'Daniela Juliano' },
];

test('cadastro que pula sobrenome do meio casa com o nome inteiro da planilha', () => {
  expect(nomeCurto('Clara Fonseca Moreira Valente', piloto)).toBe('Cacá V');
  expect(nomeCurto('Mirela Teixeira Fontes', piloto)).toBe('Mirela');
  expect(nomeCurto('Daniela Alves Paiva Dias', piloto)).toBe('Dani P');
});

test('letra solta no cadastro é inicial de sobrenome', () => {
  expect(nomeCurto('Clara Moura Kaufmann', piloto)).toBe('Clara K');
  expect(nomeCurto('Clara Moura Martins', piloto)).toBeNull();
});

test('a planilha inteira do piloto vira os nomes curtos exatos da Equipe', () => {
  const planilha = [
    { nome: 'Clara Moura Kaufmann' }, { nome: 'Clara Fonseca Moreira Valente' },
    { nome: 'Mirela Teixeira Fontes' }, { nome: 'Daniela Alves Paiva Dias' },
    { nome: 'Daniela Juliano Vidal' },
  ];
  const r = casarComEquipe(planilha, piloto);
  expect(r.map(c => c.curto)).toEqual(['Clara K', 'Cacá V', 'Mirela', 'Dani P', 'Dani J']);
  expect(r.every(c => c.na === 'equipe')).toBe(true);
});

test('empate entre duas pessoas é ambíguo, não chute', () => {
  const equipe: Pessoa[] = [
    { n: 'Rosa A', c: 'tec', t: 'manha', completo: 'Rosa Lima' },
    { n: 'Rosa B', c: 'tec', t: 'tarde', completo: 'Rosa Costa' },
  ];
  expect(nomeCurto('Rosa Lima Costa', equipe)).toBeNull();
  const [c] = casarComEquipe([{ nome: 'Rosa Lima Costa' }], equipe);
  expect(c).toEqual({ curto: 'Rosa', na: 'ambiguo', candidatos: ['Rosa A', 'Rosa B'] });
  expect(avisoNaoCasados([{ nome: 'Rosa Lima Costa' }], [c])).toEqual(['Rosa Lima Costa (pode ser Rosa A ou Rosa B)']);
});

test('duas linhas na mesma pessoa não roubam a disponibilidade uma da outra', () => {
  const r = casarComEquipe([{ nome: 'Mirela Fontes Alves' }, { nome: 'Mirela Fontes Braga' }], piloto);
  expect(r.map(c => c.na)).toEqual(['ambiguo', 'ambiguo']);
  expect(r.map(c => c.curto)).toEqual(['Mirela A', 'Mirela B']);
});

test('quem está fora da Equipe nunca herda o nome curto de alguém do cadastro', () => {
  const equipe: Pessoa[] = [
    { n: 'Rosa', c: 'tec', t: 'manha', completo: 'Rosa Lima' },
    { n: 'Rosa C', c: 'tec', t: 'tarde', completo: 'Rosa Costa' },
  ];
  const [c] = casarComEquipe([{ nome: 'Rosa Lima Costa' }], equipe);
  expect(c.na).toBe('ambiguo');
  expect(c.curto).toBe('Rosa Lima Costa');
});
