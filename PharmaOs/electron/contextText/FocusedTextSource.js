import { spawn } from 'child_process';
import { normalizeText, extractCips } from './normalize.js';

/**
 * Lit périodiquement le texte du contrôle éditable au premier plan (UIA Win32).
 * V1 : filtre processus `notepad` / `notepad.exe` (test Bloc-notes).
 *
 * Implémentation : un processus PowerShell long-running (évite le cold-start à chaque poll).
 */
export class FocusedTextSource {
  /**
   * @param {{ allowedProcesses?: string[], pollMs?: number }} [opts]
   */
  constructor({
    allowedProcesses = ['notepad', 'notepad.exe'],
    pollMs = 400,
  } = {}) {
    this.id = 'focused_text';
    this.allowedProcesses = allowedProcesses.map((p) => p.toLowerCase().replace(/\.exe$/, ''));
    this.pollMs = pollMs;
    this._child = null;
    this._buffer = '';
    this._latest = null;
    this._running = false;
  }

  start() {
    if (process.platform !== 'win32') return;
    if (this._child) return;
    this._running = true;
    this._spawnWatcher();
  }

  stop() {
    this._running = false;
    this._latest = null;
    this._buffer = '';
    if (this._child) {
      try {
        this._child.kill();
      } catch { /* ignore */ }
      this._child = null;
    }
  }

  async poll() {
    const payload = this._latest;
    this._latest = null;
    return payload;
  }

  _spawnWatcher() {
    const allowedJson = JSON.stringify(this.allowedProcesses);
    const interval = Math.max(250, Math.min(2000, this.pollMs));

    // Script PS : UIA FocusedElement + ValuePattern ; filtre process name
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$allowed = ConvertFrom-Json '${allowedJson.replace(/'/g, "''")}'
while ($true) {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) {
      $procId = $el.Current.ProcessId
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $pname = if ($proc) { $proc.ProcessName.ToLowerInvariant() } else { '' }
      $ok = $false
      foreach ($a in $allowed) {
        if ($pname -eq $a -or $pname -eq ($a + '.exe')) { $ok = $true; break }
      }
      if ($ok) {
        $text = $null
        $pattern = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
          $text = $pattern.Current.Value
        }
        if ([string]::IsNullOrEmpty($text)) {
          $text = $el.Current.Name
        }
        if ($null -eq $text) { $text = '' }
        if (-not [string]::IsNullOrWhiteSpace($text)) {
          $payload = @{
            text = $text
            processName = $pname
            source = 'focused_text'
          } | ConvertTo-Json -Compress
          Write-Output $payload
        }
      }
    }
  } catch {}
  Start-Sleep -Milliseconds ${interval}
}
`.trim();

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this._child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      this._buffer += chunk;
      const lines = this._buffer.split(/\r?\n/);
      this._buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const text = String(parsed.text || '');
          if (!text.trim()) continue;
          this._latest = {
            text: text.slice(0, 2000),
            rawText: text.slice(0, 2000),
            processName: parsed.processName || 'notepad',
            source: 'focused_text',
            normalized: normalizeText(text),
            cips: extractCips(text),
          };
        } catch { /* ignore partial JSON */ }
      }
    });

    child.on('exit', () => {
      this._child = null;
      if (this._running) {
        setTimeout(() => {
          if (this._running) this._spawnWatcher();
        }, 1500);
      }
    });
  }
}
