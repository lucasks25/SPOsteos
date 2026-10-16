/**
 * Regras de conteúdo de cada segmento do SISPAG (as que dependem de outro campo, da forma do lote ou de
 * outro registro). Fonte: notas do manual SISPAG v085. Usado por cnab-validador.ts.
 */
import { type Achado, type Coletor, type Modo, fatia, mostrar, novoAchado, vazio } from "./cnab-validador-campos";
import { SEGMENTO_A, SEGMENTO_B, SEGMENTO_B_PIX, SEGMENTO_J, SEGMENTO_J52, SEGMENTO_J52_PIX } from "./cnab-layout-sispag";
import { conferirChavePix, conferirInscricao, cnpjValido, cpfValido, dataParaUTC, dataValida, datasDoFator, dvCodigoBarras, MOVIMENTOS_INCLUSAO } from "./cnab-validador-regras";

export type Reg = { linha: number; t: string };
/** Um pagamento: registro principal (A ou J) e seus complementos (B, C, J-52, Z). */
export type Pagamento = { forma: string; principal: Reg & { seg: "A" | "J" }; b?: Reg; j52?: Reg; complementos: string[] };

const NOTA = (ref: string, nome: string, ini: number, fim: number, ocorr?: string) => ({ ini, fim, nome, ref, ocorr });

function dataNaoAnterior(t: string, linha: number, reg: string, ini: number, nome: string, dataGeracao: string | null, add: Coletor) {
  const v = fatia(t, ini, ini + 7);
  if (!dataGeracao || !dataValida(v) || !dataValida(dataGeracao)) return;
  if (dataParaUTC(v) < dataParaUTC(dataGeracao)) {
    add(novoAchado("aviso", linha, reg, NOTA("p. 15 / p. 26", nome, ini, ini + 7, "AP"), `data ≥ data de geração do arquivo (${dataGeracao})`, mostrar(v)));
  }
}

