/** Esqueleto enquanto a tela carrega: cabeçalho, faixa única de indicadores e tabela, no mesmo desenho das telas (sem salto de layout). */
export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Carregando">
      <div className="mb-4 space-y-2">
        <div className="h-3 w-20 rounded bg-slate-200/70" />
        <div className="h-6 w-56 rounded bg-slate-200" />
      </div>
      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-l border-slate-200 px-4 py-3 first:border-l-0 max-lg:[&:nth-child(odd)]:border-l-0">
            <div className="h-3 w-24 rounded bg-slate-200/70" />
            <div className="h-5 w-20 rounded bg-slate-200" />
            <div className="h-3 w-28 rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-8 border-b border-slate-200 bg-slate-50" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-2 last:border-0">
            <div className="h-3.5 w-1/6 rounded bg-slate-200/70" />
            <div className="h-3.5 w-2/5 rounded bg-slate-200/70" />
            <div className="h-3.5 w-1/6 rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
