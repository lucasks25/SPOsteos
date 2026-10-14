/** Select de status (ativos/inativos/todos) para usar dentro do SearchBar (GET ?status=). */
export function StatusFilter({ value }: { value?: string }) {
  return (
    <select
      name="status"
      defaultValue={value ?? ""}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
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
