import { PADRAO, type Configuracoes } from "./tipos";

let atual: Configuracoes = PADRAO;

export function obterConfig(): Configuracoes {
  return atual;
}

export function definirConfig(nova: Configuracoes): void {
  atual = nova;
}