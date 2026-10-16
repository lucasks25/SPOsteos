import Link from "next/link";
import type { Opcao } from "../_lib/plano";
import { ActionButton, Field, Form, Select } from "@/components/form";
import { Badge, Card, Dica, cx } from "@/components/ui";
import { date, money } from "@/lib/format";
import { avulsoEConciliar, baixarEConciliar, conciliarComLancamento, excluirLinhaExtrato } from "../_lib/conciliacao-actions";
import type { LinhaView, OpcaoTitulo, SugestaoLancamento } from "../_lib/conciliacao";

/**
 * Item da coluna do extrato (Odoo, conciliação bancária): data em negrito, valor à direita, descrição embaixo;
 * o item aberto fica com fundo azul-claro e barra roxa à esquerda. É um link: abrir um item troca o painel da direita.
 */
export function ItemExtrato({ linha, href, ativo, sugestao }: { linha: LinhaView; href: string; ativo: boolean; sugestao: boolean }) {
  const entrada = linha.valor > 0;
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativo ? "true" : undefined}
      className={cx(
        "block border-b border-l-[3px] border-b-slate-100 px-3 py-2 transition-colors last:border-b-0",
        ativo ? "border-l-violet-700 bg-teal-50" : "border-l-transparent hover:bg-slate-50",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tnum font-semibold text-slate-900">{date(linha.data)}</span>
        <span className={cx("tnum font-semibold", entrada ? "text-emerald-700" : "text-rose-600")}>
          {entrada ? "+ " : "− "}
          {money(Math.abs(linha.valor))}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={linha.descricao}>
          {linha.descricao}
        </span>
        {sugestao && <span className="shrink-0 rounded-sm bg-teal-100 px-1 text-[0.6875rem] font-medium text-teal-800">sugestão</span>}
      </div>
    </Link>
  );
}

/** Painel de conciliação de UMA linha do extrato: sugestões, baixar um título, lançamento avulso ou excluir. */
export function LinhaPendente({ linha, sugLanc, exatos, titulos, planos, centros }: { linha: LinhaView; sugLanc: SugestaoLancamento[]; exatos: OpcaoTitulo[]; titulos: OpcaoTitulo[]; planos: Opcao[]; centros: Opcao[] }) {
  const entrada = linha.valor > 0;
  const opcoesTitulo = titulos.map((t) => ({ value: t.id, label: `${t.label} — saldo ${money(t.saldo)}` }));
  // risco de duplicidade: o mesmo dinheiro registrado duas vezes (avulso + baixa do título, ou baixa + lançamento já existente)
  const avisoBaixa = sugLanc.length
    ? `Já existe um lançamento pendente igual a esta linha (${sugLanc[0].descricao}, ${date(sugLanc[0].data)}). Se ele é este mesmo ${entrada ? "recebimento" : "pagamento"}, use "Conciliar" com ele: baixar o título criaria um segundo lançamento e o dinheiro ficaria contado duas vezes. Baixar mesmo assim?`
    : undefined;
  const avisoAvulso = exatos.length
    ? `Há título ${entrada ? "a receber" : "a pagar"} em aberto com o mesmo valor (${exatos[0].label}). Lançar como avulso registra o dinheiro sem baixar o título: ele continuaria em aberto e poderia ser baixado de novo depois (duplicidade). Lançar avulso mesmo assim?`
    : undefined;
  return (
    <Card
      title={linha.descricao}
      actions={
        <span className={cx("tnum text-base font-semibold", entrada ? "text-emerald-700" : "text-rose-600")}>
          {entrada ? "+ " : "− "}
          {money(Math.abs(linha.valor))}
        </span>
      }
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {date(linha.data)} · {entrada ? "entrada" : "saída"} sem vínculo
          </span>
          <ActionButton action={excluirLinhaExtrato.bind(null, linha.id)} variant="danger" confirm="Excluir esta linha do extrato? Use se foi importada na conta errada.">
            Excluir linha
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-5">
        {(sugLanc.length > 0 || exatos.length > 0) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Sugestões</h3>
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {sugLanc.map((s, i) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge color="teal">Lançamento igual</Badge>
                  <span className="min-w-0 flex-1 text-slate-700">
                    {s.descricao} ({date(s.data)})
                  </span>
                  <ActionButton action={conciliarComLancamento.bind(null, linha.id, s.id)} variant={i === 0 ? "primary" : "secondary"}>
                    Conciliar
                  </ActionButton>
                </div>
              ))}
              {exatos.slice(0, 3).map((t, i) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge color="blue">Título com o mesmo valor</Badge>
                  <span className="min-w-0 flex-1 text-slate-700">{t.label}</span>
                  <ActionButton action={baixarEConciliar.bind(null, linha.id)} hidden={{ tituloId: t.id }} variant={!sugLanc.length && i === 0 ? "primary" : "secondary"} confirm={avisoBaixa}>
                    Baixar e conciliar
                  </ActionButton>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-5 2xl:grid-cols-2">
          <section>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-900">
              Baixar um título {entrada ? "a receber" : "a pagar"}
              <Dica>A baixa usa o valor e a data do extrato. Extrato menor que o saldo: parcial, ou informe o desconto para quitar. Extrato maior: informe os juros ou a multa que explicam a diferença.</Dica>
            </h3>
            <Form action={baixarEConciliar.bind(null, linha.id)} submitLabel="Baixar e conciliar" submitVariant={sugLanc.length || exatos.length ? "secondary" : "primary"} confirm={avisoBaixa} compacto>
              <Select label="Título" name="tituloId" options={opcoesTitulo} placeholder={opcoesTitulo.length ? "Selecione..." : "Nenhum título em aberto"} required />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Juros" name="juros" type="number" step="0.01" min="0" />
                <Field label="Multa" name="multa" type="number" step="0.01" min="0" />
                <Field label="Desconto" name="desconto" type="number" step="0.01" min="0" />
              </div>
            </Form>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Lançamento avulso (tarifa, rendimento...)</h3>
            <Form action={avulsoEConciliar.bind(null, linha.id)} submitLabel="Lançar e conciliar" submitVariant="secondary" confirm={avisoAvulso} compacto>
              <Field label="Descrição" name="descricao" defaultValue={linha.descricao} required maxLength={200} />
              <Select label="Conta do plano *" name="planoContaId" options={planos} placeholder="Selecione..." required />
              <Select label="Centro de custo" name="centroCustoId" options={centros} placeholder="(nenhum)" />
            </Form>
          </section>
        </div>
      </div>
    </Card>
  );
}
