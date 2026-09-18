'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional Bootstrap icon class, e.g. 'bi-envelope'. */
  icon?: string;
  /** Optional secondary line rendered under the label. */
  description?: string;
  disabled?: boolean;
}

type Size = 'sm' | 'md';

const sizeStyles: Record<Size, string> = {
  sm: 'px-2 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
};

const MENU_MAX_HEIGHT = 288; // px — matches max-h-72 on the listbox
const VIEWPORT_GUTTER = 8;

interface MenuRect {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

/**
 * Themed replacement for the native <select>. The browser's built-in dropdown
 * renders with OS chrome that ignores our tokens, so every dropdown in the app
 * uses this instead: a combobox button plus a listbox popup drawn with the same
 * surface/ignite tokens as the rest of the UI.
 *
 * The popup is portalled to <body> and positioned as `fixed` so it is never
 * clipped by a scrolling or overflow-hidden ancestor, and it flips above the
 * trigger when there is not enough room below.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  id,
  name,
  size = 'md',
  className,
  buttonClassName,
  'aria-label': ariaLabel,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  size?: Size;
  className?: string;
  buttonClassName?: string;
  'aria-label'?: string;
}) {
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ query: '', at: 0 });

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const enabledIndexes = useMemo(
    () => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [options]
  );

  useEffect(() => setMounted(true), []);

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - VIEWPORT_GUTTER;
    const above = r.top - VIEWPORT_GUTTER;
    const flip = below < Math.min(MENU_MAX_HEIGHT, 160) && above > below;
    setRect({
      left: r.left,
      top: flip ? r.top : r.bottom + 4,
      width: r.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, flip ? above - 4 : below)),
      placement: flip ? 'top' : 'bottom',
    });
  }, []);

  // Reposition while open: the trigger can move under scroll or a resize.
  useLayoutEffect(() => {
    if (!open) return;
    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open, position]);

  // Keep the active option visible as the user arrows through the list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLLIElement>('[data-active="true"]')?.scrollIntoView({
      block: 'nearest',
    });
  }, [open, activeIndex]);

  // Dismiss on an outside pointer press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openMenu = (startAt?: number) => {
    if (disabled) return;
    setActiveIndex(startAt ?? (selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1)));
    setOpen(true);
  };

  const closeMenu = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeMenu();
  };

  const step = (delta: number) => {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const next =
      pos === -1
        ? enabledIndexes[delta > 0 ? 0 : enabledIndexes.length - 1]
        : enabledIndexes[Math.min(Math.max(pos + delta, 0), enabledIndexes.length - 1)];
    setActiveIndex(next);
  };

  /** Jump to the first option matching the letters typed in quick succession. */
  const matchTypeahead = (char: string) => {
    const now = Date.now();
    const state = typeahead.current;
    state.query = now - state.at > 600 ? char : state.query + char;
    state.at = now;
    const q = state.query.toLowerCase();
    const from = enabledIndexes.indexOf(open ? activeIndex : selectedIndex);
    const ordered = [...enabledIndexes.slice(from + 1), ...enabledIndexes.slice(0, from + 1)];
    const hit = ordered.find((i) => options[i].label.toLowerCase().startsWith(q));
    if (hit === undefined) return;
    if (open) setActiveIndex(hit);
    else onChange(options[hit].value);
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        open ? step(1) : openMenu();
        break;
      case 'ArrowUp':
        e.preventDefault();
        open ? step(-1) : openMenu();
        break;
      case 'Home':
        if (!open) break;
        e.preventDefault();
        setActiveIndex(enabledIndexes[0] ?? -1);
        break;
      case 'End':
        if (!open) break;
        e.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        open ? commit(activeIndex) : openMenu();
        break;
      case 'Escape':
        if (!open) break;
        e.preventDefault();
        closeMenu();
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          matchTypeahead(e.key);
        }
    }
  }

  const menu =
    open && rect ? (
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        tabIndex={-1}
        style={{
          left: rect.left,
          width: rect.width,
          maxHeight: rect.maxHeight,
          ...(rect.placement === 'bottom'
            ? { top: rect.top }
            : { bottom: window.innerHeight - rect.top + 4 }),
        }}
        className="animate-select-in fixed z-[55] overflow-y-auto overscroll-contain rounded-md border border-surface-3 bg-surface-1 p-1 shadow-lg shadow-black/20 ring-1 ring-ignite/10"
      >
        {options.length === 0 ? (
          <li className="px-3 py-2 text-sm text-content-muted">No options available</li>
        ) : (
          options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={isActive}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commit(index)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm transition-colors',
                  option.disabled && 'cursor-not-allowed opacity-50',
                  !option.disabled && isActive && 'bg-ignite/15 text-content',
                  !option.disabled && !isActive && 'text-content-muted',
                  isSelected && 'font-medium text-content'
                )}
              >
                {option.icon && (
                  <i
                    className={clsx('bi', option.icon, isSelected ? 'text-ignite' : 'text-content-muted')}
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="block truncate text-xs text-content-muted">
                      {option.description}
                    </span>
                  )}
                </span>
                {isSelected && <i className="bi bi-check-lg text-ignite" aria-hidden="true" />}
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className={clsx(
          'focus-ignite flex w-full items-center justify-between gap-2 rounded-md border bg-surface-2 text-left text-content transition-colors',
          sizeStyles[size],
          open ? 'border-ignite shadow-glow-sm' : 'border-surface-3 hover:border-ignite/50',
          disabled && 'cursor-not-allowed opacity-60 hover:border-surface-3',
          buttonClassName
        )}
      >
        <span className={clsx('flex min-w-0 items-center gap-2', !selected && 'text-content-muted')}>
          {selected?.icon && <i className={clsx('bi', selected.icon, 'text-ignite')} aria-hidden="true" />}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <i
          className={clsx(
            'bi bi-chevron-down shrink-0 text-xs text-content-muted transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {name && <input type="hidden" name={name} value={value} />}
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
