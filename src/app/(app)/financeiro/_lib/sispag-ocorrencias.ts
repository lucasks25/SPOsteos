/**
 * Ocorrências do retorno SISPAG (nota 8 do manual "SISPAG — Layout de Arquivos — CNAB v085", out/2020, p. 47-49)
 * e a situação que cada uma dá ao pagamento. Funções puras.
 *
 * Até cinco ocorrências de 2 caracteres por registro (posições 231-240).
 */

/** Tabela completa da nota 8 (v085), mais as marcas internas do sistema no fim. */
export const OCORRENCIAS: Record<string, string> = {
  "00": "Pagamento efetuado",
  AE: "Data de pagamento alterada",
  AG: "Número do lote inválido",
  AH: "Número sequencial do registro no lote inválido",
  AI: "Produto Demonstrativo de Pagamento não contratado",
  AJ: "Tipo de movimento inválido",
  AL: "Código do banco favorecido inválido",
  AM: "Agência do favorecido inválida",
  AN: "Conta corrente do favorecido inválida",
  AO: "Nome do favorecido inválido",
  AP: "Data de pagamento / validade / hora de lançamento / arrecadação / apuração inválida",
  AQ: "Quantidade de registros maior que 999999",
  AR: "Valor arrecadado / lançamento inválido",
  BC: "Nosso número inválido",
  BD: "Pagamento agendado",
  BE: "Pagamento agendado com forma alterada para OP",
  BI: "CNPJ/CPF do favorecido no segmento J-52 ou B inválido / documento do favorecido inválido (Pix)",
  BL: "Valor da parcela inválido",
  CD: "CNPJ/CPF informado divergente do cadastrado",
  CE: "Pagamento cancelado",
  CF: "Valor do documento inválido / valor divergente do QR Code",
  CG: "Valor do abatimento inválido",
  CH: "Valor do desconto inválido",
  CI: "CNPJ/CPF/identificador/inscrição estadual/inscrição no CAD/ICMS inválido",
  CJ: "Valor da multa inválido",
  CK: "Tipo de inscrição inválida",
  CL: "Valor do INSS inválido",
  CM: "Valor do COFINS inválido",
  CN: "Conta não cadastrada",
  CO: "Valor de outras entidades inválido",
  CP: "Confirmação de OP cumprida",
  CQ: "Soma das faturas difere do pagamento",
  CR: "Valor do CSLL inválido",
  CS: "Data de vencimento da fatura inválida",
  DA: "Número de dependentes salário-família inválido",
  DB: "Número de horas semanais inválido",
  DC: "Salário de contribuição INSS inválido",
  DD: "Salário de contribuição FGTS inválido",
  DE: "Valor total dos proventos inválido",
  DF: "Valor total dos descontos inválido",
  DG: "Valor líquido não numérico",
  DH: "Valor líquido informado difere do calculado",
  DI: "Valor do salário-base inválido",
  DJ: "Base de cálculo IRRF inválida",
  DK: "Base de cálculo FGTS inválida",
  DL: "Forma de pagamento incompatível com holerite",
  DM: "E-mail do favorecido inválido",
  DV: "DOC/TED devolvido pelo banco favorecido",
  D0: "Finalidade do holerite inválida",
  D1: "Mês de competência do holerite inválido",
  D2: "Dia da competência do holerite inválido",
  D3: "Centro de custo inválido",
  D4: "Campo numérico da funcional inválido",
  D5: "Data início de férias não numérica",
  D6: "Data início de férias inconsistente",
  D7: "Data fim de férias não numérica",
  D8: "Data fim de férias inconsistente",
  D9: "Número de dependentes IR inválido",
  EM: "Confirmação de OP emitida",
  EX: "Devolução de OP não sacada pelo favorecido",
  E0: "Tipo de movimento holerite inválido",
  E1: "Valor 01 do holerite/informe inválido",
  E2: "Valor 02 do holerite/informe inválido",
  E3: "Valor 03 do holerite/informe inválido",
  E4: "Valor 04 do holerite/informe inválido",
  FC: "Pagamento efetuado através de financiamento COMPROR",
  FD: "Pagamento efetuado através de financiamento DESCOMPROR",
  HA: "Erro no lote",
  HM: "Erro no registro header de arquivo",
  IB: "Valor do documento inválido",
  IC: "Valor do abatimento inválido",
  ID: "Valor do desconto inválido",
  IE: "Valor da mora inválido",
  IF: "Valor da multa inválido",
  IG: "Valor da dedução inválido",
  IH: "Valor do acréscimo inválido",
  II: "Data de vencimento inválida / QR Code expirado",
  IJ: "Competência / período de referência / parcela inválida",
  IK: "Tributo não liquidável via SISPAG ou não conveniado com o Itaú",
  IL: "Código de pagamento / empresa / receita inválido",
  IM: "Tipo x forma não compatível",
  IN: "Banco/agência não cadastrados",
  IO: "DAC/valor/competência/identificador do lacre inválido / identificação do QR Code inválida",
  IP: "DAC do código de barras inválido / erro na validação do QR Code",
  IQ: "Dívida ativa ou número de etiqueta inválido",
  IR: "Pagamento alterado",
  IS: "Concessionária não conveniada com o Itaú",
  IT: "Valor do tributo inválido",
  IU: "Valor da receita bruta acumulada inválido",
  IV: "Número do documento origem / referência inválido",
  IX: "Código do produto inválido",
  LA: "Data de pagamento de um lote alterada",
  LC: "Lote de pagamentos cancelado",
  NA: "Pagamento cancelado por falta de autorização",
  NB: "Identificação do tributo inválida",
  NC: "Exercício (ano base) inválido",
  ND: "Código RENAVAM não encontrado/inválido",
  NE: "UF inválida",
  NF: "Código do município inválido",
  NG: "Placa inválida",
  NH: "Opção/parcela de pagamento inválida",
  NI: "Tributo já foi pago ou está vencido",
  NR: "Operação não realizada",
  PD: "Aquisição confirmada (risco sacado)",
  RJ: "Registro rejeitado",
  RS: "Pagamento disponível para antecipação no risco sacado (pós-autorizado)",
  SS: "Pagamento cancelado por insuficiência de saldo / limite diário de pagamento excedido",
  TA: "Lote não aceito: totais do lote com diferença",
  TI: "Titularidade inválida",
  X1: "Forma incompatível com layout 010",
  X2: "Número da nota fiscal inválido",
  X3: "Identificador de NF/CNPJ inválido",
  X4: "Forma 32 inválida",
  // marcas do sistema (não vêm do banco)
  DUP: "PAGO EM DUPLICIDADE: o título já estava quitado; peça a devolução",
  CAN: "Remessa cancelada no sistema, mas o banco pagou: o dinheiro saiu",
  DIV: "Valor pago diferente do saldo do título: concilie pelo extrato",
  CONC: "Já conciliado: o título foi baixado pelo extrato com o mesmo pagamento antes do retorno (não é duplicidade)",
  DEV: "DEVOLVIDO depois de pago: o banco do favorecido devolveu o DOC/TED/OP. Estorne a baixa e confira o extrato",
};

