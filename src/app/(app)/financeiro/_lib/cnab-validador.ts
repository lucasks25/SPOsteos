/**
 * Validador INDEPENDENTE de arquivos SISPAG Itaú CNAB 240 (remessa e retorno).
 * Simula o que o "Validador de Layout de Arquivos" do Itaú Empresas cobra (Transmissão de arquivos > Validação),
 * a partir das tabelas do manual "SISPAG — Layout de Arquivos — CNAB Versão 085" (out/2020), transcritas em
 * cnab-layout-sispag.ts. Não usa nada de sispag.ts: serve para pegar erro do gerador.
 *
 * Confere: 240 bytes por linha, CRLF, caracteres (ASCII imprimível), picture 9/X, conteúdo fixo, domínios,
 * datas/horas, sequência header → lotes → trailer, numeração de lote (nota 3) e de registro (nota 9),
 * ordem dos segmentos (J → J-52 → B → C; A → B → C), contadores e somatórios dos trailers (nota 17),
 * lote Pix em arquivo separado (item 2.2), DV do código de barras (Anexo A), CPF/CNPJ, chave Pix (nota 40).
 * Não cobre: tributos (segmentos N, O, W), holerite (D, E, F) — aparecem como aviso "não coberto".
 */
import { type Achado, type Coletor, type Modo, fatia, mostrar, novoAchado, validarCampos } from "./cnab-validador-campos";
import {
  HEADER_ARQUIVO, HEADER_LOTE_030, HEADER_LOTE_040, type Layout, SEGMENTO_A, SEGMENTO_B, SEGMENTO_B_PIX, SEGMENTO_C, SEGMENTO_J,
  SEGMENTO_J52, SEGMENTO_J52_PIX, SEGMENTO_Z, TRAILER_ARQUIVO, TRAILER_LOTE,
} from "./cnab-layout-sispag";
import { conferirInscricao, FORMAS_PIX, FORMAS_SEGMENTO_A, FORMAS_SEGMENTO_J, MOVIMENTOS_INCLUSAO } from "./cnab-validador-regras";
import { fecharPagamento, type Pagamento, type Reg, regrasA, regrasB, regrasJ, regrasJ52 } from "./cnab-validador-segmentos";

export type { Achado } from "./cnab-validador-campos";

export type ResumoLote = { lote: string; tipoPagamento: string; forma: string; registros: number; totalCentavos: bigint; pagamentos: number };
export type ResultadoValidacao = { tipo: Modo; linhas: number; erros: Achado[]; avisos: Achado[]; lotes: ResumoLote[] };

const TAM = 240;
const ARQ = "Arquivo";
const pos = (ini: number, fim: number, nome: string, ref: string, ocorr?: string) => ({ ini, fim, nome, ref, ocorr });

/** Quebra em linhas guardando o terminador de cada uma. */
function quebrar(texto: string): { t: string; fim: string }[] {
  const out: { t: string; fim: string }[] = [];
  const re = /\r\n|\n|\r/g;
  let ini = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    out.push({ t: texto.slice(ini, m.index), fim: m[0] });
    ini = m.index + m[0].length;
  }
  if (ini < texto.length) out.push({ t: texto.slice(ini), fim: "" });
  return out;
}

/** Bytes (Buffer/Uint8Array) são lidos byte a byte (latin1), para que acento conte como byte a mais. */
function comoTexto(entrada: string | Uint8Array): string {
  if (typeof entrada === "string") return Buffer.from(entrada, "utf8").toString("latin1");
  return Buffer.from(entrada).toString("latin1");
}

