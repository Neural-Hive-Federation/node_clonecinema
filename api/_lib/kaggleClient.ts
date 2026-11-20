/**
 * Cliente HTTP directo para la API de Kaggle.
 * Ejecuta notebooks y scripts en GPUs gratuitas (NVIDIA T4 x2) sin requerir Python ni CLI local.
 */

export interface KaggleSessionStatus {
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "ERROR" | "CANCELLED" | string;
}

export interface KaggleOutputFile {
  fileName: string;
  url: string;
}

export interface KaggleOutputResponse {
  files?: KaggleOutputFile[];
  log?: string;
}

const KAGGLE_API_BASE = "https://api.kaggle.com/v1";

function getKaggleAuthHeaders(): HeadersInit {
  const token =
    process.env.KAGGLE_KEY ||
    process.env.KAGGLE_API_TOKEN ||
    "";

  if (!token) {
    throw new Error(
      "Kaggle API token no configurado. Define KAGGLE_KEY en las variables de entorno."
    );
  }

  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  };
}

export async function pushKaggleScript(params: {
  slug: string;
  title: string;
  text: string;
  enableGpu?: boolean;
}): Promise<{ ref: string; versionNumber: number }> {
  const headers = getKaggleAuthHeaders();

  const body = {
    slug: params.slug,
    newTitle: params.title,
    text: params.text,
    language: "python",
    kernelType: "script",
    isPrivate: true,
    enableGpu: params.enableGpu !== false,
    enableInternet: true,
  };

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/SaveKernel`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle SaveKernel error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  return {
    ref: data.ref || params.slug,
    versionNumber: data.versionNumber,
  };
}

export async function getKaggleKernelStatus(params: {
  userName: string;
  kernelSlug: string;
}): Promise<string> {
  const headers = getKaggleAuthHeaders();

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/GetKernelSessionStatus`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userName: params.userName,
      kernelSlug: params.kernelSlug,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle GetStatus error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as KaggleSessionStatus;
  return data.status || "QUEUED";
}

export async function getKaggleKernelOutput(params: {
  userName: string;
  kernelSlug: string;
}): Promise<KaggleOutputResponse> {
  const headers = getKaggleAuthHeaders();

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/ListKernelSessionOutput`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userName: params.userName,
      kernelSlug: params.kernelSlug,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle ListOutput error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  return (await res.json()) as KaggleOutputResponse;
}
