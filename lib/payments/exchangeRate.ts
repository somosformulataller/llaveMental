// Tasa oficial BCV vía dolarapi.com (la web del BCV falla TLS desde
// servidores; dolarapi replica el mismo valor oficial). Caché de 1 h
// y timeout de 5 s. Si falla, se reintenta una vez y luego null:
// la UI simplemente no muestra el equivalente en Bs.

const DOLARAPI_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

export interface ExchangeRate {
  rate: number;
  source: 'bcv';
  fetchedAt: string;
}

export async function fetchExchangeRate(): Promise<ExchangeRate> {
  const res = await fetch(DOLARAPI_URL, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.promedio);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tasa inválida');
  return {
    rate,
    source: 'bcv',
    fetchedAt: data?.fechaActualizacion ?? new Date().toISOString(),
  };
}

export async function fetchExchangeRateSafe(): Promise<ExchangeRate | null> {
  try {
    return await fetchExchangeRate();
  } catch {
    try {
      return await fetchExchangeRate();
    } catch {
      return null;
    }
  }
}
