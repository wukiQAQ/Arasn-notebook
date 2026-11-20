import { Popover } from '@base-ui/react/popover';
import { CircleHelp } from 'lucide-react';
import { Button } from '../Button';
import { ControlTooltip } from '../ControlTooltip';
import './help-popover.css';

const instructions = {
  devices: [
    ['发现与配对', '两台设备在同一局域网开启互传即可发现。交换配对信息（2 分钟内有效），用独立渠道核对完整 SHA-256 指纹。'],
    ['选择网卡', '选接入对方所在网络的 Wi-Fi 或有线网卡。虚拟网卡和推荐标签仅供参考。'],
    ['发送便签', '在便签操作菜单发起互传，选择已配对的设备并发送。对方确认后才会收到正文。'],
    ['排查连接', '检查 Wi-Fi、网线和 Windows 防火墙专用网络权限，再刷新网络。地址变更时，关闭互传后重新选网卡。'],
  ],
  share: [
    ['开启与停止', '在主机桌面应用选择网卡后点「开启共享」。点「停止共享」会断开当前连接，重新开启会生成新链接。'],
    ['获取访问链接', '开启后点「复制地址」，在同一局域网的设备上用浏览器打开链接。访问期间请保持主机运行。'],
    ['共享内容', '访问者可以查看和编辑共享文字与笔迹。本机文件、附件和关系画布留在本机。'],
    ['权限与安全', '仅在可信局域网分享链接。连接失败时，检查网卡和 Windows 防火墙的专用网络权限。'],
  ],
  records: [
    ['编辑便签', '标题可选，未填写时以正文首个非空行作为列表标题。修改会自动保存。'],
    ['添加附件', '点底部的附件数量，可导入本地文件、引用文件中心的文件或预览附件。'],
    ['加入关系画布', '保存后选择「加入关系画布」。已关联的便签可通过「查看关系画布」定位节点。'],
  ],
} as const;

export function HelpPopover({ topic }: { topic: keyof typeof instructions }) {
  return <Popover.Root>
    <ControlTooltip label="使用说明">
      <Popover.Trigger render={<Button iconOnly tooltip="" />} className="network-help-trigger" aria-label="使用说明">
        <CircleHelp size={18} aria-hidden="true" />
      </Popover.Trigger>
    </ControlTooltip>
    <Popover.Portal>
      <Popover.Positioner className="network-help-position" side="bottom" align="start" sideOffset={8}
        collisionPadding={{ top: 52, right: 12, bottom: 12, left: 12 }}>
        <Popover.Popup className="network-help-popup" tabIndex={0}>
          <Popover.Title className="network-help-title">使用说明</Popover.Title>
          <dl>{instructions[topic].map(([title, text]) => <div key={title}>
            <dt>{title}</dt><dd>{text}</dd>
          </div>)}</dl>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