/** Segmento A: câmara, conta do favorecido (nota 11), Pix (notas 35/36), nosso número (nota 12), valor. */
export function regrasA(r: Reg, forma: string, modo: Modo, dataGeracao: string | null, add: Coletor) {
  const { t, linha } = r;
  const L = SEGMENTO_A;
  const mov = fatia(t, 15, 17);
  const inclusao = MOVIMENTOS_INCLUSAO.has(mov);
  const camara = fatia(t, 18, 20);
  const banco = fatia(t, 21, 23);
  const conta = fatia(t, 24, 43);
  const ident = fatia(t, 113, 114);
  const err = (ini: number, fim: number, nome: string, ref: string, esperado: string, ocorr?: string, sev: "erro" | "aviso" = "erro") =>
    add(novoAchado(sev, linha, L, NOTA(ref, nome, ini, fim, ocorr), esperado, mostrar(fatia(t, ini, fim))));

  if (forma === "45" && camara !== "009") err(18, 20, "CÂMARA CENTRALIZADORA", "nota 35", '"009" (Pix - SPI) na forma 45');
  if (forma !== "45" && camara === "009") err(18, 20, "CÂMARA CENTRALIZADORA", "nota 35", "009 só na forma 45 (Pix)");
  if (camara === "888" && !/^\d{8}$/.test(fatia(t, 105, 112))) err(105, 112, "CÓDIGO ISPB", "nota 35", "ISPB de 8 dígitos (TED para corretora, câmara 888)");

  if (forma === "45") {
    if (!["01", "PG", "03", "04"].includes(ident)) err(113, 114, "IDENTIFICAÇÃO TRANSFERÊNCIA", "nota 36", "01, PG, 03 ou 04 na forma Pix");
    if (ident !== "04" && /^ *$/.test(conta)) err(24, 43, "AGÊNCIA CONTA FAVORECIDO", "nota 11 (Pix por conta)", "agência e conta obrigatórias quando 113-114 = 01/PG/03", "AN");
  } else if (!/^ {2}$/.test(ident)) {
    err(113, 114, "IDENTIFICAÇÃO TRANSFERÊNCIA", "nota 36", "brancos fora do Pix", undefined, "aviso");
  }

  if (["01", "05", "02", "10", "06", "60"].includes(forma)) {
    if (banco !== "341" && banco !== "409") err(21, 23, "BANCO FAVORECIDO", "nota 11 a", "341 (ou 409) em crédito no Itaú", "AL");
    // nota 11 a: 024 zero | 025-028 agência | 029 branco | 030-035 zeros | 036-041 conta | 042 branco | 043 DAC
    if (!/^0\d{4} 0{6}\d{6} \d$/.test(conta)) err(24, 43, "AGÊNCIA CONTA FAVORECIDO", "nota 11 a", '"0" + agência 9(4) + branco + "000000" + conta 9(6) + branco + DAC 9(1)', "AN");
  } else if (["03", "07", "41", "43"].includes(forma)) {
    if (banco === "341" || banco === "409") err(21, 23, "BANCO FAVORECIDO", "nota 11 b", "banco diferente de 341/409 em DOC/TED (para o Itaú use a forma 01)", "AL");
    if (/^0{3}$/.test(banco)) err(21, 23, "BANCO FAVORECIDO", "p. 15", "código de compensação do banco favorecido", "AL");
    const contaPagamento = /^\d{20}$/.test(conta);
    if (!contaPagamento && !/^\d{5} \d{12}[ 0-9A-Z][0-9A-Z]$/.test(conta)) {
      err(24, 43, "AGÊNCIA CONTA FAVORECIDO", "nota 11 b", "agência 9(5) + branco + conta 9(12) + DAC X(2) (1º dígito na 042 ou branco), ou conta pagamento 9(20)", "AN");
    }
  }

  const nosso = fatia(t, 135, 149);
  if (modo === "remessa" && inclusao && !/^ +$/.test(nosso)) err(135, 149, "NOSSO NÚMERO", "nota 12", "brancos na inclusão", "BC");
  if (modo === "remessa" && !inclusao && /^ +$/.test(nosso) && ["517", "519", "999"].includes(mov)) err(135, 149, "NOSSO NÚMERO", "nota 10 (3) / nota 12", "nosso número do pagamento a alterar/excluir", "BC");
  if (inclusao && /^0+$/.test(fatia(t, 120, 134))) err(120, 134, "VALOR DO PAGTO", "p. 15", "valor maior que zero", "AR");
  if (modo === "remessa") dataNaoAnterior(t, linha, L.nome, 94, "DATA DE PAGTO", dataGeracao, add);
  if (["41", "43"].includes(forma) && /^ +$/.test(fatia(t, 220, 224))) err(220, 224, "FINALIDADE TED", "nota 26", "código de finalidade (em branco o banco assume 00010)", undefined, "aviso");
}

/** Segmento B (comum ou Pix). */
export function regrasB(r: Reg, forma: string, add: Coletor) {
  const { t, linha } = r;
  const pix = forma === "45";
  const L = pix ? SEGMENTO_B_PIX : SEGMENTO_B;
  const tipo = fatia(t, 18, 18);
  const num = fatia(t, 19, 32);
  if (!/^0+$/.test(num) || pix) {
    const p = conferirInscricao(tipo, num);
    if (p) add(novoAchado("erro", linha, L, NOTA("nota 15", "Nº DE INSCRIÇÃO DO FAVORECIDO", 18, 32, "BI"), "tipo 1/2 coerente com CPF/CNPJ de DV válido", `${mostrar(tipo + num)} (${p})`));
  }
  if (pix) {
    const tipoChave = fatia(t, 15, 16);
    const chave = fatia(t, 128, 227).trimEnd();
    if (tipoChave.trim() || chave) {
      const p = conferirChavePix(tipoChave, chave);
      if (p) add(novoAchado("erro", linha, L, NOTA("nota 40", "CHAVE PIX", 128, 227), `chave no formato do tipo ${tipoChave}`, `${mostrar(chave)} (${p})`));
      if (/^ /.test(fatia(t, 128, 227)) && chave) add(novoAchado("erro", linha, L, NOTA("item 2.2.1", "CHAVE PIX", 128, 227), "alinhada à esquerda", mostrar(chave)));
    }
  }
}

