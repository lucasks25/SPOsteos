/**
 * EXCEÇÕES TEMPORÁRIAS do verificador de arquitetura (scripts/verificar-arquitetura.ts).
 *
 * É a dívida existente em 16/10/2026, congelada para o repositório seguir verde enquanto o backlog de
 * docs/ARQUITETURA.md é executado. Regras:
 *  - NÃO acrescente linhas para fazer uma violação nova passar. Corrija o código (kernel, publico.ts ou mover a tela).
 *  - Ao executar um item do backlog, apague as linhas dele; exceção que deixou de acontecer FALHA o verificador.
 *  - Ciclo: a linha descreve o conjunto de módulos do ciclo. Quando ele encolher, troque pela linha nova que o
 *    verificador imprimir (nunca por um conjunto maior).
 */
export type Excecao = { regra: string; de: string; para: string; item: string };

export const EXCECOES: readonly Excecao[] = [
];
