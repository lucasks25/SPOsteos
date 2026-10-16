import { exigirUsuarioRota } from "@/lib/auth";
import { glosasDados } from "../../_lib/consultas";
import { respostaCsv, pct } from "@/lib/csv";
import { PERFIS_GLOSAS } from "../../_lib/visual";
import { ROTULO_CATEGORIA_GLOSA } from "../../../financeiro/_lib/publico";

export async function GET(req: Request) {
  const sessao = await exigirUsuarioRota([...PERFIS_GLOSAS]);
  if (sessao instanceof Response) return sessao;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const d = await glosasDados(sp);
  const por = sp.por === "convenio" ? "convenio" : sp.por === "hospital" ? "hospital" : "categoria";
  const nome = `glosas_${por}_${d.periodo.de}_${d.periodo.ate}.csv`;
  if (por === "categoria") {
    return respostaCsv(nome, [
      ["Categoria", "Valor glosado", "Glosas", "% do total glosado"],
      ...d.porCategoria.map((l) => [ROTULO_CATEGORIA_GLOSA[l.categoria], l.valor, String(l.qtd), pct(l.pctDoTotal)]),
      ["Total", d.glosado, String(d.qtd), pct(d.glosado > 0 ? 100 : null)],
    ]);
  }
  const linhas = por === "convenio" ? d.porConvenio : d.porHospital;
  return respostaCsv(nome, [
    [por === "convenio" ? "Convênio" : "Hospital", "Faturado", "Glosado", "Glosas", "% glosa"],
    ...linhas.map((l) => [l.nome, l.faturado, l.glosado, String(l.qtd), pct(l.pct)]),
    ["Total", d.faturado, d.glosado, String(d.qtd), pct(d.pct)],
  ]);
}
