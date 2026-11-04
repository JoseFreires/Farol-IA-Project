import { motorEscuta } from "./escuta";
import { aguardarFimDaFala } from "./fala";
import { gerenciadorFala } from "./gerenciadorFala";

// Fala uma instrução com prioridade de sistema, sem colidir com a escuta do app
export async function dizer(texto: string): Promise<void> {
  await motorEscuta.pausar();
  gerenciadorFala.falarInstrucao(texto, true);
  await aguardarFimDaFala(10_000);
  await motorEscuta.retomar();
}

// Interrompe qualquer fala e devolve o microfone para a escuta da palavra "Farol"
export function calar(): void {
  gerenciadorFala.calar();
  motorEscuta.retomar();
}
