import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { BridgeStatus, SetupHint } from '../src/ui/shell.js';
import { plain } from './ui-helpers.js';

const frame = (node: React.ReactElement) => plain(render(node).lastFrame());

describe('Statuszeile je Zugriffsweg', () => {
  it('nennt den Weg, über den gerade abgefragt wird', () => {
    expect(frame(<BridgeStatus bridge="connected" via="direct" />)).toBe('● aida.de direkt');
    expect(frame(<BridgeStatus bridge="connected" via="firefox" />)).toBe('● Firefox ohne Fenster');
    expect(frame(<BridgeStatus bridge="connected" via="bridge" />)).toBe('● Chrome verbunden');
    expect(frame(<BridgeStatus bridge="demo" via="fixture" extra="Ausschnitt" />)).toBe('● Demo-Daten  ·  Ausschnitt');
  });

  it('unterscheidet beim Warten zwischen startendem Firefox und fehlender Erweiterung', () => {
    expect(frame(<BridgeStatus bridge="waiting" via="direct" />)).toBe('○ Firefox startet …');
    expect(frame(<BridgeStatus bridge="waiting" via="firefox" />)).toBe('○ Firefox startet …');
    expect(frame(<BridgeStatus bridge="waiting" via="bridge" />)).toBe('○ warte auf Chrome');
  });

  it('zeigt die Einrichtung der Erweiterung erst auf der dritten Stufe', () => {
    expect(frame(<SetupHint via="direct" extensionDir="/ext" />)).not.toContain('chrome://extensions');
    expect(frame(<SetupHint via="direct" extensionDir="/ext" />)).toContain('Firefox wird ohne Fenster gestartet');
    expect(frame(<SetupHint via="bridge" extensionDir="/ext" />)).toContain('chrome://extensions');
  });
});
