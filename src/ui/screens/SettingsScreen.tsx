import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { PaxDialog } from '../components/dialogs.js';
import { SmallLogo } from '../components/Logo.js';
import { AirportsDialog, StateDialog, TextDialog } from '../components/settingsDialogs.js';
import { Button, Chip, Clickable, KeyHints, Segmented } from '../components/ui.js';
import { width as textWidth, wrapText } from '../format.js';
import { useKeys } from '../input.js';
import {
  settingsSections,
  tildePath,
  type Control,
  type Row,
  type Section,
  type SettingsContext,
  type SettingsDialog,
} from '../settings.js';
import { BridgeStatus, CONNECTED_LABEL, type Shell } from '../shell.js';
import { expandHome, isFile } from '../system.js';
import { theme } from '../theme.js';
import { VERSION } from '../../version.js';

/** Eine Bildschirmzeile der Inhaltsspalte. */
type Line =
  | { kind: 'gap'; key: string; section: number }
  | { kind: 'header'; key: string; section: number }
  | { kind: 'row'; key: string; section: number; row: number }
  | { kind: 'hint'; key: string; section: number; row: number; text: string; first: boolean };

const NAV_W = 20;

function selectable(r: Row): boolean {
  return r.control.kind !== 'info' && !r.disabled;
}

/**
 * Einstellungen auf einer Seite: alle Abschnitte untereinander, links eine schmale Navigation, die zum Abschnitt
 * springt. Jede Einstellung hat eine Zeile (Name links, Bedienelement rechts) und darunter eine Zeile Erklärung.
 */
