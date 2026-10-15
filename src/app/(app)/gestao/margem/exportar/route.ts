import { requireUser } from "@/lib/auth";
import { margemDados } from "../../_lib/consultas";
import { respostaCsv, pct } from "../../_lib/csv";
import { PERFIS_GESTAO } from "../../_lib/visual";

const CAB = ["Receita", "Custo", "Margem", "Margem %", "Comissão"];

export async function GET(req: Request) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const d = await margemDados(sp);
  const quem = sp.por === "hospital" ? "hospital" : sp.por === "representante" ? "representante" : "produto";
  const linhas = quem === "hospital" ? d.hospitais : quem === "representante" ? d.representantes : d.produtos;
  const cabecalho = quem === "produto" ? ["Código", "Produto", "Pedidos", "Quantidade", ...CAB] : [quem === "hospital" ? "Hospital" : "Representante", "Pedidos", "Quantidade", ...CAB];
  const lin = (l: (typeof linhas)[number]) => [
    ...(quem === "produto" ? [l.sub, l.nome] : [l.nome]),
    String(l.pedidos),
    String(l.quantidade),
    l.receita,
    l.custo,
    l.margem,
    pct(l.margemPct),
    l.comissao,
  ];
  return respostaCsv(`margem_${quem}_${d.periodo.de}_${d.periodo.ate}.csv`, [cabecalho, ...linhas.map(lin), lin({ ...d.total, nome: "Total", sub: "" })]);
}