/** Segmento J: código de barras (Anexo A), forma × banco, fator × vencimento, valores. */
export function regrasJ(r: Reg, forma: string, modo: Modo, dataGeracao: string | null, add: Coletor) {
  const { t, linha } = r;
  const L = SEGMENTO_J;
  const barras = fatia(t, 18, 61);
  const mov = fatia(t, 15, 17);
  const err = (ini: number, fim: number, nome: string, ref: string, esperado: string, ocorr?: string, sev: "erro" | "aviso" = "erro", encontrado = mostrar(fatia(t, ini, fim))) =>
    add(novoAchado(sev, linha, L, NOTA(ref, nome, ini, fim, ocorr), esperado, encontrado));

  if (forma === "47") {
    if (!/^0{44}$/.test(barras)) err(18, 61, "CÓDIGO DE BARRAS", "nota 18", "zeros no Pix QR Code");
  } else if (/^8/.test(barras)) {
    err(18, 61, "CÓDIGO DE BARRAS", "Anexo B / nota 18", "boleto de cobrança (iniciado em 8 é concessionária/tributo: segmento O, forma 13/91)", "IM");
  } else if (/^\d{44}$/.test(barras)) {
    if (fatia(t, 21, 21) !== "9") err(21, 21, "CÓD. BARRAS – MOEDA", "Anexo A", '"9" (real)', "IP");
    const dv = dvCodigoBarras(barras);
    if (String(dv) !== fatia(t, 22, 22)) err(22, 22, "CÓD. BARRAS – DV", "Anexo A item 3 (módulo 11)", `DV ${dv} calculado sobre as posições 018-061 sem a 022`, "IP");
    const bancoBarras = fatia(t, 18, 20);
    if (forma === "30" && bancoBarras !== "341") err(18, 20, "CÓD. BARRAS – BANCO FAVORECIDO", "nota 5", "341 na forma 30 (boleto Itaú)", "IM");
    if (forma === "31" && bancoBarras === "341") err(18, 20, "CÓD. BARRAS – BANCO FAVORECIDO", "nota 5", "banco diferente de 341 na forma 31 (use a 30)", "IM");
    const fator = Number(fatia(t, 23, 26));
    const venc = fatia(t, 92, 99);
    if (fator >= 1000 && dataValida(venc) && !datasDoFator(fator).includes(dataParaUTC(venc))) {
      err(23, 26, "CÓD. BARRAS – FATOR DE VENCIMENTO", "Anexo A (b)", `fator coerente com a data de vencimento ${venc} (o Itaú usa o fator)`, "II", "aviso");
    }
    const valorBarras = Number(fatia(t, 27, 36));
    if (fator >= 1000 && valorBarras > 0 && valorBarras !== Number(fatia(t, 100, 114))) err(100, 114, "VALOR DO TÍTULO (NOMINAL)", "Anexo A", `igual ao valor do código de barras (${valorBarras})`, "IB", "aviso");
  }
  const inclusao = MOVIMENTOS_INCLUSAO.has(mov);
  if (inclusao && /^0+$/.test(fatia(t, 153, 167))) err(153, 167, "VALOR PAGAMENTO", "p. 26", "valor maior que zero", "AR");
  const titulo = Number(fatia(t, 100, 114)), desc = Number(fatia(t, 115, 129)), acr = Number(fatia(t, 130, 144)), pago = Number(fatia(t, 153, 167));
  if (inclusao && titulo > 0 && pago !== titulo - desc + acr) err(153, 167, "VALOR PAGAMENTO", "p. 26", `título − descontos + acréscimos = ${titulo - desc + acr}`, "CF", "aviso");
  if (modo === "remessa" && inclusao && !/^ +$/.test(fatia(t, 216, 230))) err(216, 230, "NOSSO NÚMERO", "nota 12", "brancos na inclusão", "BC");
  if (modo === "remessa") dataNaoAnterior(t, linha, L.nome, 145, "DATA PAGAMENTO", dataGeracao, add);
}

/** J-52: tipo × número de sacado e cedente (p. 27: inconsistência rejeita com BI). */
export function regrasJ52(r: Reg, forma: string, add: Coletor) {
  const { t, linha } = r;
  const L = forma === "47" ? SEGMENTO_J52_PIX : SEGMENTO_J52;
  const conferir = (iniTipo: number, ini: number, fim: number, nome: string, opcional: boolean) => {
    const tipo = fatia(t, iniTipo, iniTipo);
    const num = fatia(t, ini, fim);
    if (opcional && /^0+$/.test(num)) return;
    const p = conferirInscricao(tipo, num);
    if (p) add(novoAchado("erro", linha, L, NOTA("p. 27", nome, iniTipo, fim, "BI"), "tipo 1/2 coerente com CPF/CNPJ de DV válido", `${mostrar(tipo + num)} (${p})`));
  };
  conferir(20, 21, 35, "SACADO (pagador)", true);
  conferir(76, 77, 91, "CEDENTE (beneficiário)", false);
  if (forma !== "47" && fatia(t, 132, 132) !== "0") conferir(132, 133, 147, "SACADOR AVALISTA", true);
}

