import "server-only";

/** API pública do módulo comercial: o que outros módulos podem chamar (regras e escrita ficam aqui). */
export { registrarConsumoCirurgiaTx, type ItemConsumo } from "./consumo-servico";
export { registrarNfTx } from "./nf"; // fiscal: NF-e autorizada fatura o pedido (número da NF + conta a receber), docs/NFE.md
export { travarCirurgia } from "./trava-cirurgia"; // quem movimenta estoque de cirurgia trava a cirurgia antes do saldo

// Leituras para o painel e o sino (só leitura, ARQ-05).
export { contarCirurgiasSemAutorizacao } from "./autorizacao-servico";
export { contarAFaturar, contarPedidosSemNf, indicadoresComerciais, proximasCirurgias, type IndicadoresComerciais } from "./leitura-painel";
