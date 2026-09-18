'use client';

import clsx from 'clsx';
import { Select } from '@/components/ui/Select';
import { ContentType, Tone, Channel } from '@/lib/types';

const CONTENT_TYPES: { value: ContentType; label: string; icon: string }[] = [
  { value: 'social-post', label: 'Social Post', icon: 'bi-megaphone' },
  { value: 'blog-draft', label: 'Blog Draft', icon: 'bi-file-earmark-text' },
  { value: 'ad-copy', label: 'Ad Copy', icon: 'bi-badge-ad' },
  { value: 'email', label: 'Email', icon: 'bi-envelope' },
  { value: 'product-description', label: 'Product Description', icon: 'bi-box-seam' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'formal', label: 'Formal' },
  { value: 'playful', label: 'Playful' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'technical', label: 'Technical' },
];

const CHANNELS: { value: Channel; label: string; icon: string }[] = [
  { value: 'linkedin', label: 'LinkedIn', icon: 'bi-linkedin' },
  { value: 'x', label: 'X', icon: 'bi-twitter-x' },
  { value: 'email', label: 'Email', icon: 'bi-envelope' },
  { value: 'landing-page', label: 'Landing Page', icon: 'bi-globe' },
  { value: 'blog', label: 'Blog', icon: 'bi-journal-text' },
  { value: 'ad-copy', label: 'Ad Placement', icon: 'bi-badge-ad' },
  { value: 'general', label: 'General', icon: 'bi-card-text' },
];

const chipBase =
  'focus-ignite hover-glow inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors';
const chipActive = 'border-ignite bg-ignite/15 text-ignite-light';
const chipIdle = 'border-surface-3 bg-surface-2 text-content-muted hover:text-content hover:border-ignite/50';

export function ToneChannelSelector({
  contentType,
  tone,
  channels,
  onContentTypeChange,
  onToneChange,
  onChannelsChange,
}: {
  contentType: ContentType;
  tone: Tone;
  channels: Channel[];
  onContentTypeChange: (v: ContentType) => void;
  onToneChange: (v: Tone) => void;
  onChannelsChange: (v: Channel[]) => void;
}) {
  const toggleChannel = (ch: Channel) => {
    if (channels.includes(ch)) {
      onChannelsChange(channels.filter((c) => c !== ch));
    } else {
      onChannelsChange([...channels, ch]);
    }
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-content">Content type</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Content type">
          {CONTENT_TYPES.map((ct) => {
            const active = contentType === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onContentTypeChange(ct.value)}
                className={clsx(chipBase, active ? chipActive : chipIdle)}
              >
                <i className={`bi ${ct.icon}`} aria-hidden="true" />
                {ct.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="content-gen-tone" className="mb-1.5 block text-sm font-medium text-content">
          Tone
        </label>
        <Select
          id="content-gen-tone"
          aria-label="Tone"
          value={tone}
          onChange={(v) => onToneChange(v as Tone)}
          options={TONES}
          className="w-full sm:w-64"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-content">
          Channels{' '}
          <span className="font-normal text-content-muted">
            ({channels.length} selected)
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => {
            const active = channels.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                role="checkbox"
                aria-checked={active}
                aria-label={c.label}
                onClick={() => toggleChannel(c.value)}
                className={clsx(chipBase, active ? chipActive : chipIdle)}
              >
                <i className={`bi ${c.icon}`} aria-hidden="true" />
                {c.label}
                {active && <i className="bi bi-check-lg" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-content-muted">
          Pick one channel, or several to batch-generate a tailored variant per channel.
        </p>
      </fieldset>
    </div>
  );
}
