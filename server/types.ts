import type { AuthUser } from "./lib/supabase";

export interface RequestBilling {
  /** Créditos descontados en esta petición (0 si el cobro está desactivado). */
  charged: number;
  /** Saldo después del descuento. `null` si no hay base de datos. */
  balance: number | null;
  anonymous: boolean;
  /** Devuelve los créditos si la tarea no llega a ejecutarse. */
  refund: () => Promise<void>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      billing?: RequestBilling;
    }
  }
}

export {};
