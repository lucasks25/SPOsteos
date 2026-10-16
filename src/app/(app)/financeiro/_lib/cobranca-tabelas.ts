/**
 * Tabelas de códigos do manual Itaú "Cobrança Bancária — Layout de Arquivos CNAB 400" (jan/2017).
 * Separadas de cobranca.ts só para manter os arquivos curtos. Dados puros.
 */

/** Nota 17 — código de ocorrência do arquivo retorno (posições 109-110). */
export const OCORRENCIAS_RETORNO: Record<string, string> = {
  "02": "Entrada confirmada",
  "03": "Entrada rejeitada",
  "04": "Alteração de dados acatada",
  "05": "Alteração de dados - baixa",
  "06": "Liquidação normal",
  "07": "Liquidação parcial (cobrança inteligente B2B)",
  "08": "Liquidação em cartório",
  "09": "Baixa simples",
  "10": "Baixa por ter sido liquidado",
  "11": "Em ser (só no retorno mensal)",
  "12": "Abatimento concedido",
  "13": "Abatimento cancelado",
  "14": "Vencimento alterado",
  "15": "Baixa rejeitada",
  "16": "Instrução rejeitada",
  "17": "Alteração/exclusão de dados rejeitada",
  "18": "Cobrança contratual - instrução/alteração rejeitada ou pendente",
  "19": "Confirma recebimento de instrução de protesto",
  "20": "Confirma recebimento de instrução de sustação de protesto / tarifa",
  "21": "Confirma recebimento de instrução de não protestar",
  "23": "Título enviado a cartório / tarifa",
  "24": "Instrução de protesto rejeitada / sustada / pendente",
  "25": "Alegação do pagador",
  "26": "Tarifa de aviso de cobrança",
  "27": "Tarifa de extrato posição",
  "28": "Tarifa de relação das liquidações",
  "29": "Tarifa de manutenção de títulos vencidos",
  "30": "Débito mensal de tarifas (entradas e baixas)",
  "32": "Baixa por ter sido protestado",
  "33": "Custas de protesto",
  "34": "Custas de sustação",
  "35": "Custas de cartório distribuidor",
  "36": "Custas de edital",
  "37": "Tarifa de emissão de boleto / envio de duplicata",
  "38": "Tarifa de instrução",
  "39": "Tarifa de ocorrências",
  "40": "Tarifa mensal de emissão de boleto / envio de duplicata",
  "41": "Débito mensal de tarifas - extrato de posição",
  "42": "Débito mensal de tarifas - outras instruções",
  "43": "Débito mensal de tarifas - manutenção de títulos vencidos",
  "44": "Débito mensal de tarifas - outras ocorrências",
  "45": "Débito mensal de tarifas - protesto",
  "46": "Débito mensal de tarifas - sustação de protesto",
  "47": "Baixa com transferência para desconto",
  "48": "Custas de sustação judicial",
  "51": "Tarifa mensal ref. a entradas em bancos correspondentes",
  "52": "Tarifa mensal de baixas na carteira",
  "53": "Tarifa mensal de baixas em bancos correspondentes",
  "54": "Tarifa mensal de liquidações na carteira",
  "55": "Tarifa mensal de liquidações em bancos correspondentes",
  "56": "Custas de irregularidade",
  "57": "Instrução cancelada",
  "59": "Baixa por crédito em c/c através do SISPAG",
  "60": "Entrada rejeitada (carnê)",
  "61": "Tarifa de emissão de aviso de movimentação de títulos",
  "62": "Débito mensal de tarifa - aviso de movimentação de títulos",
  "63": "Título sustado judicialmente",
  "64": "Entrada confirmada com rateio de crédito",
  "65": "Pagamento com cheque - aguardando compensação",
  "69": "Cheque devolvido",
  "71": "Entrada registrada, aguardando avaliação",
  "72": "Baixa por crédito em c/c através do SISPAG sem título correspondente",
  "73": "Entrada confirmada na cobrança simples - não aceita na contratual",
  "74": "Instrução de negativação expressa rejeitada",
  "75": "Confirma recebimento de instrução de negativação expressa",
  "76": "Cheque compensado",
  "77": "Confirma recebimento de exclusão de negativação expressa",
  "78": "Confirma recebimento de cancelamento de negativação expressa",
  "79": "Negativação expressa informacional",
  "80": "Confirmação de entrada em negativação expressa - tarifa",
  "82": "Confirmação do cancelamento de negativação expressa - tarifa",
  "83": "Exclusão de negativação expressa por liquidação - tarifa",
  "85": "Tarifa por boleto - cobrança ativa eletrônica",
  "86": "Tarifa e-mail - cobrança ativa eletrônica",
  "87": "Tarifa SMS - cobrança ativa eletrônica",
  "88": "Tarifa mensal por boleto - cobrança ativa eletrônica",
  "89": "Tarifa mensal e-mail - cobrança ativa eletrônica",
  "90": "Tarifa mensal SMS - cobrança ativa eletrônica",
  "91": "Tarifa mensal de exclusão de negativação expressa",
  "92": "Tarifa mensal de cancelamento de negativação expressa",
  "93": "Tarifa mensal de exclusão de negativação expressa por liquidação",
};

