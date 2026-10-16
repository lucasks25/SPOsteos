import "server-only";

/** API pública do módulo estoque: o que outros módulos podem chamar. Hoje só leituras para o painel e o sino (ARQ-05). */
export { contarRemessasAConferir, contarAbaixoDoMinimo } from "./leitura-painel";
