import "server-only";

/** API pública do módulo comercial: o que outros módulos podem chamar (regras e escrita ficam aqui). */
export { registrarConsumoCirurgiaTx, type ItemConsumo } from "./consumo-servico";
