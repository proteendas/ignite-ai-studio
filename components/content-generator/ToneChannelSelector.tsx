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
  { value: 'sales-pitch', label: 'Sales Pitch', icon: 'bi-graph-up-arrow' },
  { value: 'custom', label: 'Custom', icon: 'bi-magic' },
];

/** One-click starting points for the Custom content type. */
const CUSTOM_SUGGESTIONS = [
  'A press release announcing the key news, with a headline, dateline and boilerplate',
  'An FAQ section with 6–8 questions a prospective customer would ask',
  'A 60-second video script with scene directions',
  'An executive summary in 5 bullet points for leadership',
  'A monthly newsletter section with a catchy title and three short stories',
];

const MAX_INSTRUCTIONS = 2000;

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
  instructions,
  onInstructionsChange,
}: {
  contentType: ContentType;
  tone: Tone;
  channels: Channel[];
  instructions: string;
  onInstructionsChange: (v: string) => void;
  onContentTypeChange: (v: ContentType) => void;
  onToneChange: (v: Tone) => void;
  onChannelsChange: (v: Channel[]) => void;
}) {
  const isCustom = contentType === 'custom';

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
        <label
          htmlFor="content-gen-instructions"
          className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-content"
        >
          <span>
            {isCustom ? 'Describe the content you need' : 'Additional instructions'}{' '}
            <span className="font-normal text-content-muted">
              {isCustom ? '(required)' : '(optional)'}
            </span>
          </span>
          <span
            className={clsx(
              'text-xs font-normal tabular-nums',
              instructions.length > MAX_INSTRUCTIONS * 0.9 ? 'text-ignite-light' : 'text-content-muted'
            )}
          >
            {instructions.length}/{MAX_INSTRUCTIONS}
          </span>
        </label>
        <textarea
          id="content-gen-instructions"
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value.slice(0, MAX_INSTRUCTIONS))}
          rows={isCustom ? 4 : 3}
          placeholder={
            isCustom
              ? 'e.g. A case study for prospective enterprise customers: challenge, solution, results with the key metrics, and a closing quote-style summary. Around 400 words.'
              : 'e.g. Focus on the sustainability initiatives, target small-business owners, keep it under 150 words, and end with a link to the website.'
          }
          className="focus-ignite w-full resize-y rounded-md border border-surface-3 bg-surface-2 p-3 text-sm leading-relaxed text-content placeholder:text-content-muted/70 transition-colors hover:border-ignite/40"
        />
        {isCustom && !instructions.trim() && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-xs text-content-muted">Try:</span>
            {CUSTOM_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onInstructionsChange(s)}
                className="focus-ignite max-w-full truncate rounded-full border border-surface-3 bg-surface-2 px-2.5 py-1 text-xs text-content-muted transition-colors hover:border-ignite/50 hover:text-content"
                title={s}
              >
                {s.split(/[,(]| with /)[0]}
              </button>
            ))}
          </div>
        )}
        {!isCustom && (
          <p className="mt-1.5 text-xs text-content-muted">
            Steer the angle, audience, length or must-include points. Facts still come only from
            the source document.
          </p>
        )}
      </div>

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
