'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  language: string;
  code: string;
}

export default function CodeBlock({ title, language, code }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs uppercase tracking-wide">
        <span>{title}</span>
        <Button size="sm" variant="ghost" onClick={copy} className="text-xs text-slate-300 hover:bg-slate-800">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
