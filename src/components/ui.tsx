import React from "react";
import { Download } from "lucide-react";

export function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-zinc-100">{title}</h3>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500">
        {icon}
      </div>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export const FORMAT_CLASS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
};

export function ImageLightbox({
  src,
  title,
  subtitle,
  action,
  onClose,
}: {
  src: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const cleanTitle = (title || "clonecinema-image")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .slice(0, 50);
      const filename = `${cleanTitle}.png`;

      if (src.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = src;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const res = await fetch(src);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch {
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md transition-all animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 p-2.5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controles de cabecera */}
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex h-9 items-center gap-1.5 rounded-full bg-black/80 px-3.5 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-xl backdrop-blur transition hover:scale-105 hover:border-signal/50 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
            title="Descargar imagen a tu ordenador"
          >
            <Download size={13} className="text-signal" />
            <span>{downloading ? "Descargando..." : "Descargar"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-xl backdrop-blur transition hover:scale-105 cursor-pointer"
            title="Cerrar (Esc)"
          >
            <span className="text-lg font-bold leading-none">&times;</span>
          </button>
        </div>

        <div className="flex flex-col items-center">
          <img
            src={src}
            alt={title || "Imagen ampliada"}
            className="max-h-[80vh] max-w-[88vw] rounded-xl object-contain shadow-2xl"
          />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 w-full px-4">
            {(title || subtitle) ? (
              <div className="text-left">
                {title && <h4 className="text-[13px] font-bold text-zinc-100">{title}</h4>}
                {subtitle && <p className="text-[11px] text-zinc-400 mt-0.5">{subtitle}</p>}
              </div>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-800/90 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:text-white hover:bg-zinc-700 hover:border-signal/50 transition shadow cursor-pointer disabled:opacity-50"
              >
                <Download size={12} className="text-signal" />
                <span>{downloading ? "Descargando..." : "Guardar imagen"}</span>
              </button>
              {action && <div>{action}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
