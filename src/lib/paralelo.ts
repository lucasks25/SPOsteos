/**
 * Promise.all com no máximo `limite` tarefas rodando ao mesmo tempo (as demais esperam a vez), mantendo a ordem dos
 * resultados. Uso: telas que disparam muitas consultas de uma vez (painel, busca) não ocupam o pool inteiro e deixam
 * conexão livre para as transações dos outros usuários. Recebe funções (e não promises) para que só comecem na vez delas.
 */
export async function emParalelo<const T extends readonly (() => Promise<unknown>)[]>(
  tarefas: T,
  limite = 4,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const resultados: unknown[] = new Array(tarefas.length);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < tarefas.length) {
      const i = proxima++;
      resultados[i] = await tarefas[i]();
    }
  };
  const n = Math.max(1, Math.min(limite, tarefas.length));
  await Promise.all(Array.from({ length: n }, trabalhador));
  return resultados as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