/** Nota 20, tabela 1 — entrada rejeitada (ocorrência 03 e 60). */
const TAB1: Record<string, string> = {
  "03": "CEP sem atendimento de protesto no momento", "04": "Sigla do estado inválida",
  "05": "Prazo da operação menor que o mínimo ou maior que o máximo", "07": "Valor do título maior que 10.000.000,00",
  "08": "Nome do pagador não informado ou deslocado", "09": "Agência encerrada", "10": "Logradouro não informado ou deslocado",
  "11": "CEP não numérico ou inválido", "12": "Sacador/avalista: nome não informado ou deslocado",
  "13": "CEP incompatível com a sigla do estado", "14": "Nosso número já registrado ou fora da faixa",
  "15": "Nosso número em duplicidade no mesmo movimento", "18": "Data de entrada inválida para esta carteira",
  "19": "Ocorrência inválida", "21": "Agência cobradora inválida / não aceita correspondente",
  "22": "Carteira não permitida (necessário cadastrar faixa livre)", "26": "Agência/conta não liberada para cobrança",
  "27": "CNPJ do beneficiário inapto / devolução de título em garantia", "29": "Categoria da conta inválida",
  "30": "Entradas bloqueadas, conta suspensa em cobrança", "31": "Conta sem permissão para protestar",
  "35": "IOF maior que 5%", "36": "Quantidade de moeda incompatível com valor do título",
  "37": "CNPJ/CPF do pagador não numérico ou igual a zeros", "42": "Nosso número fora de faixa",
  "52": "Empresa não aceita banco correspondente", "53": "Empresa não aceita banco correspondente - cobrança mensagem",
  "54": "Banco correspondente - vencimento inferior a 15 dias", "55": "CEP não pertence à depositária informada",
  "56": "Vencimento superior a 180 dias da entrada (banco correspondente)", "57": "CEP só depositária BB com vencimento inferior a 8 dias",
  "60": "Valor do abatimento inválido", "61": "Juros de mora maior que o permitido", "62": "Valor do desconto maior que o valor do título",
  "63": "Importância por dia de desconto não permitida", "64": "Data de emissão do título inválida", "65": "Taxa inválida (vendor)",
  "66": "Data de vencimento inválida / fora do prazo de operação", "67": "Valor do título / quantidade de moeda inválido",
  "68": "Carteira inválida ou não cadastrada no intercâmbio", "69": "Carteira inválida para rateio de crédito",
  "70": "Beneficiário não cadastrado para rateio", "78": "Duplicidade de agência/conta do rateio",
  "80": "Contas do rateio acima do máximo (30)", "81": "Conta do rateio inválida", "82": "Desconto/abatimento não permitido com rateio",
  "83": "Valor do título menor que a soma do rateio", "84": "Conta do rateio é a centralizadora do beneficiário",
  "85": "Conta contratual: rateio não permitido", "86": "Tipo de valor inválido para rateio", "87": "Registro tipo 4 sem contas do rateio",
  "90": "Cobrança mensagem: número da linha inválido", "97": "Cobrança mensagem sem mensagem", "98": "Flash inválido", "99": "Flash inválido",
};

