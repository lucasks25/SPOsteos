/** Select de status (ativos/inativos/todos) para usar dentro do SearchBar (GET ?status=). */
export function StatusFilter({ value }: { value?: string }) {
  return (
    <select
      name="status"
      aria-label="Situação do cadastro"
      defaultValue={value ?? ""}
      className="h-8 rounded border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25"
    >
      <option value="">Ativos</option>
      <option value="inativos">Inativos</option>
      <option value="todos">Todos</option>
    </select>
  );
}

/** Converte ?status= em filtro Prisma sobre o campo `ativo`. */
export function ativoWhere(status?: string) {
  if (status === "todos") return {};
  return { ativo: status !== "inativos" };
}