export function SettingsScreen({ shell }: { shell: Shell }) {
  const { settings, cols, rows, env } = shell;
  const [cacheBytes, setCacheBytes] = useState(() => shell.client.cacheBytes());
  const ctx: SettingsContext = {
    terminalScheme: env.terminalScheme,
    mouseForcedOff: env.mouseForcedOff,
    cliVia: env.cliVia,
    viaLabel: shell.demo ? 'Demo-Daten' : shell.bridge === 'connected' ? CONNECTED_LABEL[shell.via] : 'noch nicht verbunden',
    version: VERSION,
    cacheBytes,
    recentCount: shell.s.recent.length,
    favoritesCount: shell.favorites.length,
    configDir: tildePath(env.configDir, env.home),
    cacheDir: tildePath(env.cacheDir, env.home),
    exportDir: tildePath(env.exportDir, env.home),
  };
  const sections = settingsSections(settings, ctx);

  const showNav = cols >= 72;
  const contentW = Math.max(30, Math.min(88, cols - (showNav ? NAV_W + 4 : 2)));

  // Flache Zeilenliste für den sichtbaren Ausschnitt; Erklärungen werden auf die Spaltenbreite umgebrochen.
  const { lines, flat, sectionLine } = useMemo(() => {
    const lines: Line[] = [];
    const flat: { row: Row; section: number; line: number }[] = [];
    const sectionLine: number[] = [];
    sections.forEach((sec, si) => {
      if (si > 0) lines.push({ kind: 'gap', key: `g${si}`, section: si });
      sectionLine.push(lines.length);
      lines.push({ kind: 'header', key: `h${si}`, section: si });
      lines.push({ kind: 'gap', key: `hg${si}`, section: si });
      sec.rows.forEach((r, ri) => {
        // Leerzeile zwischen Einstellungen; die Erklärung steht direkt unter ihrer Zeile.
        if (ri > 0) lines.push({ kind: 'gap', key: `rg${r.id}`, section: si });
        flat.push({ row: r, section: si, line: lines.length });
        lines.push({ kind: 'row', key: `r${r.id}`, section: si, row: flat.length - 1 });
        const confirmText = r.control.kind === 'action' && r.control.confirm ? r.control.confirm : '';
        const hint = wrapText(r.hint ?? '', contentW - 4);
        if (!hint.length && confirmText) hint.push('');
        hint.forEach((text, hi) =>
          lines.push({ kind: 'hint', key: `t${r.id}-${hi}`, section: si, row: flat.length - 1, text, first: hi === 0 }),
        );
      });
    });
    return { lines, flat, sectionLine };
  }, [sections, contentW]);

  const [selId, setSelId] = useState<string>(() => flat.find((f) => selectable(f.row))?.row.id ?? '');
  const [offset, setOffset] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dialog, setDialog] = useState<SettingsDialog | null>(null);
  const [airports, setAirports] = useState<{ code: string; name: string }[]>([]);
  const [airportError, setAirportError] = useState<string | null>(null);

  const sel = Math.max(0, flat.findIndex((f) => f.row.id === selId));
  const current = flat[sel];
  const bodyH = Math.max(5, rows - 3);
  const maxOffset = Math.max(0, lines.length - bodyH);
  const top = Math.min(offset, maxOffset);

  // Aktiver Abschnitt: der der Auswahl, solange sie sichtbar ist, sonst der oberste sichtbare.
  const selVisible = current && current.line >= top && current.line < top + bodyH;
  const activeSection = selVisible ? current!.section : (lines[top]?.section ?? 0);

  useEffect(() => {
    if (dialog !== 'airports') return;
    if (shell.bridge === 'waiting') {
      setAirportError('Die Flughafenliste kommt von aida.de – noch keine Verbindung.');
      return;
    }
    let alive = true;
    shell.client
      .getFilters()
      .then((f) => {
        if (alive) setAirports(f.airport.map((a) => ({ code: a.code, name: a.marketingName || a.name })));
      })
      .catch(() => alive && setAirportError('Flughafenliste konnte nicht geladen werden.'));
    return () => {
      alive = false;
    };
  }, [dialog, shell.client, shell.bridge]);

  // ---------------------------------------------------------------- Aktionen
  const select = (i: number) => {
    const f = flat[i];
    if (!f) return;
    setSelId(f.row.id);
    setConfirm(null);
    // Erste Zeile eines Abschnitts: Überschrift mit ins Bild holen.
    const firstOfSection = flat.findIndex((x) => x.section === f.section) === i;
    const wantTop = firstOfSection ? sectionLine[f.section]! : f.line;
    if (wantTop < top) setOffset(wantTop);
    else if (f.line + 2 > top + bodyH) setOffset(Math.min(maxOffset, f.line + 2 - bodyH));
  };
  const step = (dir: -1 | 1) => {
    for (let i = sel + dir; i >= 0 && i < flat.length; i += dir) {
      if (selectable(flat[i]!.row)) return select(i);
    }
  };
  const jumpSection = (si: number) => {
    const target = Math.max(0, Math.min(sections.length - 1, si));
    const i = flat.findIndex((f) => f.section === target && selectable(f.row));
    if (i >= 0) setSelId(flat[i]!.row.id);
    setConfirm(null);
    setOffset(Math.min(maxOffset, sectionLine[target]!));
  };

  const notify = (r: { text: string; tone: 'info' | 'warn' | 'bad' }) => shell.notify(r.text, r.tone);

  const change = (row: Row, dir: -1 | 1 | 0) => {
    const c = row.control;
    if (row.disabled) return;
    switch (c.kind) {
      case 'switch':
        return shell.updateSettings(c.set(dir === 0 ? !c.value : dir > 0));
      case 'choice': {
        const i = c.options.findIndex((o) => o.value === c.value);
        const next = dir === 0 ? (i + 1) % c.options.length : Math.max(0, Math.min(c.options.length - 1, i + dir));
        if (next !== i) shell.updateSettings(c.set(c.options[next]!.value));
        return;
      }
      case 'stepper': {
        const next = dir === 0 ? (c.value >= c.max ? c.min : c.value + 1) : Math.max(c.min, Math.min(c.max, c.value + dir));
        if (next !== c.value) shell.updateSettings(c.set(next));
        return;
      }
      case 'open':
        if (dir === 0) setDialog(c.dialog);
        return;
      case 'action':
        if (dir !== 0) return;
        if (c.confirm && confirm !== row.id) return setConfirm(row.id);
        setConfirm(null);
        notify(shell.runAction(c.action));
        if (c.action === 'clearCache') setCacheBytes(shell.client.cacheBytes());
        return;
      case 'info':
        return;
    }
  };

  useKeys(
    (input, key) => {
      if (key.escape) return confirm ? setConfirm(null) : shell.closeSettings();
      if (input === '?') return shell.showHelp();
      if (key.upArrow) return step(-1);
      if (key.downArrow) return step(1);
      if (key.tab) return jumpSection(activeSection + (key.shift ? -1 : 1));
      if (key.pageUp) return jumpSection(activeSection - 1);
      if (key.pageDown) return jumpSection(activeSection + 1);
      if (!current) return;
      if (key.leftArrow) return change(current.row, -1);
      if (key.rightArrow) return change(current.row, 1);
      if (key.return || input === ' ') return change(current.row, 0);
    },
    { isActive: shell.active && dialog === null },
  );

  // ---------------------------------------------------------------- Dialoge
  const closeDialog = () => setDialog(null);
  const base = { cols, rows, onClose: closeDialog };
  let dialogNode: React.ReactNode = null;
  if (dialog === 'pax') {
    dialogNode = (
      <PaxDialog
        {...base}
        pax={settings.defaultPax ?? shell.s.pax}
        history={shell.s.paxHistory}
        onApply={(p) => {
          shell.updateSettings({ defaultPax: p });
          closeDialog();
        }}
      />
    );
  } else if (dialog === 'airports') {
    dialogNode = (
      <AirportsDialog
        {...base}
        airports={airports}
        selected={settings.homeAirports}
        error={airportError}
        onApply={(codes) => {
          shell.updateSettings({ homeAirports: codes });
          closeDialog();
        }}
      />
    );
  } else if (dialog === 'state') {
    dialogNode = (
      <StateDialog
        {...base}
        selected={settings.defaultState}
        onApply={(code) => {
          shell.updateSettings({ defaultState: code });
          closeDialog();
        }}
      />
    );
  } else if (dialog === 'firefoxPath') {
    dialogNode = (
      <TextDialog
        {...base}
        title="Firefox-Programm"
        description="Pfad zur ausführbaren Datei von Firefox. Leer lassen, um automatisch zu suchen. Gilt ab dem nächsten Start."
        initial={settings.firefoxPath}
        placeholder="/Applications/Firefox.app/Contents/MacOS/firefox"
        validate={(v) => (!v || isFile(expandHome(v, env.home)) ? null : 'Datei nicht gefunden.')}
        onApply={(v) => {
          shell.updateSettings({ firefoxPath: v ? expandHome(v, env.home) : '' });
          closeDialog();
        }}
      />
    );
  } else if (dialog === 'port') {
    dialogNode = (
      <TextDialog
        {...base}
        title="Port der Chrome-Brücke"
        description="Muss mit dem Port in der Erweiterung übereinstimmen. Gilt ab dem nächsten Start."
        initial={String(settings.port)}
        validate={(v) => (/^\d+$/.test(v) && Number(v) >= 1024 && Number(v) <= 65535 ? null : 'Eine Zahl von 1024 bis 65535.')}
        onApply={(v) => {
          shell.updateSettings({ port: Number(v) });
          closeDialog();
        }}
      />
    );
  } else if (dialog === 'import') {
    dialogNode = (
      <TextDialog
        {...base}
        title="Favoriten importieren"
        description="Pfad einer exportierten Favoritendatei (JSON). Vorhandene Favoriten bleiben erhalten."
        initial={`${ctx.exportDir}/`}
        validate={(v) => (isFile(expandHome(v, env.home)) ? null : 'Datei nicht gefunden.')}
        onApply={(v) => {
          notify(shell.importFavorites(expandHome(v, env.home)));
          closeDialog();
        }}
      />
    );
  }

  // ---------------------------------------------------------------- Darstellung
  const renderLine = (l: Line) => {
    const sec = sections[l.section]!;
    if (l.kind === 'gap') return <Text key={l.key}> </Text>;
    if (l.kind === 'header') return <SectionHeader key={l.key} section={sec} width={contentW} />;
    const f = flat[l.row]!;
    const active = f.row.id === current?.row.id && dialog === null;
    if (l.kind === 'hint') {
      // Wartet eine Aktion auf Bestätigung, steht die Rückfrage an Stelle der Erklärung.
      const pending = confirm === f.row.id;
      const c = f.row.control;
      const text = pending ? (l.first && c.kind === 'action' ? `${c.confirm ?? ''}  ⏎ bestätigen · Esc abbrechen` : '') : l.text;
      return (
        <Text key={l.key} color={pending ? theme.warn : theme.muted} wrap="truncate">
          {'  '}
          {text || ' '}
        </Text>
      );
    }
    return (
      <Clickable
        key={l.key}
        width={contentW}
        onClick={() => {
          if (selectable(f.row)) select(l.row);
        }}
      >
        <Text color={theme.accent}>{active ? '▌' : ' '}</Text>
        <Text> </Text>
        <Text color={f.row.disabled ? theme.faint : active ? theme.accent : undefined} bold={active} wrap="truncate">
          {f.row.label}
        </Text>
        <Box flexGrow={1} minWidth={2} />
        <ControlView
          row={f.row}
          pending={confirm === f.row.id}
          space={contentW - textWidth(f.row.label) - 4}
          onChange={(v) => {
            select(l.row);
            change(f.row, v);
          }}
          onPick={(value) => {
            select(l.row);
            const c = f.row.control;
            if (c.kind === 'choice' && !f.row.disabled) shell.updateSettings(c.set(value));
          }}
        />
      </Clickable>
    );
  };

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box paddingX={1} height={1} justifyContent="space-between">
        <Box>
          <Clickable onClick={() => shell.go('home')}>
            <SmallLogo />
          </Clickable>
          <Text color={theme.faint}>  ›  </Text>
          <Text bold>Einstellungen</Text>
        </Box>
        <BridgeStatus bridge={shell.bridge} via={shell.via} extra={`v${VERSION}`} />
      </Box>
      <Box height={1} />
      <Box height={bodyH}>
        {showNav ? (
          <Box
            flexDirection="column"
            width={NAV_W}
            flexShrink={0}
            borderStyle="single"
            borderTop={false}
            borderBottom={false}
            borderLeft={false}
            borderColor={theme.border}
          >
            {sections.map((sec, si) => {
              const on = si === activeSection;
              return (
                <Clickable key={sec.id} onClick={() => jumpSection(si)}>
                  <Text color={on ? theme.accent : theme.muted} bold={on} wrap="truncate">
                    {on ? '▌' : ' '} {sec.icon}  {sec.title}
                  </Text>
                </Clickable>
              );
            })}
          </Box>
        ) : null}
        <Clickable
          flexDirection="column"
          paddingLeft={showNav ? 2 : 1}
          flexGrow={1}
          onWheel={(dir) => setOffset(Math.max(0, Math.min(maxOffset, top + dir * 3)))}
        >
          {lines.slice(top, top + bodyH).map(renderLine)}
        </Clickable>
      </Box>
      <KeyHints
        hints={[
          { key: '↑↓', label: 'Auswahl' },
          { key: '←→', label: 'ändern' },
          { key: '⏎', label: 'öffnen' },
          { key: 'Tab', label: 'Bereich' },
          { key: 'Esc', label: 'zurück' },
        ]}
        message={shell.message?.text ?? null}
        tone={shell.message?.tone ?? 'info'}
      />
      {dialogNode}
    </Box>
  );
}

