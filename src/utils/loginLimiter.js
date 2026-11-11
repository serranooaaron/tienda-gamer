// Límite de intentos de login fallidos, en memoria del proceso (alcanza para una sola instancia).
// Cuenta dos cosas por ventana de tiempo:
// - fallos de una IP contra un mismo email: frena a quien prueba contraseñas de una cuenta;
// - fallos totales de una IP: frena a quien prueba muchas cuentas con contraseñas comunes.
// Un login correcto limpia el contador de esa cuenta. Se cuenta por IP + email y no solo por email
// para que un tercero no pueda bloquearle el acceso al dueño de la cuenta desde otra conexión.

const MINUTE = 60 * 1000;

export const createLoginLimiter = ({ windowMs = 15 * MINUTE, maxPerAccount = 5, maxPerIp = 30, now = Date.now } = {}) => {
  const hits = new Map();

  const keysOf = (req) => {
    const ip = req.ip || "sin-ip";
    const email = String(req.body?.email ?? "").toLowerCase().trim().slice(0, 254);
    return [
      { key: `cuenta:${ip}:${email}`, max: maxPerAccount },
      { key: `ip:${ip}`, max: maxPerIp },
    ];
  };

  const active = (key) => {
    const entry = hits.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now()) {
      hits.delete(key);
      return null;
    }
    return entry;
  };

  // Barre entradas vencidas cada tanto para que el mapa no crezca sin límite.
  const prune = () => {
    if (hits.size < 5000) return;
    for (const key of hits.keys()) active(key);
  };

  // Segundos que faltan para poder intentar de nuevo, o 0 si no hay bloqueo.
  const retryAfter = (req) => {
    const blocked = keysOf(req)
      .map(({ key, max }) => ({ entry: active(key), max }))
      .filter(({ entry, max }) => entry && entry.count >= max)
      .map(({ entry }) => entry.resetAt - now());
    return blocked.length ? Math.ceil(Math.max(...blocked) / 1000) : 0;
  };

  const fail = (req) => {
    prune();
    for (const { key } of keysOf(req)) {
      const entry = active(key);
      if (entry) entry.count += 1;
      else hits.set(key, { count: 1, resetAt: now() + windowMs });
    }
  };

  const succeed = (req) => hits.delete(keysOf(req)[0].key);

  return { retryAfter, fail, succeed, clear: () => hits.clear() };
};

export const loginLimiter = createLoginLimiter();

// Mensaje para el usuario: "1 minuto" o "N minutos".
export const waitMessage = (seconds) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Demasiados intentos fallidos. Prueba de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
};
