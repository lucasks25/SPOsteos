/**
 * Relatório de TODOS os dados de um paciente (titular), para atender pedido de acesso/confirmação (LGPD art. 18 I e II,
 * prazo do art. 19 II: 15 dias) e para avaliar pedido de correção/eliminação. Roteiro de atendimento: docs/LGPD.md §8.
 *   OPERADOR="Nome" npx tsx scripts/lgpd-titular.ts --nome="Maria da Silva" [--parcial] [--saida=relatorio.md]
 *   OPERADOR="Nome" npx tsx scripts/lgpd-titular.ts --carteirinha=0123456789
 *   OPERADOR="Nome" npx tsx scripts/lgpd-titular.ts --cirurgias=12,15        (depois de conferir homônimos)
 * Nome: igualdade sem acento/maiúscula; --parcial lista quem CONTÉM o texto (para achar candidatos, não para enviar).
 * O arquivo gerado contém dado de saúde: é gravado com permissão 600; entregue por canal seguro e apague depois.
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { CTX_CARTEIRINHA, decifrarParaExibir, indicesBusca, normalizarParaIndice } from "@/lib/cripto";
import { argumentos, auditarScript, operador } from "./_lgpd-comum";

const dt = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const h = (x: { razaoSocial: string; nomeFantasia: string | null }) => x.nomeFantasia || x.razaoSocial;

async function idsDasCirurgias(a: Record<string, string>): Promise<{ ids: string[]; criterio: string; nome?: string }> {
  if (a.cirurgias) {
    const nums = a.cirurgias.split(",").map((n) => Number(n.trim().replace(/^CIR-/i, "")));
    if (nums.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("--cirurgias: números separados por vírgula (ex.: 12,15).");
    const cs = await db.cirurgia.findMany({ where: { numero: { in: nums } }, select: { id: true } });
    return { ids: cs.map((c) => c.id), criterio: `cirurgias ${nums.join(",")}` };
  }
  if (a.carteirinha) {
    const alvo = normalizarParaIndice(a.carteirinha);
    if (!alvo) throw new Error("--carteirinha vazia.");
    const hashes = indicesBusca(a.carteirinha, CTX_CARTEIRINHA);
    // índice cego (cifradas) + igualdade em claro (legado ainda não migrado por scripts/lgpd-cifrar.ts)
    const porHash = hashes.length ? await db.cirurgia.findMany({ where: { carteirinhaHash: { in: hashes } }, select: { id: true } }) : [];
    const legado = (await db.cirurgia.findMany({ where: { carteirinha: { not: null }, NOT: { carteirinha: { startsWith: "enc:" } } }, select: { id: true, carteirinha: true } }))
      .filter((c) => normalizarParaIndice(c.carteirinha!) === alvo);
    return { ids: [...new Set([...porHash, ...legado].map((c) => c.id))], criterio: "carteirinha" };
  }
  if (a.nome) {
    const alvo = normalizarParaIndice(a.nome);
    if (alvo.length < 3) throw new Error("--nome muito curto.");
    const primeiro = a.nome.trim().split(/\s+/)[0];
    const cand = await db.cirurgia.findMany({ where: { paciente: { contains: primeiro, mode: "insensitive" } }, select: { id: true, paciente: true } });
    const ok = cand.filter((c) => (a.parcial ? normalizarParaIndice(c.paciente).includes(alvo) : normalizarParaIndice(c.paciente) === alvo));
    return { ids: ok.map((c) => c.id), criterio: a.parcial ? "nome (parcial)" : "nome", nome: a.nome };
  }
  throw new Error("Informe --nome, --carteirinha ou --cirurgias.");
}

async function main() {
  const a = argumentos();
  const { ids, criterio, nome } = await idsDasCirurgias(a);
  const cirurgias = await db.cirurgia.findMany({
    where: { id: { in: ids } },
    orderBy: { dataHora: "asc" },
    include: {
      hospital: true, medico: true, convenio: true, procedimento: true, representante: true, anexos: true, pedido: true,
      consumos: { include: { produto: { include: { fabricante: true } }, lote: true } },
      remessas: { select: { id: true, status: true, enviadaEm: true } },
      autorizacoes: { select: { numeroGuia: true, status: true, solicitadaEm: true, autorizadaEm: true, validade: true } },
      recolhimentoPacientes: { include: { recolhimento: { select: { id: true, motivo: true, status: true } } } },
    },
  });
  const nomes = [...new Set(cirurgias.map((c) => c.paciente))];
  // orçamento não tem carteirinha nem ligação com a cirurgia: casa pelo nome (o informado e as grafias das cirurgias)
  const alvos = new Set([...nomes, ...(nome ? [nome] : [])].map(normalizarParaIndice));
  const orcamentos = alvos.size
    ? (await db.orcamento.findMany({ where: { paciente: { not: null } }, include: { hospital: true, convenio: true } })).filter((o) => alvos.has(normalizarParaIndice(o.paciente!)))
    : [];
  const acessos = ids.length
    ? await db.logAuditoria.findMany({ where: { entidade: "Cirurgia", entidadeId: { in: ids } }, include: { usuario: { select: { nome: true, perfil: true } } }, orderBy: { criadoEm: "asc" } })
    : [];

  const L: string[] = [];
  L.push(`# Relatório de dados pessoais do titular`, ``, `Gerado em ${dt(new Date())} por ${operador()} · critério: ${criterio} · ${cirurgias.length} cirurgia(s), ${orcamentos.length} orçamento(s).`, ``);
  if (nomes.length > 1 || (a.parcial && cirurgias.length)) L.push(`> ATENÇÃO: há ${nomes.length} grafia(s)/pessoa(s) diferentes (${nomes.length} nome(s)). Confirme a identidade (data, hospital, médico) com o titular e gere de novo com --cirurgias=<números> só com as dele.`, ``);
  if (cirurgias.length === 0 && orcamentos.length === 0) L.push(`Nenhum registro encontrado com este critério.`, ``);
  for (const c of cirurgias) {
    L.push(`## Cirurgia CIR-${c.numero} (${c.status.toLowerCase()})`, ``);
    L.push(`- Paciente: ${c.paciente}${c.sus ? " (SUS)" : ""}`);
    L.push(`- Carteirinha: ${decifrarParaExibir(c.carteirinha, CTX_CARTEIRINHA) ?? "—"}`);
    L.push(`- Data/hora: ${dt(c.dataHora)} · Hospital: ${h(c.hospital)} (CNPJ ${c.hospital.cnpj})`);
    L.push(`- Médico: ${c.medico.nome} (CRM ${c.medico.crm}/${c.medico.ufCrm}) · Convênio: ${c.convenio ? `${c.convenio.nome}${c.convenio.registroAns ? ` (ANS ${c.convenio.registroAns})` : ""}` : c.sus ? "SUS" : "particular/não informado"}`);
    L.push(`- Procedimento: ${c.procedimento ? `${c.procedimento.descricao}${c.procedimento.codigoTuss ? ` (TUSS ${c.procedimento.codigoTuss})` : ""}` : "—"}`);
    if (c.observacao) L.push(`- Observação registrada: ${c.observacao}`);
    L.push(`- Cadastrada em: ${dt(c.criadoEm)}`);
    if (c.consumos.length) {
      L.push(``, `Material implantado/utilizado (rastreabilidade sanitária):`);
      for (const k of c.consumos) L.push(`- ${k.quantidade} × ${k.produto.descricao} (código ${k.produto.codigo}${k.produto.registroAnvisa ? `, registro ANVISA ${k.produto.registroAnvisa}` : ""}${k.produto.fabricante ? `, fabricante ${k.produto.fabricante.nome}` : ""}) · lote ${k.lote.numero}, validade ${dia(k.lote.validade)}`);
    }
    if (c.autorizacoes.length) L.push(``, `Autorizações do convênio: ${c.autorizacoes.map((g) => `guia ${g.numeroGuia ?? "s/nº"} (${g.status.toLowerCase()}, solicitada ${dia(g.solicitadaEm)})`).join("; ")}`);
    if (c.remessas.length) L.push(`Remessas de material: ${c.remessas.map((r) => `REM-${r.id} (${r.status.toLowerCase()})`).join(", ")}`);
    if (c.pedido) L.push(`Faturamento: pedido PV-${c.pedido.id}${c.pedido.numeroNf ? `, NF ${c.pedido.numeroNf}` : ""} (dados enviados ao hospital/convênio para cobrança)`);
    if (c.anexos.length) L.push(`Anexos guardados: ${c.anexos.map((x) => `${x.nome} (${dia(x.criadoEm)})`).join("; ")}`);
    if (c.recolhimentoPacientes.length) L.push(`Recolhimentos (recall) que envolveram o material: ${c.recolhimentoPacientes.map((r) => `REC-${r.recolhimento.id} (${r.recolhimento.status.toLowerCase()}; comunicado: ${dt(r.comunicadoEm)})`).join("; ")}`);
    L.push(``);
  }
  if (orcamentos.length) {
    L.push(`## Orçamentos`, ``);
    for (const o of orcamentos) L.push(`- Orçamento ${o.id} (${o.status.toLowerCase()}), ${h(o.hospital)}, convênio ${o.convenio?.nome ?? "particular"}, criado ${dia(o.criadoEm)}`);
    L.push(``);
  }
  L.push(`## Com quem os dados foram compartilhados (art. 18 VII)`, ``,
    `Hospital onde a cirurgia ocorreu e convênio/operadora (agendamento, autorização e cobrança); fabricante/detentor do registro e ANVISA somente em caso de recolhimento ou queixa técnica (tecnovigilância). Fornecedores de tecnologia que hospedam o sistema atuam como operadores (art. 39).`, ``,
    `## Por que guardamos (resposta padrão)`, ``,
    `Os dados que ligam o paciente ao lote do implante são mantidos para cumprir obrigação legal e regulatória de rastreabilidade sanitária (LGPD art. 7º II, art. 11 II "a" e art. 16 I) e para o exercício regular de direitos (art. 11 II "d"), inclusive defesa em eventual ação por defeito do produto. Por isso não podem ser eliminados a pedido enquanto durar essa obrigação; podem ser CORRIGIDOS (art. 18 III) e, terminada a obrigação, serão eliminados ou anonimizados. Detalhes: docs/LGPD.md §7 e §8.`, ``,
    `## Registro de acessos (USO INTERNO, não enviar ao titular sem avaliação do encarregado)`, ``);
  for (const x of acessos) L.push(`- ${dt(x.criadoEm)} · ${x.usuario ? `${x.usuario.nome} (${x.usuario.perfil})` : "sistema/script"} · ${x.acao}${x.detalhes ? ` · ${x.detalhes}` : ""}`);
  if (acessos.length === 0) L.push(`- (nenhum)`);

  const texto = L.join("\n") + "\n";
  if (a.saida) {
    await writeFile(a.saida, texto, { mode: 0o600 });
    console.log(`Relatório gravado em ${a.saida} (permissão 600). Contém dado de saúde: entregue por canal seguro e apague depois.`);
  } else process.stdout.write(texto);
  // a auditoria não leva o nome nem a carteirinha (não espalhar o dado): só o critério e as cirurgias
  await auditarScript("relatório do titular (LGPD art. 18)", "Cirurgia", null, `critério ${criterio}: ${cirurgias.map((c) => `CIR-${c.numero}`).join(", ") || "nenhuma"}; ${orcamentos.length} orçamento(s)`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
