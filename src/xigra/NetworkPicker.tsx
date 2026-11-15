import { AppSelect } from './AppSelect';

export type NetworkInterface = { name: string; address: string; virtual: boolean; recommended: boolean };
export function NetworkPicker({ interfaces, value, onChange, disabled, label = '私有网卡' }: {
  interfaces: NetworkInterface[]; value: string; onChange(value: string): void; disabled: boolean; label?: string;
}) {
  const options = interfaces.map(entry => ({ value: entry.address,
    label: `${entry.name} · ${entry.address}${entry.virtual ? ' · 疑似虚拟' : entry.recommended ? ' · 优先尝试' : ''}` }));
  if (value && !interfaces.some(entry => entry.address === value)) options.push({ value, label: `${value} · 当前不可用` });
  if (!options.length) options.push({ value: '', label: '未检测到私有 IPv4' });
  return <div className="network-picker" title={options.find(option => option.value === value)?.label}>
    <span className="field-label">{label}</span>
    <AppSelect label={label} value={value} disabled={disabled || !interfaces.length} options={options} onValueChange={onChange} />
    <small>按网卡名称提示虚拟网络，可能不准确；优先尝试不代表已连通。</small>
  </div>;
}
