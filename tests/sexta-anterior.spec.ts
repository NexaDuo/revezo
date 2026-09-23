import { test, expect } from '@playwright/test';
import { semanaAnterior, sextaDaEscala } from '../src/lib/sextaAnterior';
import { defaultConfig, validar } from '../src/lib/solver';
import type { Escala } from '../src/lib/solver/types';

// Lógica pura: roda igual com e sem `.env`.
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const sitio = defaultConfig.sitios.manha[0].n;
const pessoa = 'Pessoa Fictícia';
const base = { ...defaultConfig, dias: DIAS, equipe: [{ n: pessoa, c: 'enf' as const, t: 'manha' as const }] };

function gradeVazia(): Escala {
  const g: Escala = { manha: {}, tarde: {} };
  for (const t of ['manha', 'tarde'] as const)
    for (const s of defaultConfig.sitios[t]) g[t][s.n] = DIAS.map(() => []);
  return g;
}

test('semana anterior é a segunda de sete dias antes, inclusive virando o mês', () => {
  expect(semanaAnterior('2026-09-28')).toBe('2026-09-21');
  expect(semanaAnterior('2026-10-05')).toBe('2026-09-28');
  expect(semanaAnterior('2026-01-05')).toBe('2025-12-29');
});

test('sexta da escala salva alimenta a regra "sexta ≠ segunda" no validador', () => {
  const passada = gradeVazia();
  passada.manha[sitio][4] = [pessoa];
  const sexta = sextaDaEscala(passada, DIAS);
  expect(sexta?.manha[sitio]).toEqual([pessoa]);

  const atual = gradeVazia();
  atual.manha[sitio][0] = [pessoa];
  const config = { ...base, sextaAnterior: sexta! };
  const violacoes = validar(config, atual).filter(v => v.regra === 'sextaSegunda');
  expect(violacoes).toHaveLength(1);
  expect(violacoes[0].msg).toContain('sexta passada');

  // Sem a escala anterior a regra não dispara — por isso o app avisa.
  expect(validar(base, atual).filter(v => v.regra === 'sextaSegunda')).toHaveLength(0);
});

test('grade sem sexta ou ausente não inventa estado', () => {
  expect(sextaDaEscala(gradeVazia(), ['Segunda', 'Terça', 'Quarta', 'Quinta'])).toBeNull();
  expect(sextaDaEscala(null, DIAS)).toBeNull();
  expect(sextaDaEscala(gradeVazia(), ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta-feira 26/09'])).toEqual({ manha: {}, tarde: {} });
});
