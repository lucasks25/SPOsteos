import "server-only";

/** API pública do módulo estoque: o que outros módulos podem chamar. Hoje só leituras para o painel e o sino (ARQ-05).
 * (O financeiro lê o "a cobrar" do inventário direto na tabela, ADR-2: importar daqui fecharia o ciclo estoque → comercial → financeiro.) */
export { contarRemessasAConferir, contarAbaixoDoMinimo, contarCirurgiasAguardandoVale } from "./leitura-painel";
