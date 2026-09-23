import { Config, Escala, Pessoa } from "./types";
import { validar } from "./validator";
import { indexarEquipe, criarEscalaVazia, disponivel, cabeNoSitio, ondeEsteve, estaFora, podeTurno, ehPlantao, canon,
         ehPostoFixo, postoFixoNoTurno, sitioProibido, formariaDuplaProibida, pessoas16h, celula } from "./utils";

function jaEstaNoDia(escala: Escala, config: Config, n: string, d: number, turno: "manha" | "tarde"): boolean {
  return ondeEsteve(escala, config, n, d, turno).length > 0;
}

function podeColocar(escala: Escala, config: Config, pessoaMap: Record<string, Pessoa>, n: string, turno: "manha" | "tarde", sitio: string, d: number): boolean {
  if (!disponivel(config, pessoaMap, n, d, turno)) return false;
  if (!cabeNoSitio(config, pessoaMap, n, sitio, turno)) return false;
  if (jaEstaNoDia(escala, config, n, d, turno)) return false;
  // Cada restrição respeita o seu interruptor: desligar a regra no painel tem
  // de mudar a GERAÇÃO, não só a conferência. Sem isto o painel é enfeite.
  const r = config.regras;

  if (r.proibicoesSitio.on && sitioProibido(config, n, sitio)) return false;

  if (r.diasSeguidos.on && !ehPostoFixo(pessoaMap, n, sitio, turno)
      && d > 0 && celula(escala, turno, sitio, d - 1).includes(n)) return false;

  if (r.sextaSegunda.on && d === 0
      && (config.sextaAnterior[turno]?.[sitio] || []).includes(n)) return false;

  const cel = celula(escala, turno, sitio, d);
  if (r.duplaProibida.on && formariaDuplaProibida(config, cel, n)) return false;

  if (r.plantaoMesmo.on && ehPlantao(config.disp, n, d) && turno === "tarde"
      && ondeEsteve(escala, config, n, d, "manha").map(canon).includes(canon(sitio))) return false;

  return true;
}

