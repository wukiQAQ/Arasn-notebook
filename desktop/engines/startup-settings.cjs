const os = require('node:os');
const path = require('node:path');

class StartupSettings {
  constructor(app, { platform = process.platform, execPath = process.execPath, env = process.env, tempDir = os.tmpdir() } = {}) {
    Object.assign(this, { app, platform, execPath, env, tempDir });
  }

  options() { return { path: this.execPath, args: ['--autostart'] }; }

  unsupported() {
    if (this.platform !== 'win32') return '开机自启动仅支持 Windows。';
    if (!this.app.isPackaged) return '开发环境不注册开机自启动，请使用安装版。';
    const relative = path.win32.relative(this.tempDir, this.execPath);
    if (this.env.PORTABLE_EXECUTABLE_FILE || this.env.PORTABLE_EXECUTABLE_DIR ||
        (!relative.startsWith('..') && !path.win32.isAbsolute(relative)))
      return '便携版或临时目录不支持可靠自启，请安装到固定位置后设置。';
    return '';
  }

  read() {
    const result = this.app.getLoginItemSettings(this.options());
    if (typeof result.openAtLogin !== 'boolean') throw new Error('系统未返回有效的自启注册状态');
    const target = result.launchItems?.find(item =>
      typeof item.path === 'string' && path.win32.normalize(item.path).toLowerCase() === path.win32.normalize(this.execPath).toLowerCase() &&
      Array.isArray(item.args) && item.args.length === 1 && item.args[0] === '--autostart' && item.scope === 'user');
    return { registered: result.openAtLogin, approved: target ? target.enabled === true : result.executableWillLaunchAtLogin !== false };
  }

  view() {
    const reason = this.unsupported();
    if (reason) return { autoStartSupported: false, openAtLogin: false, startupStatus: 'unsupported', autoStartReason: reason };
    try {
      const state = this.read();
      const startupStatus = !state.registered ? 'disabled' : state.approved ? 'enabled' : 'blocked';
      const autoStartReason = startupStatus === 'enabled' ? '已回读系统注册；实际登录启动仍需验证。' : startupStatus === 'blocked'
        ? '已注册，但被 Windows 启动应用禁用。请在系统设置中启用，或关闭后重新开启。' : '系统未注册开机自启动。';
      return { autoStartSupported: true, openAtLogin: state.registered, startupStatus, autoStartReason };
    } catch (error) {
      return { autoStartSupported: false, openAtLogin: false, startupStatus: 'error', autoStartReason: `无法读取系统自启状态：${error.message}` };
    }
  }

  apply(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('自启设置值无效');
    const reason = this.unsupported();
    if (reason) throw new Error(reason);
    const previous = this.read();
    const restore = () => {
      this.app.setLoginItemSettings({ ...this.options(), openAtLogin: previous.registered, enabled: previous.approved });
      const restored = this.read();
      if (restored.registered !== previous.registered || (previous.registered && restored.approved !== previous.approved))
        throw new Error('系统自启恢复核验失败，请检查 Windows 启动应用');
    };
    try {
      this.app.setLoginItemSettings({ ...this.options(), openAtLogin: enabled, enabled });
      const current = this.read();
      if (current.registered !== enabled || (enabled && !current.approved)) throw new Error('系统自启写入核验失败，请检查 Windows 启动应用');
    } catch (error) {
      try { restore(); } catch (restoreError) { throw new Error(`${error.message}；恢复失败：${restoreError.message}`); }
      throw error;
    }
    return restore;
  }
}

module.exports = { StartupSettings };
