import { ActionButton, Field, Form, Select } from "@/components/form";
import { Badge } from "@/components/ui";
import { date, money } from "@/lib/format";
import { CATEGORIAS_AVULSO } from "../_lib/config";
import { avulsoEConciliar, baixarEConciliar, conciliarComLancamento, excluirLinhaExtrato } from "../_lib/conciliacao-actions";
import type { LinhaView, OpcaoTitulo, SugestaoLancamento } from "../_lib/conciliacao";

/** Uma linha pendente do extrato, com as formas de conciliar. */
export function LinhaPendente({ linha, sugLanc, exatos, titulos }: { linha: LinhaView; sugLanc: SugestaoLancamento[]; exatos: OpcaoTitulo[]; titulos: OpcaoTitulo[] }) {
  const entrada = linha.valor > 0;
  const opcoesTitulo = titulos.map((t) => ({ value: t.id, label: `${t.label} — saldo ${money(t.saldo)}` }));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">{linha.descricao}</div>
          <div className="text-xs text-slate-500">{date(linha.data)}</div>
        </div>
        <div className={`text-lg font-semibold tabular-nums ${entrada ? "text-emerald-700" : "text-rose-700"}`}>{money(linha.valor)}</div>
      </div>

      {(sugLanc.length > 0 || exatos.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {sugLanc.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="teal">lançamento igual</Badge>
              <span className="text-slate-700">
                {s.descricao} ({date(s.data)})
              </span>
              <ActionButton action={conciliarComLancamento.bind(null, linha.id, s.id)} variant="primary">
                Conciliar
              </ActionButton>
            </div>
          ))}
          {exatos.slice(0, 3).map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="blue">título com o mesmo valor</Badge>
              <span className="text-slate-700">{t.label}</span>
              <ConfirmarBaixa linhaId={linha.id} tituloId={t.id} />
            </div>
          ))}
        </div>
      )}

      <details className="mt-3 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-teal-700">Outras opções</summary>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Baixar um título {entrada ? "a receber" : "a pagar"}</h3>
            <Form action={baixarEConciliar.bind(null, linha.id)} submitLabel="Baixar e conciliar">
              <Select label="Título" name="tituloId" options={opcoesTitulo} placeholder={opcoesTitulo.length ? "Selecione..." : "Nenhum título em aberto"} required />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Juros" name="juros" type="number" step="0.01" min="0" />
                <Field label="Multa" name="multa" type="number" step="0.01" min="0" />
                <Field label="Desconto" name="desconto" type="number" step="0.01" min="0" />
              </div>
            </Form>
            <p className="mt-1 text-xs text-slate-400">
              A baixa usa o valor e a data do extrato. Extrato menor que o saldo: parcial, ou informe o desconto para quitar. Extrato maior: informe os juros ou a multa que explicam a diferença.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lançamento avulso (tarifa, rendimento...)</h3>
            <Form action={avulsoEConciliar.bind(null, linha.id)} submitLabel="Lançar e conciliar">
              <Field label="Descrição" name="descricao" defaultValue={linha.descricao} required maxLength={200} />
              <Select label="Categoria" name="categoria" options={CATEGORIAS_AVULSO.map((c) => ({ value: c, label: c }))} placeholder="(sem categoria)" />
            </Form>
          </div>
        </div>
        <div className="mt-4">
          <ActionButton action={excluirLinhaExtrato.bind(null, linha.id)} variant="secondary" confirm="Excluir esta linha do extrato? Use se foi importada na conta errada.">
            Excluir linha
          </ActionButton>
        </div>
      </details>
    </div>
  );
}

function ConfirmarBaixa({ linhaId, tituloId }: { linhaId: string; tituloId: string }) {
  return (
    <Form action={baixarEConciliar.bind(null, linhaId)} submitLabel="Baixar e conciliar" className="inline-flex">
      <input type="hidden" name="tituloId" value={tituloId} />
    </Form>
  );
}

