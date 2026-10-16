import type { Opcao } from "../_lib/plano";
import { ActionButton, Field, Form, Select } from "@/components/form";
import { Badge } from "@/components/ui";
import { date, money } from "@/lib/format";
import { avulsoEConciliar, baixarEConciliar, conciliarComLancamento, excluirLinhaExtrato } from "../_lib/conciliacao-actions";
import type { LinhaView, OpcaoTitulo, SugestaoLancamento } from "../_lib/conciliacao";

/** Uma linha pendente do extrato, com as formas de conciliar. */
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
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-900">{linha.descricao}</div>
          <div className="text-[11px] text-slate-500">{date(linha.data)} · {entrada ? "entrada" : "saída"} sem vínculo</div>
        </div>
        <div className={`tnum text-sm font-bold ${entrada ? "text-emerald-700" : "text-rose-600"}`}>{entrada ? "+ " : "− "}{money(Math.abs(linha.valor))}</div>
      </div>

      {(sugLanc.length > 0 || exatos.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {sugLanc.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="teal">lançamento igual</Badge>
              <span className="text-slate-700">
                {s.descricao} ({date(s.data)})
              </span>
              <ActionButton action={conciliarComLancamento.bind(null, linha.id, s.id)} variant="small">
                Conciliar
              </ActionButton>
            </div>
          ))}
          {exatos.slice(0, 3).map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="blue">título com o mesmo valor</Badge>
              <span className="text-slate-700">{t.label}</span>
              <ConfirmarBaixa linhaId={linha.id} tituloId={t.id} confirm={avisoBaixa} />
            </div>
          ))}
        </div>
      )}

      <details className="mt-3 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-teal-700">Outras opções: baixar título, lançamento avulso ou excluir</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-bold text-slate-600">Baixar um título {entrada ? "a receber" : "a pagar"}</h3>
            <Form action={baixarEConciliar.bind(null, linha.id)} submitLabel="Baixar e conciliar" confirm={avisoBaixa}>
              <Select label="Título" name="tituloId" options={opcoesTitulo} placeholder={opcoesTitulo.length ? "Selecione..." : "Nenhum título em aberto"} required />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Juros" name="juros" type="number" step="0.01" min="0" />
                <Field label="Multa" name="multa" type="number" step="0.01" min="0" />
                <Field label="Desconto" name="desconto" type="number" step="0.01" min="0" />
              </div>
            </Form>
            <p className="mt-1 text-xs text-slate-500">
              A baixa usa o valor e a data do extrato. Extrato menor que o saldo: parcial, ou informe o desconto para quitar. Extrato maior: informe os juros ou a multa que explicam a diferença.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold text-slate-600">Lançamento avulso (tarifa, rendimento...)</h3>
            <Form action={avulsoEConciliar.bind(null, linha.id)} submitLabel="Lançar e conciliar" confirm={avisoAvulso}>
              <Field label="Descrição" name="descricao" defaultValue={linha.descricao} required maxLength={200} />
              <Select label="Conta do plano *" name="planoContaId" options={planos} placeholder="Selecione..." required />
              <Select label="Centro de custo" name="centroCustoId" options={centros} placeholder="(nenhum)" />
            </Form>
          </div>
        </div>
        <div className="mt-4">
          <ActionButton action={excluirLinhaExtrato.bind(null, linha.id)} variant="small" confirm="Excluir esta linha do extrato? Use se foi importada na conta errada.">
            Excluir linha
          </ActionButton>
        </div>
      </details>
    </div>
  );
}

function ConfirmarBaixa({ linhaId, tituloId, confirm }: { linhaId: string; tituloId: string; confirm?: string }) {
  return (
    <ActionButton action={baixarEConciliar.bind(null, linhaId)} hidden={{ tituloId }} variant="small" confirm={confirm}>
      Baixar e conciliar
    </ActionButton>
  );
}
