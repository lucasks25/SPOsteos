import { exigirUsuarioRota } from "@/lib/auth";
import { exportarCsv } from "@/lib/auth-exportacao";
import { limitarRota } from "@/lib/limite-rota";
import { margemDados } from "../../_lib/consultas";
import { pct } from "@/lib/csv";
import { PERFIS_GESTAO } from "../../_lib/visual";

const CAB = ["Receita", "Custo", "Margem", "Margem %", "Comissão"];

export async function GET(req: Request) {
  const sessao = await exigirUsuarioRota([...PERFIS_GESTAO]);
  if (sessao instanceof Response) return sessao;
  const excesso = limitarRota("exportacao", sessao.id);
  if (excesso) return excesso;
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
  return exportarCsv(sessao, req, `margem_${quem}_${d.periodo.de}_${d.periodo.ate}.csv`, [cabecalho, ...linhas.map(lin), lin({ ...d.total, nome: "Total", sub: "" })]);
}
