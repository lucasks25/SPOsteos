"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="font-semibold text-rose-800">Não foi possível carregar esta tela</h2>
      <p className="mt-1 text-sm text-rose-700">{error.message}</p>
      <button onClick={reset} className="mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-sm text-white">Tentar novamente</button>
    </div>
  );
}