/** Devolução depois do envio (nota 8, obs. A): o dinheiro voltou; prevalece sobre "00". */
const DEVOLUCAO = new Set(["DV", "EX"]);

/**
 * Aceitos pelo banco sem confirmação de débito na conta: o título continua travado na remessa e nada é baixado.
 * BD/BE/AE/IR/LA: agendamento e alterações. EM/CP: ordem de pagamento emitida/cumprida (só com OP contratada).
 * FC/FD: pago por financiamento COMPROR/DESCOMPROR (não sai da conta corrente). PD/RS: risco sacado.
 * Os quatro últimos grupos exigem produto contratado; se aparecerem, a baixa é manual (ver docs/REVISAO.md).
 */
const SEM_BAIXA = new Set(["BD", "BE", "AE", "IR", "LA", "EM", "CP", "FC", "FD", "PD", "RS"]);

export const foiDevolvido = (ocorrencias: string[]) => ocorrencias.some((c) => DEVOLUCAO.has(c));

/** Situação a partir das ocorrências (nota 8). Sem ocorrência nenhuma fica AGENDADO: o título não é liberado para outra remessa. */
export function situacaoRetorno(ocorrencias: string[]): "PAGO" | "AGENDADO" | "REJEITADO" {
  if (foiDevolvido(ocorrencias)) return "REJEITADO";
  if (ocorrencias.includes("00")) return "PAGO";
  if (ocorrencias.every((c) => SEM_BAIXA.has(c))) return "AGENDADO";
  return "REJEITADO";
}

export const descreverOcorrencias = (codigos: string[]) => codigos.map((c) => `${c} — ${OCORRENCIAS[c] ?? "código não previsto na nota 8 do manual SISPAG v085"}`).join("; ");
