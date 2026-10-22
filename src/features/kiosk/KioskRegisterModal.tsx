import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { friendlyError } from '../../lib/errors';
import { isValidPin } from '@shared/kiosk';
import { useRegisterKioskPlayer } from './kioskData';

interface KioskRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (playerId: string, displayName: string, pin: string) => void;
}

export function KioskRegisterModal({ isOpen, onClose, onRegistered }: KioskRegisterModalProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const register = useRegisterKioskPlayer();

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }

    const trimmedContact = contact.trim();
    if (!trimmedContact) {
      setError('Please enter a phone number or email.');
      return;
    }

    if (!isValidPin(pin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match. Please re-enter.');
      return;
    }

    try {
      const res = await register.mutateAsync({
        displayName: trimmedName,
        phoneOrEmail: trimmedContact,
        pin,
      });
      onRegistered(res.playerId, res.displayName, pin);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 id="register-title" className="font-heading text-h3 text-ink">
          New Player Registration
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Join the pool! Your contact info is private and used only for prize payouts and PIN recovery.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field label="Your Name (First & Last Initial)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Big Dave"
              maxLength={60}
              className="input-field"
              required
              autoFocus
            />
          </Field>

          <Field label="Mobile Phone or Email">
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="613-555-0123 or dave@email.com"
              className="input-field"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Choose 4-Digit PIN">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="input-field text-center font-mono text-xl tracking-widest"
                required
              />
            </Field>

            <Field label="Confirm PIN">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="input-field text-center font-mono text-xl tracking-widest"
                required
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-sm font-semibold text-ink-urgent">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-col gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={register.isPending}
            >
              {register.isPending ? 'Registering…' : 'Create Account & Make Picks'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={register.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
