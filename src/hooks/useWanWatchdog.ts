import { useEffect, useRef, useState } from "react";

export function useWanWatchdog(idleTimeoutMinutes = 10) {
  const [showModal, setShowModal] = useState(false);
  const [isWanOnline, setIsWanOnline] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;

  // Actualizar última actividad del usuario en cualquier interacción
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);
    window.addEventListener("scroll", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
    };
  }, []);

  // Revisión periódica de inactividad
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const idleTime = now - lastActivityRef.current;

      // Si ha pasado el tiempo de inactividad y el modal no está ya abierto
      if (idleTime >= idleTimeoutMs && !showModal) {
        try {
          const res = await fetch("/api/wan/status");
          if (res.ok) {
            const data = await res.json();
            if (data.online) {
              setIsWanOnline(true);
              setShowModal(true);
            }
          }
        } catch {
          // Ignorar fallos de red esporádicos
        }
      }
    }, 20000); // Chequeo cada 20 segundos

    return () => clearInterval(interval);
  }, [idleTimeoutMs, showModal]);

  const handleExtendSession = async () => {
    try {
      await fetch("/api/wan/keepalive", { method: "POST" });
    } catch {}
    lastActivityRef.current = Date.now();
    setShowModal(false);
  };

  const handleShutdown = async () => {
    try {
      await fetch("/api/wan/shutdown", { method: "POST" });
    } catch {}
    lastActivityRef.current = Date.now();
    setShowModal(false);
  };

  return {
    showModal,
    isWanOnline,
    handleExtendSession,
    handleShutdown,
  };
}
