import "server-only";

/** API pública do módulo comercial: o que outros módulos podem chamar (regras e escrita ficam aqui). */
export { registrarConsumoCirurgiaTx, type ItemConsumo } from "./consumo-servico";

// Leituras para o painel e o sino (só leitura, ARQ-05).
export { contarCirurgiasSemAutorizacao } from "./autorizacao-servico";
export { contarAFaturar, indicadoresComerciais, proximasCirurgias, type IndicadoresComerciais } from "./leitura-painel";
