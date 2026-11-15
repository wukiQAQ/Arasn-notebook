import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import './controls.css';

export type SelectOption<T extends string> = { value: T; label: string; tone?: string };

export function AppSelect<T extends string>({ label, value, options, onValueChange, disabled = false, className = '' }: {
  label: string; value: T; options: SelectOption<T>[]; onValueChange(value: T): void; disabled?: boolean; className?: string;
}) {
  const selected = options.find(option => option.value === value);
  const dot = (tone?: string) => tone ? <span className="app-type-dot" style={{ '--type-tone': tone } as CSSProperties} aria-hidden="true" /> : null;
  return <Select.Root value={value} items={options} disabled={disabled} modal={false} onValueChange={next => { if (next !== null) onValueChange(next); }}>
    <Select.Trigger className={`app-select ${className}`} aria-label={label} onKeyDown={event => event.stopPropagation()}>
      {dot(selected?.tone)}<Select.Value /><Select.Icon className="app-select-chevron"><ChevronDown size={15} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Positioner className="app-select-position" align="start" sideOffset={6} alignItemWithTrigger={false}>
      <Select.Popup className="app-select-popup" onKeyDown={event => event.stopPropagation()}>
        <Select.List className="app-select-list">
          {options.map(option => <Select.Item className="app-select-item" key={option.value} value={option.value} data-value={option.value}>
            {dot(option.tone)}<Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="app-select-check"><Check size={15} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.List>
      </Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root>;
}
