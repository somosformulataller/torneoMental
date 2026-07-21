import { fetchExchangeRate } from '@/lib/exchangeRate';

export async function GET() {
  try {
    const result = await fetchExchangeRate();
    return Response.json(result);
  } catch {
    try {
      const result = await fetchExchangeRate();
      return Response.json(result);
    } catch {
      return Response.json({ rate: null, source: null, updatedAt: null, error: true });
    }
  }
}
