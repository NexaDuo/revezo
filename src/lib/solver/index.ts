export * from "./types";
export * from "./utils";
export * from "./validator";
export * from "./solver";

import { Config, ScheduleResult } from "./types";
import { validar } from "./validator";
import { resolver } from "./solver";

export function generateSchedule(config: Config): ScheduleResult {
  const result = resolver(config);
  const violacoes = validar(config, result.escala);
  return {
    escala: result.escala,
    violacoes,
    score: result.score
  };
}
