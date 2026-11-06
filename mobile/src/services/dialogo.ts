import { motorEscuta } from "./escuta";
import { gerenciadorFala } from "./gerenciadorFala";

// Fala uma instrução com prioridade de sistema, sem colidir com a escuta do app
export async function dizer(texto: string): Promise<boolean> {
  await motorEscuta.pausar();
  const terminou = await gerenciadorFala.falarInstrucao(texto, true);
  if (terminou) await motorEscuta.retomar();
  return terminou;
}

// Interrompe qualquer fala e devolve o microfone para a escuta da palavra "Farol"
export function calar(): void {
  gerenciadorFala.calar();
  motorEscuta.retomar();
}
