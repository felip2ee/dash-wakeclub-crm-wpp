/** Gravação de áudio do navegador (MediaRecorder) devolvida como base64 + mime. */

function paraBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] ?? "");
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export { paraBase64 };

export async function iniciarGravacao(): Promise<{
  parar(): Promise<{ base64: string; mime: string }>;
  cancelar(): void;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  let gravador: MediaRecorder;
  try {
    gravador = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (erro) {
    stream.getTracks().forEach((t) => t.stop());
    throw erro;
  }
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => partes.push(e.data);
  gravador.start();
  return {
    cancelar: () => stream.getTracks().forEach((t) => t.stop()),
    parar: () =>
      new Promise((resolve, reject) => {
        gravador.onerror = () => reject(new Error("Falha na gravação"));
        gravador.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const mime = gravador.mimeType || "audio/webm";
          resolve({ base64: await paraBase64(new Blob(partes, { type: mime })), mime });
        };
        gravador.stop();
      }),
  };
}