function construir(config: Config): Escala {
  const esc = criarEscalaVazia(config);
  const pessoaMap = indexarEquipe(config.equipe);
  
  const put = (t: "manha"|"tarde", s: string, d: number, n: string) => { 
    if (!esc[t][s][d].includes(n)) esc[t][s][d].push(n); 
  };
  
  const contaSitio = (n: string, t: "manha"|"tarde", s: string) => { 
    let k = 0; 
    for (let d = 0; d < config.dias.length; d++) if (esc[t][s][d].includes(n)) k++; 
    return k; 
  };
  
  const contaAcoes = (n: string) => { 
    let k = 0; 
    for (let d = 0; d < config.dias.length; d++) {
      for (const t of ["manha", "tarde"] as ("manha"|"tarde")[]) {
        if (esc[t][config.acoes] && esc[t][config.acoes][d].includes(n)) k++;
      }
    }
    return k; 
  };
  
  const carga = (n: string, t: "manha"|"tarde") => { 
    let k = 0; 
    for (let d = 0; d < config.dias.length; d++) k += ondeEsteve(esc, config, n, d, t).length; 
    return k; 
  };

  // 4.1 postos fixos: quem tem `fixo` ocupa aquele sítio todos os dias, nos dois turnos
  for (const p of config.equipe) {
    if (!p.fixo) continue;
    for (const t of ["manha", "tarde"] as ("manha" | "tarde")[]) {
      // rótulo do posto NESTE turno: o sítio pode ter outro nome à tarde
      const rotulo = postoFixoNoTurno(p, t)!;
      const sitio = config.sitios[t].find(x => canon(x.n) === canon(rotulo));
      if (!sitio || !esc[t][sitio.n]) continue;
      for (let d = 0; d < config.dias.length; d++) {
        // posto fixo não isenta turno-base: quem só trabalha de manhã não
        // ocupa o posto à tarde só por tê-lo como fixo.
        if (estaFora(config.disp, p.n, d)) continue;
        if (!podeTurno(pessoaMap, config.disp, p.n, d, t)) continue;
        put(t, sitio.n, d, p.n);
      }
    }
  }

  // 4.2 colocações fixas
  for (const f of config.fixas) {
    if (pessoaMap[f.p] && !estaFora(config.disp, f.p, f.d) && podeTurno(pessoaMap, config.disp, f.p, f.d, f.t)) {
      if (esc[f.t][f.s]) put(f.t, f.s, f.d, f.p);
    }
  }

  // 4.3 sítios normais, dia a dia
  for (const turno of ["manha", "tarde"] as ("manha" | "tarde")[]) {
    for (let d = 0; d < config.dias.length; d++) {
      const sitios = config.sitios[turno].filter(s => s.n !== config.acoes && s.n !== "Ensino");
      for (const s of sitios) {
        if (esc[turno][s.n][d].length > 0) continue;
        let cands = config.equipe.filter(p => !p.fixo && p.t !== "noite" && podeColocar(esc, config, pessoaMap, p.n, turno, s.n, d));
        if (!cands.length) 
          cands = config.equipe.filter(p => p.t === "noite" && podeColocar(esc, config, pessoaMap, p.n, turno, s.n, d));
        if (!cands.length) continue;
        
        const custo = (p: Pessoa) => {
          let c = 4 * contaSitio(p.n, turno, s.n) + 1.5 * carga(p.n, turno);
          if (ehPlantao(config.disp, p.n, d)) c += 2;
          c += p.custoExtra || 0;
          return c + Math.random() * 1.2;
        };
        
        cands.sort((a, b) => custo(a) - custo(b));
        put(turno, s.n, d, cands[0].n);
      }
      
      // 4.4 Ações
      if (esc[turno][config.acoes]) {
        const alvo = 1;
        while (esc[turno][config.acoes][d].length < alvo) {
          const cands = config.equipe.filter(p => !p.fixo && p.t !== "noite" && podeColocar(esc, config, pessoaMap, p.n, turno, config.acoes, d));
          if (!cands.length) break;
          cands.sort((a, b) => {
            const f = (p: Pessoa) => contaAcoes(p.n) * 10 + (ehPlantao(config.disp, p.n, d) ? -3 : 0) + carga(p.n, turno) * 0.5 + Math.random();
            return f(a) - f(b);
          });
          put(turno, config.acoes, d, cands[0].n);
        }
      }
    }
  }

  // 4.5 quem entra às 16h divide sítio com quem já está lá, alternando a cada dia
  for (const { n } of pessoas16h(config.equipe)) {
    let ant: string | null = null;
    for (let d = 0; d < config.dias.length; d++) {
      if (estaFora(config.disp, n, d)) continue;
      if (jaEstaNoDia(esc, config, n, d, "tarde")) { 
        ant = ondeEsteve(esc, config, n, d, "tarde")[0] || null; 
        continue; 
      }
      const ordem = config.prioridadeDupla;
      const opts = ordem.filter(s => esc.tarde[s] && canon(s) !== canon(ant || "") && podeColocar(esc, config, pessoaMap, n, "tarde", s, d));
      const alvo = opts.find(s => esc.tarde[s][d].length === 1) || opts[0];
      if (alvo) { esc.tarde[alvo][d].push(n); ant = alvo; }
    }
  }

  // 4.6 fechar a regra "1x por semana em Ações"
  for (const p of config.equipe) {
    if (p.isentoAcoes || p.fixo) continue;
    if (contaAcoes(p.n) > 0) continue;
    const turno = p.t === "manha" ? "manha" : "tarde";
    if (!esc[turno][config.acoes]) continue;
    
    const dias = config.dias.map((_, i) => i)
      .filter(d => !estaFora(config.disp, p.n, d) && podeTurno(pessoaMap, config.disp, p.n, d, turno))
      .filter(d => !(esc[turno][config.acoes][d] || []).includes(p.n))
      .filter(d => d === 0 ? !(config.sextaAnterior[turno]?.[config.acoes] || []).includes(p.n) : true)
      .filter(d => !(esc[turno][config.acoes][d - 1] || []).includes(p.n) && !(esc[turno][config.acoes][d + 1] || []).includes(p.n))
      .sort((a, b) => (ehPlantao(config.disp, p.n, b) ? 1 : 0) - (ehPlantao(config.disp, p.n, a) ? 1 : 0)
                 || esc[turno][config.acoes][a].length - esc[turno][config.acoes][b].length);
    if (dias.length) put(turno, config.acoes, dias[0], p.n);
  }
  
  return esc;
}

function pontuar(config: Config, esc: Escala): number {
  const v = validar(config, esc);
  return v.reduce((a, x) => a + (x.hard ? 100 : 1), 0);
}

export function resolver(config: Config, iteracoes: number = 350): { escala: Escala, score: number } {
  let best: Escala | null = null;
  let bs = Infinity;
  for (let i = 0; i < iteracoes; i++) {
    const e = construir(config);
    const s = pontuar(config, e);
    if (s < bs) { bs = s; best = e; }
    if (bs === 0) break;
  }
  return { escala: best || construir(config), score: bs };
}
