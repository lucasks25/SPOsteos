/**
 * Erro de regra de negócio: a mensagem foi escrita para o usuário e pode ser exibida na tela.
 * Qualquer outro erro (banco, sistema de arquivos, bug) é tratado como inesperado por `errorMessage()`
 * e só aparece no log do servidor, para não vazar detalhes internos.
 */
export class ErroNegocio extends Error {}
