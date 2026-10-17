import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { cores } from "../theme/tema";
import { definirConfig, obterConfig } from "./atual";
import { normalizar, PADRAO, type Configuracoes } from "./tipos";

// O sufixo v1 permite migrar o formato no futuro sem quebrar dados já salvos
const CHAVE = "farol:config:v1";

type Valor = {
  config: Configuracoes;
  atualizar: (parcial: Partial<Configuracoes>) => void;
  restaurarPadroes: () => void;
};

const Contexto = createContext<Valor | null>(null);

export function ConfiguracoesProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Configuracoes>(PADRAO);
  const [pronto, setPronto] = useState(false);

  // Carrega as preferências salvas ao abrir o app
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE);
        const carregada = normalizar(bruto ? JSON.parse(bruto) : null);
        if (ativo) {
          definirConfig(carregada);
          setConfig(carregada);
        }
      } catch {
        // Armazenamento vazio ou corrompido: segue com os padrões
      } finally {
        if (ativo) setPronto(true);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const salvar = useCallback((nova: Configuracoes) => {
    definirConfig(nova); // vale na hora para os serviços
    setConfig(nova); // atualiza as telas
    AsyncStorage.setItem(CHAVE, JSON.stringify(nova)).catch(() => {});
  }, []);

  const atualizar = useCallback(
    (parcial: Partial<Configuracoes>) => salvar(normalizar({ ...obterConfig(), ...parcial })),
    [salvar],
  );

  const restaurarPadroes = useCallback(() => salvar(PADRAO), [salvar]);

  const valor = useMemo(
    () => ({ config, atualizar, restaurarPadroes }),
    [config, atualizar, restaurarPadroes],
  );

  // Evita mostrar telas com valores errados no primeiro instante
  if (!pronto) return <View style={{ flex: 1, backgroundColor: cores.fundo }} />;

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useConfig(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useConfig deve ser usado dentro do ConfiguracoesProvider");
  return valor;
}