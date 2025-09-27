'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/utils';

interface Settings {
  accountId: string;
  businessHours: { timezone: string; weeklySchedule: Record<string, string> };
  webhookIntegrations: { name: string; url: string }[];
  defaultAgentAvailability: boolean;
}

export default function SettingsPage() {
  const token = typeof window === 'undefined' ? undefined : localStorage.getItem('agentToken') ?? '';
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/settings/default`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setSettings(data.settings))
      .catch(() =>
        setSettings({
          accountId: 'default',
          businessHours: { timezone: 'UTC', weeklySchedule: {} },
          webhookIntegrations: [],
          defaultAgentAvailability: true
        })
      );
  }, [token]);

  const updateSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    await fetch(`${apiUrl}/settings/${settings.accountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(settings)
    });
    setSaving(false);
  };

  if (!settings) {
    return <div className="text-sm text-slate-500">Loading settings…</div>;
  }

  return (
    <form onSubmit={updateSettings} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Agent availability</h2>
        <p className="text-xs text-slate-500">Toggle default availability for new agents.</p>
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={settings.defaultAgentAvailability}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, defaultAgentAvailability: event.target.checked } : prev
              )
            }
            className="h-4 w-4"
          />
          Agents are available by default
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Business hours</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Timezone</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={settings.businessHours.timezone}
              onChange={(event) =>
                setSettings((prev) =>
                  prev
                    ? { ...prev, businessHours: { ...prev.businessHours, timezone: event.target.value } }
                    : prev
                )
              }
            />
          </div>
          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => (
            <div key={day}>
              <label className="text-xs font-medium text-slate-600 capitalize">{day}</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.businessHours.weeklySchedule?.[day] ?? '09:00-17:00'}
                onChange={(event) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          businessHours: {
                            ...prev.businessHours,
                            weeklySchedule: { ...prev.businessHours.weeklySchedule, [day]: event.target.value }
                          }
                        }
                      : prev
                  )
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Webhook integrations</h2>
        <p className="text-xs text-slate-500">Notify external systems when events occur.</p>
        <div className="mt-4 space-y-3">
          {settings.webhookIntegrations.map((integration, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800">{integration.name}</div>
              <div className="text-xs text-slate-500">{integration.url}</div>
            </div>
          ))}
          {settings.webhookIntegrations.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No webhooks configured
            </div>
          )}
        </div>
      </section>

      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
