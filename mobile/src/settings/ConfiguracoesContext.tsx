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

import { falar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { obterCores, type ModoTema, type PaletaCores } from "../theme/tema";
import { definirConfig, obterConfig } from "./atual";
import { normalizar, PADRAO, type Configuracoes } from "./tipos";

// O sufixo v1 permite migrar o formato no futuro sem quebrar dados já salvos
const CHAVE = "farol:config:v1";

type Valor = {
  config: Configuracoes;
  cores: PaletaCores;
  tema: ModoTema;
  altoContraste: boolean;
  alternarTema: () => void;
  atualizar: (parcial: Partial<Configuracoes>) => void;
  restaurarPadroes: () => void;
};

const VALOR_PADRAO: Valor = {
  config: PADRAO,
  cores: obterCores(PADRAO.tema, PADRAO.altoContraste),
  tema: PADRAO.tema,
  altoContraste: PADRAO.altoContraste,
  alternarTema: () => {},
  atualizar: () => {},
  restaurarPadroes: () => {},
};

const Contexto = createContext<Valor>(VALOR_PADRAO);

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

  const cores = useMemo(
    () => obterCores(config.tema, config.altoContraste),
    [config.tema, config.altoContraste],
  );

  const alternarTema = useCallback(() => {
    const proximo: ModoTema = config.tema === "escuro" ? "claro" : "escuro";
    atualizar({ tema: proximo });
    vibrar.confirmar();
    falar(proximo === "claro" ? "Tema claro ativado." : "Tema escuro ativado.");
  }, [config.tema, atualizar]);

  const valor = useMemo(
    () => ({
      config,
      cores,
      tema: config.tema,
      altoContraste: config.altoContraste,
      alternarTema,
      atualizar,
      restaurarPadroes,
    }),
    [config, cores, alternarTema, atualizar, restaurarPadroes],
  );

  return (
    <Contexto.Provider value={valor}>
      {!pronto ? <View style={{ flex: 1, backgroundColor: cores.fundo }} /> : children}
    </Contexto.Provider>
  );
}

export function useConfig(): Valor {
  const valor = useContext(Contexto);
  return valor ?? VALOR_PADRAO;
}

export function useTema(): Valor {
  return useConfig();
}