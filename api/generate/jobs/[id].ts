import { createClient } from "@supabase/supabase-js";
import { getKaggleKernelStatus, getKaggleKernelOutput } from "../../lib/kaggleClient";

export const config = {
  maxDuration: 60,
};

function getSupabaseAdmin() {
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
    return res.status(404).json({ error: "Trabajo no encontrado o expirado." });
  }

  // 1. Si ya está completado
  if (job.status === "done") {
    return res.status(200).json({
      success: true,
      jobId: job.id,
      status: "done",
      done: true,
      imageUrl: job.kind === "image" ? job.output_url : undefined,
      videoUrl: job.kind === "video" ? job.output_url : undefined,
    });
  }

  // 2. Si ya falló
  if (job.status === "error") {
    return res.status(200).json({
      success: false,
      jobId: job.id,
      status: "error",
      error: job.error || "El trabajo falló.",
    });
  }

  // 3. Si es un trabajo de Kaggle, consultamos el kernel
  if (job.provider === "kaggle" && job.kernel_ref) {
    try {
      const parts = job.kernel_ref.split("/");
      const userName = parts[0] || "wilycol";
      const kernelSlug = parts[1] || "clonecinema-flux-image";

      const kaggleStatus = await getKaggleKernelStatus({ userName, kernelSlug });

      if (kaggleStatus === "ERROR" || kaggleStatus === "CANCELLED") {
        await supabase
          .from("ai_jobs")
          .update({ status: "error", error: "El kernel de GPU en Kaggle reportó un fallo." })
          .eq("id", job.id);

        return res.status(200).json({
          success: false,
          jobId: job.id,
          status: "error",
          error: "El kernel de GPU en Kaggle reportó un fallo.",
        });
      }

      if (kaggleStatus === "COMPLETE") {
        const output = await getKaggleKernelOutput({ userName, kernelSlug });
        const files = output.files || [];

        const resultJsonFile = files.find((f) => f.fileName === "result.json");
        let matchesJobId = false;

        if (resultJsonFile?.url) {
          try {
            const metaRes = await fetch(resultJsonFile.url);
            if (metaRes.ok) {
              const meta = await metaRes.json();
              if (meta?.job_id === job.id) {
                matchesJobId = true;
              }
            }
          } catch (metaErr) {
            console.warn("[Kaggle result.json read warning]:", metaErr);
          }
        }

        // Si el artefacto disponible corresponde a esta tarea específica
        if (matchesJobId) {
          const imgFile = files.find((f) => f.fileName === "output_image.png");
          if (imgFile?.url) {
            const imgRes = await fetch(imgFile.url);
            if (imgRes.ok) {
              const arrayBuffer = await imgRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              const storageFilename = `keyframe_${job.id}.png`;
              const { error: uploadError } = await supabase.storage
                .from("keyframes")
                .upload(storageFilename, buffer, {
                  contentType: "image/png",
                  upsert: true,
                });

              let publicUrl = imgFile.url;
              if (!uploadError) {
                const { data: pubData } = supabase.storage
                  .from("keyframes")
                  .getPublicUrl(storageFilename);
                if (pubData?.publicUrl) {
                  publicUrl = pubData.publicUrl;
                }
              }

              await supabase
                .from("ai_jobs")
                .update({
                  status: "done",
                  output_url: publicUrl,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);

              return res.status(200).json({
                success: true,
                jobId: job.id,
                status: "done",
                done: true,
                imageUrl: publicUrl,
              });
            }
          }
        }

        // Kaggle está completando o escribiendo los archivos finales
        return res.status(200).json({
          success: true,
          jobId: job.id,
          status: "running",
          done: false,
        });
      }

      // Estado en curso (QUEUED / RUNNING)
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
}