/** Tabela 2 — alteração de dados rejeitada (ocorrência 17). */
const TAB2: Record<string, string> = {
  "02": "Agência cobradora inválida ou com o mesmo conteúdo", "04": "Sigla do estado inválida",
  "05": "Data de vencimento inválida ou com o mesmo conteúdo", "06": "Valor do título com outra alteração simultânea",
  "08": "Nome do pagador com o mesmo conteúdo", "09": "Agência/conta incorreta", "11": "CEP inválido",
  "12": "Inscrição do sacador avalista inválida", "13": "Seu número com o mesmo conteúdo",
  "16": "Abatimento/alteração de valor/baixa bloqueada", "20": "Espécie inválida", "21": "Agência cobradora não cadastrada",
  "23": "Data de emissão inválida ou com o mesmo conteúdo", "41": "Aceite inválido ou com o mesmo conteúdo",
  "42": "Alteração inválida para título vencido", "43": "Alteração bloqueada - vencimento já alterado",
  "53": "Instrução com o mesmo conteúdo", "54": "Vencimento inferior ao aceito (banco correspondente)",
  "55": "Alterações iguais para o mesmo controle", "56": "CNPJ/CPF inválido", "57": "Prazo de vencimento inferior a 15 dias",
  "60": "IOF: alteração não permitida", "61": "Título já baixado ou liquidado ou inexistente",
  "66": "Alteração não permitida (notas de seguro)", "67": "Nome do sacador avalista inválido", "72": "Endereço do sacador avalista inválido",
  "73": "Bairro do sacador avalista inválido", "74": "Cidade do sacador avalista inválida", "75": "UF do sacador avalista inválida",
  "76": "CEP do sacador avalista inválido", "81": "Alteração bloqueada - negativação/protesto", "87": "Alteração bloqueada - rateio de crédito",
};

/** Tabela 3 — instrução rejeitada (ocorrência 16). */
const TAB3: Record<string, string> = {
  "01": "Instrução/ocorrência não existente", "03": "Conta sem permissão para protestar", "06": "Nosso número igual a zeros",
  "09": "CNPJ/CPF do sacador/avalista inválido", "10": "Abatimento igual ou maior que o valor do título",
  "11": "Segunda instrução não existente", "14": "Registro em duplicidade", "15": "CNPJ/CPF sem nome do sacador/avalista",
  "19": "Abatimento maior que 90% do valor do título", "20": "Sustação de protesto pendente", "21": "Título não registrado no sistema",
  "22": "Título baixado ou liquidado", "23": "Instrução não aceita", "24": "Existe instrução de protesto para o título",
  "25": "Não existe instrução de protesto para o título", "26": "Ordem de protesto já emitida ao cartório",
  "27": "Ordem de protesto não emitida ao cartório", "28": "Mesma instrução já cadastrada",
  "29": "Valor líquido + abatimento diferente do valor do título", "30": "Existe instrução de não protestar ativa",
  "31": "Ocorrência do pagador bloqueia a instrução", "32": "Depositária 9999 ou carteira não aceita protesto",
  "33": "Vencimento igual ao registrado ou que torna o título vencido", "34": "Aviso de cobrança para título vencido",
  "35": "Cancelamento de instrução inexistente", "36": "Título sofrendo alteração de controle", "37": "Instrução não permitida para a carteira",
  "38": "Instrução não permitida com rateio de crédito", "40": "Não existe negativação expressa para o título",
  "41": "Título com entrada em negativação expressa", "42": "Título com negativação expressa concluída",
  "43": "Prazo inválido para negativação expressa", "45": "Instrução incompatível para o mesmo título nesta data",
  "47": "Instrução não permitida - espécie inválida", "48": "Dados do pagador inválidos", "49": "Endereço do pagador inválido",
  "50": "Data de emissão inválida", "51": "Título com negativação expressa agendada",
};

/** Tabela 4 — baixa rejeitada (ocorrência 15). */
const TAB4: Record<string, string> = {
  "01": "Carteira/número não numérico", "04": "Nosso número em duplicidade no mesmo movimento",
  "05": "Baixa para título já baixado ou liquidado", "06": "Baixa para título não registrado",
  "07": "Cobrança prazo curto - título não registrado", "08": "Baixa para título em floating",
  "10": "Título faz parte de garantia de empréstimo", "11": "Pago via SISPAG por crédito em c/c e não baixado",
};

/** Tabela 5 — cobrança contratual (ocorrência 18). */
const TAB5: Record<string, string> = {
  "16": "Abatimento/alteração de valor/baixa bloqueados", "40": "Não aprovada (elegibilidade de garantias)",
  "41": "Automaticamente rejeitada", "42": "Instrução recebida - pendente de análise",
};

