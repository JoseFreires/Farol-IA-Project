import type { CameraView } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";

import { LARGURA_FOTO, type QualidadeFoto } from "../settings/tipos";

// Tira a foto e devolve o endereço (uri) de um JPEG já reduzido para envio.
// A captura sai sem compressão e é comprimida uma única vez, ao redimensionar.
export async function capturarFoto(
  camera: CameraView | null,
  qualidade: QualidadeFoto,
): Promise<string> {
  if (!camera) throw new Error("A câmera não está pronta.");

  const foto = await camera.takePictureAsync({ quality: 1 });
  if (!foto?.uri) throw new Error("Não foi possível capturar a foto.");

  const reduzida = await ImageManipulator.manipulateAsync(
    foto.uri,
    [{ resize: { width: LARGURA_FOTO[qualidade] } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return reduzida.uri;
}