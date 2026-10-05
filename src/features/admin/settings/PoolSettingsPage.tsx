import { useState, type FormEvent } from 'react';
import type { PoolConfig } from '@shared/types';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Panel } from '../../../components/ui/Panel';
import { TextAreaField } from '../../../components/ui/TextAreaField';
import { isValidEmail } from '../../auth/emailLink';
import { useAdminPoolConfig, useSavePoolConfig } from './poolConfigData';

export default function PoolSettingsPage() {
  const query = useAdminPoolConfig();
  if (query.isPending) return <p role="status">Loading settings…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        Settings didn't load. Check your connection and refresh.
      </p>
    );
  }
  return <PoolSettingsForm initial={query.data.config} saved={query.data.saved} />;
}

function PoolSettingsForm({ initial, saved }: { initial: PoolConfig; saved: boolean }) {
  const save = useSavePoolConfig();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<{ etransferEmail?: string; contactEmail?: string }>({});
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const e: typeof errors = {};
    if (!isValidEmail(form.etransferEmail))
      e.etransferEmail = 'Enter the email players send e-Transfers to.';
    if (!isValidEmail(form.contactEmail))
      e.contactEmail = 'Enter the email players can contact the pool at.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setMessage(null);
    try {
      await save.mutateAsync({
        ...form,
        etransferEmail: form.etransferEmail.trim(),
        contactEmail: form.contactEmail.trim(),
        etransferInstructions: form.etransferInstructions.trim(),
      });
      setMessage('Settings saved. Players see the new details right away.');
    } catch {
      setMessage("Settings didn't save. Check your connection and try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-player flex-col gap-4">
      <h1 className="font-heading text-h2">Pool settings</h1>
      {!saved && (
        <p className="rounded-md bg-surface-tint p-3 text-body">
          These settings haven't been saved yet. Players see the values below until you save.
        </p>
      )}
      <Panel>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="e-Transfer email"
            hint="Shown to players who choose e-Transfer, with a Copy button."
            type="email"
            value={form.etransferEmail}
            onChange={(e) => setForm({ ...form, etransferEmail: e.target.value })}
            error={errors.etransferEmail}
          />
          <TextAreaField
            label="Extra e-Transfer note (optional)"
            hint='Shown under the address, like "Use the password TUNAS if asked."'
            rows={3}
            value={form.etransferInstructions}
            onChange={(e) => setForm({ ...form, etransferInstructions: e.target.value })}
          />
          <Field
            label="Contact email"
            hint="Where players can reach the pool."
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            error={errors.contactEmail}
          />
          <p className="text-body-sm text-ink-muted">
            Entry fee ${(form.entryFeeCents / 100).toFixed(0)}. Tied games count as no win, and only
            paid entries can win.
          </p>
          {message && (
            <p role="status" className="font-semibold text-ink-emphasis">
              {message}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