function SectionHeader({ section, width }: { section: Section; width: number }) {
  const label = `${section.icon}  ${section.title} `;
  return (
    <Text wrap="truncate">
      <Text color={theme.accent}>{section.icon}</Text>
      <Text bold>{`  ${section.title} `}</Text>
      <Text color={theme.border}>{'─'.repeat(Math.max(0, width - textWidth(label)))}</Text>
    </Text>
  );
}

/** Bedienelement rechts in der Zeile. Jedes Teil ist direkt anklickbar. */
function ControlView({
  row,
  pending,
  space,
  onChange,
  onPick,
}: {
  row: Row;
  pending: boolean;
  space: number;
  onChange: (dir: -1 | 1 | 0) => void;
  onPick: (value: string) => void;
}) {
  const c: Control = row.control;
  const off = row.disabled;
  switch (c.kind) {
    case 'switch':
      return (
        <Clickable onClick={() => onChange(0)} flexShrink={0}>
          {c.value ? (
            <Text color={off ? theme.faint : theme.accent}>
              ━━● <Text bold>An </Text>
            </Text>
          ) : (
            <Text color={off ? theme.faint : theme.muted}>○━━ Aus</Text>
          )}
        </Clickable>
      );
    case 'choice': {
      const segW = c.options.reduce((a, o) => a + textWidth(o.label) + 1, 1);
      if (segW <= space) return <Segmented options={c.options} value={c.value} onChange={(v) => onPick(v)} />;
      // Zu breit für Segmente: Wert mit Pfeilen zum Durchblättern
      const label = c.options.find((o) => o.value === c.value)?.label ?? c.value;
      return <Stepper text={label} onChange={onChange} />;
    }
    case 'stepper':
      return <Stepper text={c.text} onChange={onChange} />;
    case 'open':
      return <Chip value={c.text} onClick={() => onChange(0)} />;
    case 'action':
      return pending ? (
        <Clickable onClick={() => onChange(0)} flexShrink={0}>
          <Text backgroundColor={c.danger ? theme.bad : theme.accent} color={theme.selFg} bold>
            {' Bestätigen '}
          </Text>
        </Clickable>
      ) : off ? (
        <Text color={theme.faint}>{` ${c.label} `}</Text>
      ) : (
        <Button label={c.label} onClick={() => onChange(0)} />
      );
    case 'info':
      return (
        <Text color={theme.muted} wrap="truncate">
          {c.text}
        </Text>
      );
  }
}

function Stepper({ text, onChange }: { text: string; onChange: (dir: -1 | 1 | 0) => void }) {
  return (
    <Box flexShrink={0}>
      <Clickable onClick={() => onChange(-1)}>
        <Text color={theme.muted}>‹ </Text>
      </Clickable>
      <Text backgroundColor={theme.chipBg} bold>{` ${text} `}</Text>
      <Clickable onClick={() => onChange(1)}>
        <Text color={theme.muted}> ›</Text>
      </Clickable>
    </Box>
  );
}