export function validarSispag(entrada: string | Uint8Array): ResultadoValidacao {
  const achados: Achado[] = [];
  const add: Coletor = (a) => achados.push(a);
  const brutas = quebrar(comoTexto(entrada));
  while (brutas.length && brutas.at(-1)!.t === "" ) brutas.pop();

  // ── 1. forma física: tamanho, terminador, caracteres ──
  const regs: Reg[] = [];
  let terminadorRuim = 0;
  brutas.forEach((b, i) => {
    const linha = i + 1;
    if (b.fim !== "\r\n") {
      terminadorRuim++;
      if (terminadorRuim === 1) {
        add(novoAchado("aviso", linha, ARQ, pos(241, 242, "FIM DE LINHA", "item 2.1 (um registro por linha); CRLF é a convenção CNAB/FEBRABAN"), "CR LF (0D 0A)",
          b.fim === "" ? "sem quebra de linha" : b.fim === "\n" ? "só LF (0A)" : "só CR (0D)"));
      }
    }
    const ruim = [...b.t].findIndex((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e);
    if (ruim >= 0) {
      const cod = b.t.charCodeAt(ruim).toString(16).toUpperCase().padStart(2, "0");
      add(novoAchado("erro", linha, ARQ, pos(ruim + 1, ruim + 1, "CARACTERE", "item 2.2.1 (sem acento nem caractere especial)"), "ASCII imprimível (20h a 7Eh)", `byte ${cod}h`));
    }
    if (b.t.length !== TAM) {
      add(novoAchado("erro", linha, ARQ, pos(1, b.t.length, "TAMANHO DO REGISTRO", "p. 12 (registro de 240 bytes)"), "240 bytes", `${b.t.length} bytes`));
      return;
    }
    regs.push({ linha, t: b.t });
  });
  if (terminadorRuim > 1) add(novoAchado("aviso", 0, ARQ, pos(241, 242, "FIM DE LINHA", "item 2.1"), "CR LF em todas as linhas", `${terminadorRuim} linhas com outro terminador`));
  if (regs.length === 0) return montar("remessa", brutas.length, achados, []);

  // ── 2. header de arquivo ──
  const h = regs[0];
  const modo: Modo = fatia(h.t, 143, 143) === "2" ? "retorno" : "remessa";
  if (fatia(h.t, 8, 8) !== "0") add(novoAchado("erro", h.linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2 (arquivo começa pelo header de arquivo)", "HM"), '"0"', mostrar(fatia(h.t, 8, 8))));
  else {
    validarCampos(h.t, h.linha, HEADER_ARQUIVO, modo, add);
    inscricao(h, HEADER_ARQUIVO, add, "HM");
  }
  const dataGeracao = fatia(h.t, 144, 151);

  // ── 3. lotes ──
  const lotes: ResumoLote[] = [];
  let lote: (ResumoLote & { header: Reg; ultimoSeq: number; pag: Pagamento | null; segs: string[] }) | null = null;
  let viuTrailer = false;
  let qtdLotes = 0;

  const fechar = () => {
    if (lote?.pag) fecharPagamento(lote.pag, add);
    if (lote) lote.pag = null;
  };

  for (const r of regs.slice(1)) {
    const { t, linha } = r;
    const tipo = fatia(t, 8, 8);
    if (viuTrailer) {
      add(novoAchado("erro", linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2"), "nada depois do trailer de arquivo", mostrar(tipo)));
      continue;
    }
    if (fatia(t, 1, 3) !== "341") add(novoAchado("erro", linha, ARQ, pos(1, 3, "CÓDIGO DO BANCO", "p. 12"), '"341"', mostrar(fatia(t, 1, 3))));

    if (tipo === "1") {
      if (lote) add(novoAchado("erro", linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2", "HA"), `trailer do lote ${lote.lote} antes de novo header de lote`, '"1"'));
      fechar();
      qtdLotes++;
      const forma = fatia(t, 12, 13);
      const layoutLote = fatia(t, 14, 16);
      const L = layoutLote === "030" || FORMAS_SEGMENTO_J.has(forma) ? HEADER_LOTE_030 : HEADER_LOTE_040;
      validarCampos(t, linha, L, modo, add);
      inscricao(r, L, add, "CI");
      const num = fatia(t, 4, 7);
      if (num !== String(qtdLotes).padStart(4, "0")) add(novoAchado("erro", linha, L, pos(4, 7, "CÓDIGO DO LOTE", "nota 3 (sequencial a partir de 0001)", "AG"), String(qtdLotes).padStart(4, "0"), mostrar(num)));
      if (FORMAS_SEGMENTO_J.has(forma) && layoutLote !== "030") add(novoAchado("erro", linha, L, pos(14, 16, "LAYOUT DO LOTE", "p. 25"), '"030" para boletos/QR Code', mostrar(layoutLote)));
      if (FORMAS_SEGMENTO_A.has(forma) && layoutLote !== "040") add(novoAchado("erro", linha, L, pos(14, 16, "LAYOUT DO LOTE", "p. 13"), '"040" para cheque/OP/DOC/TED/Pix/crédito', mostrar(layoutLote)));
      if (!FORMAS_SEGMENTO_A.has(forma) && !FORMAS_SEGMENTO_J.has(forma)) add(novoAchado("aviso", linha, L, pos(12, 13, "FORMA DE PAGAMENTO", "nota 5"), "forma coberta pelo validador (A ou J)", `${mostrar(forma)} (tributos/concessionárias não cobertos)`));
      for (const [ini, fim, nome] of [[19, 32, "INSCRIÇÃO"], [53, 72, "AGÊNCIA/CONTA"]] as const) {
        if (fatia(t, ini, fim) !== fatia(h.t, ini, fim)) add(novoAchado("aviso", linha, L, pos(ini, fim, `EMPRESA – ${nome}`, "nota 1 (permitido para grupo; confira)"), `igual ao header de arquivo ${mostrar(fatia(h.t, ini, fim))}`, mostrar(fatia(t, ini, fim))));
      }
      lote = { lote: num, tipoPagamento: fatia(t, 10, 11), forma, registros: 1, totalCentavos: BigInt(0), pagamentos: 0, header: r, ultimoSeq: 0, pag: null, segs: [] };
      continue;
    }

    if (tipo === "3") {
      if (!lote) {
        add(novoAchado("erro", linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2", "HA"), "detalhe dentro de um lote (depois do header de lote)", '"3"'));
        continue;
      }
      lote.registros++;
      if (fatia(t, 4, 7) !== lote.lote) add(novoAchado("erro", linha, ARQ, pos(4, 7, "CÓDIGO DO LOTE", "nota 3 (todos os registros do lote com o mesmo código)", "AG"), mostrar(lote.lote), mostrar(fatia(t, 4, 7))));
      detalhe(r, lote, modo, dataGeracao, add, fechar);
      continue;
    }

    if (tipo === "5") {
      fechar();
      validarCampos(t, linha, TRAILER_LOTE, modo, add);
      if (!lote) {
        add(novoAchado("erro", linha, TRAILER_LOTE, pos(8, 8, "TIPO DE REGISTRO", "item 2.2", "HA"), "trailer de lote depois de um header de lote", '"5"'));
        continue;
      }
      lote.registros++;
      if (fatia(t, 4, 7) !== lote.lote) add(novoAchado("erro", linha, TRAILER_LOTE, pos(4, 7, "CÓDIGO DO LOTE", "nota 3", "AG"), mostrar(lote.lote), mostrar(fatia(t, 4, 7))));
      const qtd = String(lote.registros).padStart(6, "0");
      if (fatia(t, 18, 23) !== qtd) add(novoAchado("erro", linha, TRAILER_LOTE, pos(18, 23, "TOTAL QTDE REGISTROS", "nota 17 a (registros 1, 3 e 5 do lote)", "TA"), qtd, mostrar(fatia(t, 18, 23))));
      const soma = lote.totalCentavos.toString().padStart(18, "0");
      if (fatia(t, 24, 41) !== soma) add(novoAchado("erro", linha, TRAILER_LOTE, pos(24, 41, "TOTAL VALOR PAGTOS", "nota 17 b (soma das inclusões 000-003)", "TA"), soma, mostrar(fatia(t, 24, 41))));
      if (lote.pagamentos === 0) add(novoAchado("erro", linha, TRAILER_LOTE, pos(8, 8, "LOTE SEM DETALHE", "item 2.2"), "ao menos um pagamento no lote", "nenhum"));
      lotes.push({ lote: lote.lote, tipoPagamento: lote.tipoPagamento, forma: lote.forma, registros: lote.registros, totalCentavos: lote.totalCentavos, pagamentos: lote.pagamentos });
      lote = null;
      continue;
    }

    if (tipo === "9") {
      if (lote) add(novoAchado("erro", linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2", "HA"), `trailer do lote ${lote.lote} antes do trailer de arquivo`, '"9"'));
      fechar();
      lote = null;
      viuTrailer = true;
      validarCampos(t, linha, TRAILER_ARQUIVO, modo, add);
      const ql = String(qtdLotes).padStart(6, "0");
      if (fatia(t, 18, 23) !== ql) add(novoAchado("erro", linha, TRAILER_ARQUIVO, pos(18, 23, "TOTAL QTDE DE LOTES", "nota 17 a (registros tipo 1)"), ql, mostrar(fatia(t, 18, 23))));
      const qr = String(brutas.length).padStart(6, "0");
      if (fatia(t, 24, 29) !== qr) add(novoAchado("erro", linha, TRAILER_ARQUIVO, pos(24, 29, "TOTAL QTDE REGISTROS", "nota 17 a (registros 0, 1, 3, 5 e 9)"), qr, mostrar(fatia(t, 24, 29))));
      continue;
    }

    add(novoAchado("erro", linha, ARQ, pos(8, 8, "TIPO DE REGISTRO", "item 2.2"), "0, 1, 3, 5 ou 9", mostrar(tipo)));
  }
  if (lote) add(novoAchado("erro", regs.at(-1)!.linha, ARQ, pos(8, 8, "TRAILER DE LOTE", "item 2.2", "HA"), `trailer do lote ${lote.lote}`, "ausente"));
  if (!viuTrailer) add(novoAchado("erro", regs.at(-1)!.linha, ARQ, pos(8, 8, "TRAILER DE ARQUIVO", "item 2.2"), "registro tipo 9 no fim", "ausente"));

  // ── 4. Pix em arquivo separado (item 2.2) ──
  const formas = new Set(lotes.map((l) => l.forma));
  if ([...formas].some((f) => FORMAS_PIX.has(f)) && [...formas].some((f) => !FORMAS_PIX.has(f))) {
    add(novoAchado("erro", 0, ARQ, pos(12, 13, "FORMA DE PAGAMENTO", "item 2.2 (lotes Pix em arquivo separado)", "IM"), "arquivo só com lotes Pix (45/47) ou só sem Pix", [...formas].join(", ")));
  }
  return montar(modo, brutas.length, achados, lotes);
}

function inscricao(r: Reg, L: Layout, add: Coletor, ocorr: string) {
  const p = conferirInscricao(fatia(r.t, 18, 18), fatia(r.t, 19, 32));
  if (p) add(novoAchado("erro", r.linha, L, pos(18, 32, "EMPRESA – INSCRIÇÃO", `${L.ref}, nota 1`, ocorr), "tipo 1/2 coerente com CPF/CNPJ de DV válido", `${mostrar(fatia(r.t, 18, 32))} (${p})`));
}

type LoteAberto = ResumoLote & { ultimoSeq: number; pag: Pagamento | null; segs: string[] };

function detalhe(r: Reg, lote: LoteAberto, modo: Modo, dataGeracao: string, add: Coletor, fechar: () => void) {
  const { t, linha } = r;
  const seg = fatia(t, 14, 14);
  const seq = Number(fatia(t, 9, 13));
  const ehJ52 = seg === "J" && fatia(t, 18, 19) === "52" && lote.pag?.principal.seg === "J" && seq === lote.ultimoSeq;
  const principal = seg === "A" || (seg === "J" && !ehJ52);
  const esperado = principal ? lote.ultimoSeq + 1 : lote.ultimoSeq;
  if (!Number.isFinite(seq) || seq !== esperado) {
    add(novoAchado("erro", linha, ARQ, pos(9, 13, "NÚMERO DO REGISTRO", "nota 9 (A/J numeram; B, C, J-52, Z repetem o número do principal)", "AH"), String(esperado).padStart(5, "0"), mostrar(fatia(t, 9, 13))));
  }
  const familiaA = FORMAS_SEGMENTO_A.has(lote.forma);
  const familiaJ = FORMAS_SEGMENTO_J.has(lote.forma);

  if (principal) {
    fechar();
    lote.ultimoSeq = seq;
    lote.pagamentos++;
    if ((seg === "A" && familiaJ) || (seg === "J" && familiaA)) {
      add(novoAchado("erro", linha, ARQ, pos(14, 14, "SEGMENTO", "item 2.2 (segmentos por forma)", "IM"), `segmento ${familiaJ ? "J" : "A"} na forma ${lote.forma}`, mostrar(seg)));
    }
    const L = seg === "A" ? SEGMENTO_A : SEGMENTO_J;
    validarCampos(t, linha, L, modo, add);
    if (modo === "retorno" && /^ +$/.test(fatia(t, 231, 240))) {
      add(novoAchado("aviso", linha, L, pos(231, 240, "OCORRÊNCIAS", "nota 8 (o retorno informa o resultado de cada pagamento)"), "ao menos um código da nota 8", "brancos"));
    }
    if (seg === "A") regrasA(r, lote.forma, modo, dataGeracao, add);
    else regrasJ(r, lote.forma, modo, dataGeracao, add);
    if (MOVIMENTOS_INCLUSAO.has(fatia(t, 15, 17))) {
      const v = seg === "A" ? fatia(t, 120, 134) : fatia(t, 153, 167);
      if (/^\d+$/.test(v)) lote.totalCentavos += BigInt(v);
    }
    lote.pag = { forma: lote.forma, principal: { ...r, seg }, complementos: [] };
    return;
  }

  const pag = lote.pag;
  if (!pag) {
    add(novoAchado("erro", linha, ARQ, pos(14, 14, "SEGMENTO", "item 2.2", "HA"), "complemento depois de um segmento A ou J", mostrar(seg)));
    return;
  }
  const ordem = pag.complementos;
  if (ehJ52) {
    if (ordem.length) add(novoAchado("erro", linha, SEGMENTO_J52, pos(14, 19, "SEGMENTO J-52", "p. 27 (ordem J, J-52, B, C)"), "J-52 logo após o J", `depois de ${ordem.join(", ")}`));
    validarCampos(t, linha, lote.forma === "47" ? SEGMENTO_J52_PIX : SEGMENTO_J52, modo, add);
    regrasJ52(r, lote.forma, add);
    pag.j52 = r;
    ordem.push("J-52");
    return;
  }
  if (seg === "B") {
    if (ordem.some((s) => s !== "J-52")) add(novoAchado("erro", linha, SEGMENTO_B, pos(14, 14, "SEGMENTO", "p. 27 / item 2.2 (ordem A, B, C / J, J-52, B, C)"), "B antes de C/Z", `depois de ${ordem.join(", ")}`));
    validarCampos(t, linha, lote.forma === "45" ? SEGMENTO_B_PIX : SEGMENTO_B, modo, add);
    regrasB(r, lote.forma, add);
    pag.b = r;
  } else if (seg === "C") {
    validarCampos(t, linha, SEGMENTO_C, modo, add);
  } else if (seg === "Z") {
    if (modo === "remessa") add(novoAchado("erro", linha, SEGMENTO_Z, pos(14, 14, "SEGMENTO", "p. 23 (Z só no retorno)"), "segmento Z apenas no arquivo retorno", '"Z"'));
    else validarCampos(t, linha, SEGMENTO_Z, modo, add);
  } else if ("DEFNOW".includes(seg) && seg.trim()) {
    add(novoAchado("aviso", linha, ARQ, pos(14, 14, "SEGMENTO", "item 2.2"), "segmento coberto pelo validador", `${mostrar(seg)} (holerite/tributos não cobertos)`));
  } else {
    add(novoAchado("erro", linha, ARQ, pos(14, 14, "SEGMENTO", "item 2.2", "HA"), seg === "J" ? 'J-52 ("52" em 018-019, mesmo número do J)' : "A, B, C, J, J-52 ou Z", mostrar(seg)));
  }
  ordem.push(seg);
}

function montar(tipo: Modo, linhas: number, achados: Achado[], lotes: ResumoLote[]): ResultadoValidacao {
  const ord = [...achados].sort((a, b) => a.linha - b.linha || a.ini - b.ini);
  return { tipo, linhas, erros: ord.filter((a) => a.severidade === "erro"), avisos: ord.filter((a) => a.severidade === "aviso"), lotes };
}

const p3 = (n: number) => String(n).padStart(3, "0");

/** Relatório em texto, no formato de devolução de um analista: uma linha por apontamento. */
export function relatorioValidacao(r: ResultadoValidacao, nomeArquivo = "arquivo"): string {
  const linhaDe = (a: Achado) =>
    `  ${a.linha ? `linha ${String(a.linha).padStart(4, "0")}` : "arquivo   "} | pos. ${p3(a.ini)}-${p3(a.fim)} | ${a.registro} | ${a.campo}\n` +
    `      esperado: ${a.esperado}\n      encontrado: ${a.encontrado}\n      regra: ${a.regra}${a.ocorrencia ? ` | ocorrência provável no retorno: ${a.ocorrencia}` : ""}`;
  const cab = [
    `Validação SISPAG CNAB 240 (manual Itaú v085) — ${nomeArquivo}`,
    `Tipo: ${r.tipo} | linhas: ${r.linhas} | lotes: ${r.lotes.map((l) => `${l.lote} (tipo ${l.tipoPagamento}, forma ${l.forma}, ${l.pagamentos} pagto, R$ ${(Number(l.totalCentavos) / 100).toFixed(2)})`).join("; ") || "nenhum"}`,
    `Resultado: ${r.erros.length ? `REPROVADO — ${r.erros.length} erro(s)` : "APROVADO — nenhum erro"}${r.avisos.length ? `, ${r.avisos.length} aviso(s)` : ""}`,
  ];
  return [...cab, ...(r.erros.length ? ["", "ERROS", ...r.erros.map(linhaDe)] : []), ...(r.avisos.length ? ["", "AVISOS", ...r.avisos.map(linhaDe)] : [])].join("\n") + "\n";
}
