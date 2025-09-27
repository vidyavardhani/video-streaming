import 'server-only';
import { apiUrl } from '@/lib/utils';

interface AnalyticsResponse {
  metrics: {
    chats: number;
    tickets: { open: number; pending: number; hold: number; closed: number };
    calls: { total: number; active: number };
    avgResponseMinutes: number;
  };
}

export async function fetchAnalytics(): Promise<AnalyticsResponse> {
  try {
    const res = await fetch(`${apiUrl}/analytics/summary`, {
      headers: {
        Authorization: `Bearer ${process.env.AGENT_TOKEN ?? ''}`
      },
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Failed to load analytics: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.warn('Falling back to mocked analytics', error);
    return {
      metrics: {
        chats: 42,
        tickets: { open: 7, pending: 9, hold: 2, closed: 103 },
        calls: { total: 18, active: 1 },
        avgResponseMinutes: 2.6
      }
    };
  }
}
