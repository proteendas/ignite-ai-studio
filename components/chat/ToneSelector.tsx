'use client';

import { Tone } from '@/lib/types';

const TONES: Tone[] = ['professional', 'casual', 'technical', 'persuasive', 'formal', 'playful'];

export function ToneSelector({
  value,
  onChange,
}: {
  value: Tone;
  onChange: (tone: Tone) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Tone)}
      aria-label="Response tone"
      className="focus-ignite rounded-md border border-surface-3 bg-surface-2 px-2 py-1.5 text-sm text-content"
    >
      {TONES.map((tone) => (
        <option key={tone} value={tone}>
          {tone.charAt(0).toUpperCase() + tone.slice(1)}
        </option>
      ))}
    </select>
  );
}