/** Tabela 9 — motivo de devolução do cheque usado no pagamento (ocorrência 69, posições 378-379). */
const TAB9: Record<string, string> = {
  "11": "Sem fundos - 1ª apresentação (reapresentável)", "12": "Sem fundos - 2ª apresentação", "13": "Conta encerrada", "14": "Prática espúria",
  "20": "Folha cancelada pelo correntista", "21": "Contra-ordem ou oposição (reapresentável)", "22": "Divergência ou insuficiência de assinatura (reapresentável)",
  "23": "Órgão público sem requisitos do DL 200 (reapresentável)", "24": "Bloqueio judicial ou do Bacen (reapresentável)", "25": "Talonário cancelado pelo banco",
  "28": "Contra-ordem por furto ou roubo", "29": "Talonário sem confirmação de recebimento (reapresentável)", "30": "Furto ou roubo de malotes",
  "31": "Erro formal (reapresentável)", "32": "Carimbo de compensação (reapresentável)", "33": "Divergência de endosso (reapresentável)",
  "34": "Apresentado por banco fora do cruzamento (reapresentável)", "35": "Cheque fraudado ou praça adulterada", "36": "Mais de um endosso (reapresentável)",
  "40": "Moeda inválida", "41": "Apresentado a banco que não o pagador (reapresentável)", "42": "Não compensável na sessão (reapresentável)",
  "43": "Reapresentado com o mesmo motivo", "44": "Cheque prescrito", "45": "Entidade obrigada a ordem bancária",
  "48": "Valor acima do limite sem identificação do beneficiário (reapresentável)", "49": "Remessa nula",
};

/** Tabela 10 — mensagem informativa na entrada confirmada (ocorrência 02). */
const TAB10: Record<string, string> = {
  "01": "CEP sem atendimento de protesto no momento",
  "02": "Estado impede negativação no prazo solicitado - prazo superior",
  "03": "Boleto não liquidado no desconto e transferido para cobrança simples",
};

/** Tabela 8 — instrução cancelada (ocorrência 57, posições 302-305). */
export const INSTRUCOES_CANCELADAS: Record<string, string> = { "1156": "Não protestar", "2261": "Dispensar juros/comissão de permanência" };

/** Tabela de motivos (posições 378-385) por ocorrência. */
export const MOTIVOS_POR_OCORRENCIA: Record<string, { tabela: string; codigos: Record<string, string> }> = {
  "02": { tabela: "10", codigos: TAB10 },
  "03": { tabela: "1", codigos: TAB1 },
  "60": { tabela: "1", codigos: TAB1 },
  "15": { tabela: "4", codigos: TAB4 },
  "16": { tabela: "3", codigos: TAB3 },
  "17": { tabela: "2", codigos: TAB2 },
  "18": { tabela: "5", codigos: TAB5 },
  "69": { tabela: "9", codigos: TAB9 },
};

/** Nota 28 — código de liquidação (posições 393-394). */
export const CODIGOS_LIQUIDACAO: Record<string, string> = {
  AA: "Caixa eletrônico Itaú", AC: "Pagamento em cartório automatizado", AO: "Acerto online", BC: "Bancos correspondentes",
  BF: "Itaú Bankfone", BL: "Itaú Bankline", B0: "Outros bancos - recebimento off-line", B1: "Outros bancos - código de barras",
  B2: "Outros bancos - linha digitável", B3: "Outros bancos - autoatendimento", B4: "Outros bancos - casa lotérica",
  B5: "Outros bancos - correspondente", B6: "Outros bancos - telefone", B7: "Outros bancos - arquivo eletrônico",
  CC: "Agência Itaú - cheque", CI: "Correspondente Itaú", CK: "SISPAG", CP: "Agência Itaú - débito em conta/dinheiro",
  DG: "Agência Itaú - off-line", LC: "Cartório de protesto com cheque", EA: "Terminal de caixa",
  Q0: "Pagamento agendado", RA: "Realimentação automática", ST: "Pagamento via SELTEC",
};

/** Nota 10 — espécie do título. */
export const ESPECIES: Record<string, string> = {
  "01": "Duplicata mercantil", "02": "Nota promissória", "03": "Nota de seguro", "04": "Mensalidade escolar", "05": "Recibo",
  "06": "Contrato", "07": "Cosseguros", "08": "Duplicata de serviço", "09": "Letra de câmbio", "13": "Nota de débitos",
  "15": "Documento de dívida", "16": "Encargos condominiais", "17": "Conta de prestação de serviços", "99": "Diversos",
};

export const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