/** Regras entre registros de um mesmo pagamento (fechadas quando começa o próximo ou no trailer). */
export function fecharPagamento(p: Pagamento, add: Coletor) {
  const { t, linha } = p.principal;
  if (p.principal.seg === "J") {
    if (["30", "31", "47"].includes(p.forma) && !p.j52) {
      add(novoAchado("erro", linha, SEGMENTO_J, NOTA("p. 27", "SEGMENTO J-52", 14, 19, "BI"), "segmento J-52 logo após o J (obrigatório nas formas 30/31)", "ausente"));
    }
    return;
  }
  const aviso = fatia(t, 230, 230);
  if (["3", "5", "9"].includes(aviso) && !p.b) add(novoAchado("erro", linha, SEGMENTO_A, NOTA("nota 16", "AVISO AO FAVORECIDO", 230, 230), "segmento B quando o aviso é 3, 5 ou 9", "sem segmento B"));
  if (p.forma === "45" && fatia(t, 113, 114) === "04") {
    if (!p.b) add(novoAchado("erro", linha, SEGMENTO_A, NOTA("item 2.2 / nota 37", "SEGMENTO B (Pix)", 113, 114), "segmento B com a chave Pix (obrigatório no modelo chave)", "ausente"));
    else if (!/^0[1-4]$/.test(fatia(p.b.t, 15, 16))) add(novoAchado("erro", p.b.linha, SEGMENTO_B_PIX, NOTA("nota 37", "TIPO CHAVE PIX", 15, 16), "01, 02, 03 ou 04 (obrigatório quando A 113-114 = 04)", mostrar(fatia(p.b.t, 15, 16))));
  }
  // nota 15: CPF/CNPJ obrigatório em DOC, TED, Pix e OP; pode estar no A ou no B.
  const numA = fatia(t, 204, 217);
  const docB = p.b ? fatia(p.b.t, 18, 32) : null;
  const okA = !/^0+$/.test(numA) && (cnpjValido(numA) || (/^000/.test(numA) && cpfValido(numA.slice(3))));
  const okB = docB !== null && !/^.0+$/.test(docB) && conferirInscricao(docB[0], docB.slice(1)) === null;
  if (["03", "07", "10", "41", "43", "45"].includes(p.forma) && !okA && !okB) {
    add(novoAchado("erro", linha, SEGMENTO_A, NOTA("nota 15", "Nº DE INSCRIÇÃO DO FAVORECIDO", 204, 217, "BI"), "CPF/CNPJ do favorecido válido (no A ou no B)", mostrar(numA)));
  } else if (!/^0+$/.test(numA) && !okA && !vazio(numA)) {
    add(novoAchado(okB ? "aviso" : "erro", linha, SEGMENTO_A, NOTA("nota 15", "Nº DE INSCRIÇÃO DO FAVORECIDO", 204, 217, "BI"), "CPF/CNPJ de DV válido", mostrar(numA)));
  }
  if (/^00000/.test(numA) && !p.b && cnpjValido(numA) && !cpfValido(numA.slice(3))) {
    add(novoAchado("erro", linha, SEGMENTO_A, NOTA("nota 15 (obs.)", "Nº DE INSCRIÇÃO DO FAVORECIDO", 204, 217, "BI"), "segmento B para CNPJ iniciado por 00000 (senão o banco lê como CPF)", "sem segmento B"));
  }
  if (docB && !/^.0+$/.test(docB) && !/^0+$/.test(numA) && docB.slice(1) !== numA) {
    add(novoAchado("aviso", p.b!.linha, SEGMENTO_B, NOTA("nota 15", "Nº DE INSCRIÇÃO DO FAVORECIDO", 19, 32), `igual ao do segmento A (${numA}); se divergirem vale o do B`, mostrar(docB.slice(1))));
  }
}

export type { Achado };
