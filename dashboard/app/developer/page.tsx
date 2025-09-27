import CodeBlock from '@/components/developer/code-block';
import SDKTabs from '@/components/developer/sdk-tabs';

const reactNativeInstall = `npm install @kalporg/support-sdk`;
const reactNativeUsage = `import { KalpOrg } from "@kalporg/support-sdk";

export default function App() {
  return <KalpOrg apiKey="YOUR_API_KEY" />;
}`;

const webSnippet = `<script src="https://cdn.rapydsupport.com/widget.js" data-key="API_KEY"></script>`;

export default function DeveloperPage() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-slate-900">Developer integrations</h2>
        <p className="text-sm text-slate-500">Copy-and-paste SDK snippets to embed support into your product.</p>
      </header>
      <SDKTabs
        tabs={[
          {
            id: 'react-native',
            label: 'React Native',
            content: (
              <div className="space-y-4">
                <CodeBlock title="Install" language="bash" code={reactNativeInstall} />
                <CodeBlock title="Usage" language="tsx" code={reactNativeUsage} />
              </div>
            )
          },
          {
            id: 'web',
            label: 'Web widget',
            content: <CodeBlock title="Embed" language="html" code={webSnippet} />
          }
        ]}
      />
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Webhook events</h3>
        <p className="text-sm text-slate-500">
          Subscribe to webhook events to sync ticket, chat, and call state with your internal tools. Configure targets under
          Settings → Webhooks.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li><strong>chat.message.created</strong> – Fires when a message is sent via REST or sockets.</li>
          <li><strong>ticket.created</strong> – Triggered on ticket creation.</li>
          <li><strong>call.started</strong> – Fired when an agent initiates a call.</li>
        </ul>
      </section>
    </div>
  );
}
