'use client';

import { Select } from '@/components/ui/Select';
import { Tone } from '@/lib/types';

const TONES: Tone[] = ['professional', 'casual', 'technical', 'persuasive', 'formal', 'playful'];

const TONE_OPTIONS = TONES.map((tone) => ({
  value: tone,
  label: tone.charAt(0).toUpperCase() + tone.slice(1),
}));

export function ToneSelector({
  value,
  onChange,
}: {
  value: Tone;
  onChange: (tone: Tone) => void;
}) {
  return (
    <Select
      options={TONE_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as Tone)}
      aria-label="Response tone"
      size="sm"
      className="w-40"
    />
  );
}
