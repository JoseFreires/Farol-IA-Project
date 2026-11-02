import { motorEscuta } from "./escuta";
import { aguardarFimDaFala, falar, parar } from "./fala";

// Fala em voz alta SEM o microfone ouvir a própria voz do app.
// Pausa a escuta, fala e só retoma quando a fala (e as enfileiradas) terminarem.
export async function dizer(texto: string): Promise<void> {
  motorEscuta.pausar();
  falar(texto);
  await aguardarFimDaFala(180_000); // descrições longas levam mais de 1 minuto
  motorEscuta.retomar();
}

// Interrompe qualquer fala e devolve o microfone para a escuta da palavra "Farol"
export function calar(): void {
  parar();
  motorEscuta.retomar();
}
