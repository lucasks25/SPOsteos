/** Esqueleto enquanto a tela carrega: mantém o espaço e evita o salto de layout. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Carregando">
      <div className="space-y-2">
        <div className="h-6 w-56 rounded bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-200/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 border-b border-slate-100 p-3 last:border-0">
            <div className="h-4 w-1/6 rounded bg-slate-200/70" />
            <div className="h-4 w-2/5 rounded bg-slate-200/70" />
            <div className="h-4 w-1/6 rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
