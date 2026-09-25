import { Config, Escala, Violacao } from "./types";
import { indexarEquipe, estaFora, podeTurno, cabeNoSitio, ondeEsteve, status, ehPlantao, canon,
         ehPostoFixo, sitioProibido, duplaProibidaEm, pessoas16h, celula } from "./utils";

export function validar(config: Config, escala: Escala): Violacao[] {
  const v: Violacao[] = [];
  const add = (hard: boolean, regra: string, turno: "manha" | "tarde", sitio: string, d: number, msg: string) => 
    v.push({ hard, regra, turno, sitio, d, msg });

  const pessoaMap = indexarEquipe(config.equipe);
  const diasLength = config.dias.length;

  for (const turno of ["manha", "tarde"] as ("manha" | "tarde")[]) {
    // Duplicidade vale sempre (não é regra de painel), inclusive nas linhas
    // preservadas do histórico. É alerta: a escala real tem casos intencionais
    // (ex.: Acolhimento + Ações no mesmo turno), a coordenação decide.
    for (const [sitio, dias] of Object.entries(escala[turno] || {})) {
      for (let d = 0; d < diasLength; d++) {
        for (const n of new Set(dias[d] || [])) {
          for (const [outro, outras] of Object.entries(escala[turno] || {})) {
            if (outro !== sitio && (outras[d] || []).includes(n))
              add(false, "duplicidade", turno, sitio, d, `${n} também está em ${canon(outro)} neste turno`);
          }
        }
      }
    }
    for (const s of config.sitios[turno]) {
      for (let d = 0; d < diasLength; d++) {
        const nomes = celula(escala, turno, s.n, d);
        for (const n of nomes) {
          if (config.regras.disponibilidade.on && estaFora(config.disp, n, d))
            add(true, "disponibilidade", turno, s.n, d, `${n} está de ${status(config.disp, n, d)} nesse dia`);
          
          if (config.regras.turnoBase.on && !podeTurno(pessoaMap, config.disp, n, d, turno)) {
            const p = pessoaMap[n];
            add(true, "turnoBase", turno, s.n, d, p?.t === "noite"
              ? `${n} entra só depois das 16h — não pode de manhã`
              : `${n} é do turno da ${p?.t} e não está de plantão`);
          }
          
          if (config.regras.categoria.on && !cabeNoSitio(config, pessoaMap, n, s.n, turno))
            add(true, "categoria", turno, s.n, d, `${n} é ${pessoaMap[n]?.c === "enf" ? "enfermeiro" : "técnico"} e este sítio é de ${s.quem === "enf" ? "enfermeiros" : "técnicos"}`);
          
          if (config.regras.proibicoesSitio.on && sitioProibido(config, n, s.n))
            add(true, "proibicoesSitio", turno, s.n, d, `${n} não pode ficar em ${canon(s.n)}`);
          
          if (config.regras.plantaoMesmo.on && ehPlantao(config.disp, n, d) && turno === "tarde") {
            if (ondeEsteve(escala, config, n, d, "manha").map(canon).includes(canon(s.n)))
              add(true, "plantaoMesmo", turno, s.n, d, `${n} está de plantão e já ficou em ${canon(s.n)} de manhã`);
          }
          
          if (config.regras.diasSeguidos.on && !ehPostoFixo(pessoaMap, n, s.n, turno) && d > 0 && celula(escala, turno, s.n, d - 1).includes(n))
            add(true, "diasSeguidos", turno, s.n, d, `${n} já estava em ${canon(s.n)} no dia anterior`);
          
          if (config.regras.sextaSegunda.on && d === 0) {
            const ant = config.sextaAnterior[turno]?.[s.n] || [];
            if (ant.includes(n)) add(true, "sextaSegunda", turno, s.n, d, `${n} estava em ${canon(s.n)} na sexta passada`);
          }
        }
        
        if (config.regras.duplaProibida.on) {
          const dupla = duplaProibidaEm(config, nomes);
          if (dupla) add(true, "duplaProibida", turno, s.n, d, `${dupla[0]} e ${dupla[1]} não podem ficar juntos`);
        }
        
        if (config.regras.cobertura.on && nomes.length === 0 && !s.opcional)
          add(false, "cobertura", turno, s.n, d, "sítio sem ninguém");
      }
    }
  }

  if (config.regras.fixas.on) {
    for (const f of config.fixas) {
      if (!pessoaMap[f.p] || estaFora(config.disp, f.p, f.d)) continue;
      // Fixa para sítio que não está na grade continua sendo violação (não
      // some em silêncio); `carregarConfigUnidade` já avisa e descarta as órfãs.
      if (!celula(escala, f.t, f.s, f.d).includes(f.p))
        add(true, "fixas", f.t, f.s, f.d, `${f.p} tem colocação fixa em ${canon(f.s)} (grupo/atividade)`);
    }
    for (const f of config.fixasNaoAcoes) {
      if (!pessoaMap[f.p] || estaFora(config.disp, f.p, f.d)) continue;
      const sits = ondeEsteve(escala, config, f.p, f.d, f.t);
      if (sits.length === 0) add(true, "fixas", f.t, config.sitios[f.t][4]?.n || "Procedim. de enfermagem", f.d, `${f.p} precisa estar escalada neste turno`);
      else if (sits.includes(config.acoes)) add(true, "fixas", f.t, config.acoes, f.d, `${f.p} não pode ir para Ações neste turno`);
    }
  }

  if (config.regras.acoesSemana.on) {
    for (const p of config.equipe) {
      if (p.isentoAcoes || p.fixo) continue;
      let tem = false, temSemana = false;
      for (let d = 0; d < diasLength; d++) {
        if (!estaFora(config.disp, p.n, d)) temSemana = true;
        for (const t of ["manha", "tarde"] as ("manha" | "tarde")[]) if (celula(escala, t, config.acoes, d).includes(p.n)) tem = true;
      }
      if (temSemana && !tem)
        add(false, "acoesSemana", p.t === "manha" ? "manha" : "tarde", config.acoes, diasLength - 1, `${p.n} não passou por Ações nesta semana`);
    }
  }

  if (config.regras.alternancia16h.on) {
    for (const { n } of pessoas16h(config.equipe)) {
      let ant: string | null = null;
      for (let d = 0; d < diasLength; d++) {
        if (estaFora(config.disp, n, d)) { ant = null; continue; }
        const sits = ondeEsteve(escala, config, n, d, "tarde").filter(s => config.sitiosTec.map(canon).includes(canon(s)));
        const s = sits[0] || null;
        if (s && ant && canon(s) === canon(ant))
          add(false, "alternancia16h", "tarde", s, d, `${n} repetiu ${canon(s)} — precisa alternar`);
        ant = s || ant;
      }
    }
  }

  return v;
}
