import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { inputDateTime } from "@/lib/format";
import type { Cirurgia } from "@/generated/prisma/client";
import type { Opcao } from "../_lib/opcoes";
import { salvarCirurgia } from "./actions";

export type CirurgiaOpcoes = {
  hospitais: Opcao[];
  medicos: Opcao[];
  convenios: Opcao[];
  procedimentos: Opcao[];
  representantes: Opcao[];
};

export function CirurgiaForm({ cirurgia, opcoes }: { cirurgia?: Cirurgia; opcoes: CirurgiaOpcoes }) {
  const c = cirurgia;
  return (
    <Form action={salvarCirurgia.bind(null, c?.id ?? null)}>
      <Grid cols={3}>
        <Field label="Data e hora *" name="dataHora" type="datetime-local" defaultValue={inputDateTime(c?.dataHora)} required hint="Horário de Brasília" />
        <Select label="Hospital *" name="hospitalId" defaultValue={c?.hospitalId ?? ""} options={opcoes.hospitais} required />
        <Select label="Médico *" name="medicoId" defaultValue={c?.medicoId ?? ""} options={opcoes.medicos} required />
        <Select label="Convênio" name="convenioId" defaultValue={c?.convenioId ?? ""} options={opcoes.convenios} placeholder="Particular / não informado" />
        <Select label="Procedimento" name="procedimentoId" defaultValue={c?.procedimentoId ?? ""} options={opcoes.procedimentos} />
        <Select label="Representante" name="representanteId" defaultValue={c?.representanteId ?? ""} options={opcoes.representantes} />
        <Field label="Paciente *" name="paciente" defaultValue={c?.paciente} required />
        <Field label="Carteirinha" name="carteirinha" defaultValue={c?.carteirinha ?? ""} />
        <div className="flex items-end pb-2">
          <Field label="Paciente SUS" name="sus" type="checkbox" defaultChecked={c?.sus ?? false} />
        </div>
      </Grid>
      <TextArea label="Observação" name="observacao" defaultValue={c?.observacao ?? ""} />
    </Form>
  );
}
