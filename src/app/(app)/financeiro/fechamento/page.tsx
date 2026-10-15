import { Field, Form } from "@/components/form";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { addMeses, hojeUTC, inicioMes } from "../_lib/datas";
import { fecharMes, reabrirMes } from "../_lib/fechamento-actions";
import { rotuloMes } from "../_lib/fechamento";

const NUM = 12;

export default async function FechamentoPage() {
  await requireUser(["FINANCEIRO"]);
  const atual = inicioMes(hojeUTC());
  const fechados = new Map((await db.fechamentoMes.findMany()).map((f) => [f.mes, f]));
  const meses = Array.from({ length: NUM }, (_, i) => addMeses(atual, -(i + 1)).toISOString().slice(0, 7));

  return (
    <>
      <PageHeader title="Fechamento de mês" subtitle="Mês fechado fica congelado: ninguém cria, altera ou estorna baixa, glosa, transferência, lançamento avulso ou título com data nele." />
      <div className="space-y-4">
        <Table head={["Mês", "Situação", "Ações"]}>
          {meses.map((m) => {
            const f = fechados.get(m);
            return (
              <tr key={m}>
                <Td>{rotuloMes(m)}</Td>
                <Td>{f ? <Badge color="gray">Fechado em {dateTime(f.fechadoEm)}</Badge> : <Badge color="green">Aberto</Badge>}</Td>
                <Td className="whitespace-normal">
                  {f ? (
                    <Form action={reabrirMes} submitLabel="Reabrir" resetOnSuccess>
                      <input type="hidden" name="mes" value={m} />
                      <Field label="Motivo da reabertura *" name="motivo" required minLength={5} maxLength={200} />
                    </Form>
                  ) : (
                    <Form action={fecharMes} submitLabel="Fechar mês">
                      <input type="hidden" name="mes" value={m} />
                    </Form>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
        <Card>
          <p className="text-xs text-slate-600">
            Assim o DRE do mês não muda depois de conferido. Só fecha mês que já terminou e que não tenha lançamento “Não classificado” no DRE. Com o mês fechado, retorno do banco ou conciliação cujo pagamento caia nele serão recusados até a reabertura. Meses fechados também aparecem marcados no DRE.
          </p>
        </Card>
      </div>
    </>
  );
}
