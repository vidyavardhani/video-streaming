import { MetricCard } from '@/components/charts/metric-card';
import AnalyticsTimeline from '@/components/home/analytics-timeline';
import TicketBreakdown from '@/components/home/ticket-breakdown';
import { fetchAnalytics } from '@/lib/server';

export default async function HomePage() {
  const analytics = await fetchAnalytics();
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total chats" value={analytics.metrics.chats} description="Chats handled across channels" />
        <MetricCard title="Open tickets" value={analytics.metrics.tickets.open} description="Waiting for agent response" />
        <MetricCard title="Active calls" value={analytics.metrics.calls.active} description="Voice/video sessions in progress" />
        <MetricCard
          title="Avg first response"
          value={`${analytics.metrics.avgResponseMinutes}m`}
          description="Median agent response time"
        />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <TicketBreakdown metrics={analytics.metrics.tickets} />
        <AnalyticsTimeline />
      </section>
    </div>
  );
}
