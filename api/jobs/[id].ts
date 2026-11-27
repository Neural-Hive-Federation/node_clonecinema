import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

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

async function getKaggleKernelStatus(params: {
  userName: string;
  kernelSlug: string;
  versionNumber?: number;
}): Promise<string> {
  const headers = getKaggleAuthHeaders();

  const body: any = {
    userName: params.userName,
    kernelSlug: params.kernelSlug,
  };
  if (params.versionNumber) {
    body.versionNumber = params.versionNumber;
  }

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/GetKernelSessionStatus`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle GetStatus error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  return data.status || "QUEUED";
}

async function getKaggleKernelOutput(params: {
  userName: string;
  kernelSlug: string;
  versionNumber?: number;
}): Promise<{ files?: { fileName: string; url: string }[]; log?: string }> {
  const headers = getKaggleAuthHeaders();

  const body: any = {
    userName: params.userName,
    kernelSlug: params.kernelSlug,
  };
  if (params.versionNumber) {
    body.versionNumber = params.versionNumber;
  }

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/ListKernelSessionOutput`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle ListOutput error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  return (await res.json()) as any;
}

function getSupabaseAdmin() {
  if (typeof (globalThis as any).WebSocket === "undefined") {
    (globalThis as any).WebSocket = class {};
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error("Supabase credentials no configuradas en el entorno.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: any, res: any) {
  try {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Falta el id del trabajo." });
    }

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobErr } = await supabase
      .from("ai_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (jobErr) {
      console.error("[jobs/[id] Query Error]:", jobErr);
      return res.status(500).json({ error: "Error consultando el trabajo en base de datos." });
    }

    if (!job) {
      // Si la tarea aún no se sincroniza o es muy reciente, responder en cola para no romper el sondeo del frontend
      return res.status(200).json({
        success: true,
        jobId: id,
        status: "queued",
        done: false,
      });
    }

    // 1. Si ya está completado
    if (job.status === "done") {
      let allUrls: string[] = [];
      if (job.output_url) {
        if (job.output_url.startsWith("[")) {
          try {
            allUrls = JSON.parse(job.output_url);
          } catch {
            allUrls = [job.output_url];
          }
        } else {
          allUrls = [job.output_url];
        }
      }

      const primaryUrl = allUrls[0] || job.output_url;

      return res.status(200).json({
        success: true,
        jobId: job.id,
        status: "done",
        done: true,
        imageUrl: job.kind === "image" ? primaryUrl : undefined,
        imageUrls: job.kind === "image" && allUrls.length > 0 ? allUrls : undefined,
        videoUrl: job.kind === "video" ? job.output_url : undefined,
      });
    }

    // 2. Si ya falló
    if (job.status === "error") {
      return res.status(200).json({
        success: false,
        jobId: job.id,
        status: "error",
        done: true,
        error: job.error || "La generación falló.",
      });
    }

    // 2.5. Si es un trabajo del Servidor Caliente Wan 2.1 ComfyUI
    if (job.provider === "wan22_tunnel") {
      const { data: gw } = await supabase
        .from("ai_jobs")
        .select("input_url")
        .eq("id", "a0000000-0000-0000-0000-000000000001")
        .maybeSingle();

      const tunnelUrl = gw?.input_url?.trim().replace(/\/+$/, "");
      if (!tunnelUrl || !job.kernel_ref) {
        return res.status(200).json({
          success: true,
          jobId: job.id,
          status: "running",
          done: false,
        });
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const histRes = await fetch(`${tunnelUrl}/history/${encodeURIComponent(job.kernel_ref)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (histRes.ok) {
          const histData = (await histRes.json()) as any;
          const promptHist = histData[job.kernel_ref];
          if (promptHist && promptHist.outputs) {
            let foundMedia: { filename: string; subfolder?: string; type?: string } | null = null;
            for (const nodeId of Object.keys(promptHist.outputs)) {
              const nodeOut = promptHist.outputs[nodeId];
              const files = nodeOut.gifs || nodeOut.videos || nodeOut.images;
              if (Array.isArray(files) && files.length > 0) {
                foundMedia = files[0];
                break;
              }
            }

            if (foundMedia && foundMedia.filename) {
              const downloadUrl = `${tunnelUrl}/view?filename=${encodeURIComponent(foundMedia.filename)}&subfolder=${encodeURIComponent(foundMedia.subfolder || "")}&type=${encodeURIComponent(foundMedia.type || "output")}`;
              const fileRes = await fetch(downloadUrl);
              if (fileRes.ok) {
                const buf = Buffer.from(await fileRes.arrayBuffer());
                const ext = foundMedia.filename.split(".").pop() || "webp";
                const isWebp = ext.toLowerCase() === "webp";
                const isMp4 = ext.toLowerCase() === "mp4";
                const contentType = isWebp ? "image/webp" : isMp4 ? "video/mp4" : "video/webm";
                const filename = `comfy_video_${job.id}_${Date.now()}.${ext}`;

                await supabase.storage.from("videos").upload(filename, buf, {
                  contentType,
                  upsert: true,
                });

                const { data: pubData } = supabase.storage.from("videos").getPublicUrl(filename);
                const finalUrl = pubData?.publicUrl || downloadUrl;

                await supabase
                  .from("ai_jobs")
                  .update({
                    status: "done",
                    output_url: finalUrl,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", job.id);

                return res.status(200).json({
                  success: true,
                  jobId: job.id,
                  status: "done",
                  done: true,
                  videoUrl: finalUrl,
                });
              }
            }
          }
        }
      } catch (comfyPollErr: any) {
        console.warn("[ComfyUI Poll Warning]:", comfyPollErr?.message || comfyPollErr);
      }

      return res.status(200).json({
        success: true,
        jobId: job.id,
        status: "running",
        done: false,
      });
    }

    // 3. Si es un trabajo de Kaggle, consultamos el estado real del cuaderno
    if (job.provider === "kaggle") {
      const userName = process.env.KAGGLE_USERNAME || "wilycol";
      const [refPart, verPart] = (job.kernel_ref || "").split("@");
      const kernelSlug = refPart ? refPart.split("/").pop()! : "clonecinema-flux-image";
      const versionNumber = verPart ? parseInt(verPart, 10) : undefined;

      try {
        const kStatus = await getKaggleKernelStatus({ userName, kernelSlug, versionNumber });

        if (kStatus === "COMPLETE") {
          const output = await getKaggleKernelOutput({ userName, kernelSlug, versionNumber });

          // Si versionNumber está fijado, el resultado pertenece a esta sesión exacta.
          // Si no está fijado (jobs legacy), validamos con result.json
          const resultFile = output.files?.find((f) => f.fileName === "result.json");
          const jobAgeMs = Date.now() - new Date(job.created_at).getTime();

          if (!versionNumber && resultFile && resultFile.url) {
            try {
              const rjRes = await fetch(resultFile.url);
              if (rjRes.ok) {
                const rjData = (await rjRes.json()) as any;
                if (rjData.job_id && rjData.job_id !== job.id) {
                  if (jobAgeMs < 12 * 60 * 1000) {
                    return res.status(200).json({
                      success: true,
                      jobId: job.id,
                      status: "queued",
                      done: false,
                    });
                  } else {
                    const staleMsg = "La sesión en Kaggle no inició la nueva tarea o la cola fue rechazada.";
                    await supabase
                      .from("ai_jobs")
                      .update({
                        status: "error",
                        error: staleMsg,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", job.id);

                    return res.status(200).json({
                      success: false,
                      jobId: job.id,
                      status: "error",
                      done: true,
                      error: staleMsg,
                    });
                  }
                }
              }
            } catch (rjErr) {
              console.warn("[jobs/[id]] Error verificando result.json:", rjErr);
            }
          }

          const isVideo = job.kind === "video";

          // Para imágenes con múltiples variaciones (e.g. casting de 4 opciones)
          if (!isVideo) {
            const varFiles = (output.files || [])
              .filter((f) => /^output_image_\d+\.png$/.test(f.fileName))
              .sort((a, b) => {
                const numA = parseInt(a.fileName.match(/\d+/)![0], 10);
                const numB = parseInt(b.fileName.match(/\d+/)![0], 10);
                return numA - numB;
              });

            if (varFiles.length > 0) {
              const uploadedUrls: string[] = [];
              for (let i = 0; i < varFiles.length; i++) {
                const vf = varFiles[i];
                try {
                  const vRes = await fetch(vf.url);
                  if (vRes.ok) {
                    const vBuf = Buffer.from(await vRes.arrayBuffer());
                    const vName = `kaggle_${job.id}_var_${i}_${Date.now()}.png`;
                    const { error: vUpErr } = await supabase.storage
                      .from("keyframes")
                      .upload(vName, vBuf, { contentType: "image/png", upsert: true });
                    if (!vUpErr) {
                      const { data: vPub } = supabase.storage.from("keyframes").getPublicUrl(vName);
                      if (vPub?.publicUrl) uploadedUrls.push(vPub.publicUrl);
                    }
                  }
                } catch (e) {
                  console.warn("[jobs/[id]] Error subiendo variacion:", e);
                }
              }

              const finalUrls = uploadedUrls.length > 0 ? uploadedUrls : varFiles.map((f) => f.url);
              await supabase
                .from("ai_jobs")
                .update({
                  status: "done",
                  output_url: JSON.stringify(finalUrls),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);

              return res.status(200).json({
                success: true,
                jobId: job.id,
                status: "done",
                done: true,
                imageUrl: finalUrls[0],
                imageUrls: finalUrls,
              });
            }
          }

          const mediaFile = isVideo
            ? output.files?.find((f) => f.fileName === "output_video.mp4") ||
              output.files?.find((f) => f.fileName.endsWith(".mp4") || f.fileName.endsWith(".webm"))
            : output.files?.find((f) => f.fileName === "output_image.png") ||
              output.files?.find((f) => f.fileName.endsWith(".png") || f.fileName.endsWith(".jpg") || f.fileName.endsWith(".jpeg"));

          if (mediaFile && mediaFile.url) {
            // Descargar de Kaggle y subir permanentemente a Supabase Storage
            const mediaRes = await fetch(mediaFile.url);
            if (!mediaRes.ok) {
              throw new Error(`Error descargando resultado de Kaggle: ${mediaRes.status}`);
            }

            const buf = Buffer.from(await mediaRes.arrayBuffer());
            const bucketName = isVideo ? "videos" : "keyframes";
            const ext = isVideo ? "mp4" : "png";
            const filename = `kaggle_${isVideo ? "video_" : ""}${job.id}_${Date.now()}.${ext}`;

            const { error: upErr } = await supabase.storage
              .from(bucketName)
              .upload(filename, buf, {
                contentType: isVideo ? "video/mp4" : "image/png",
                upsert: true,
              });

            if (upErr) {
              console.error("[Storage Upload Error]:", upErr);
            }

            const { data: pubData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filename);

            const finalUrl = pubData?.publicUrl || mediaFile.url;

            // Actualizar estado del job en base de datos
            await supabase
              .from("ai_jobs")
              .update({
                status: "done",
                output_url: finalUrl,
                updated_at: new Date().toISOString(),
              })
              .eq("id", job.id);

            return res.status(200).json({
              success: true,
              jobId: job.id,
              status: "done",
              done: true,
              imageUrl: !isVideo ? finalUrl : undefined,
              videoUrl: isVideo ? finalUrl : undefined,
            });
          }

          // Si kStatus es COMPLETE pero no se encontró ningún archivo multimedia de salida:
          const failMsg = output.log
            ? `Kaggle terminó sin generar archivo multimedia: ${output.log.slice(-250).replace(/\n/g, " ")}`
            : "Kaggle completó la sesión pero no se generó el archivo de imagen de salida.";
          await supabase
            .from("ai_jobs")
            .update({
              status: "error",
              error: failMsg,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          return res.status(200).json({
            success: false,
            jobId: job.id,
            status: "error",
            done: true,
            error: failMsg,
          });
        }

        if (kStatus === "ERROR" || kStatus === "CANCELLED") {
          await supabase
            .from("ai_jobs")
            .update({
              status: "error",
              error: `El cuaderno de Kaggle finalizó con estado: ${kStatus}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          return res.status(200).json({
            success: false,
            jobId: job.id,
            status: "error",
            done: true,
            error: `El cuaderno de Kaggle finalizó con estado: ${kStatus}`,
          });
        }

        return res.status(200).json({
          success: true,
          jobId: job.id,
          status: "running",
          done: false,
        });
      } catch (kErr: any) {
        console.warn("[Kaggle check error]:", kErr?.message || kErr);
        return res.status(200).json({
          success: true,
          jobId: job.id,
          status: "running",
          done: false,
        });
      }
    }

    return res.status(200).json({
      success: true,
      jobId: job.id,
      status: job.status || "running",
      done: false,
    });
  } catch (globalErr: any) {
    console.error("[jobs/[id] Fatal Handler Error]:", globalErr);
    return res.status(500).json({
      success: false,
      error: globalErr?.message || "Error consultando el estado del trabajo.",
      details: String(globalErr),
    });
  }
}
