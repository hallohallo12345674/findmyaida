import { holidayLabel, stateInfo, type HolidayType } from './holidays.js';

/**
 * Rechtsgrundlagen der Schulpflicht je Bundesland – recherchiert in den amtlichen
 * Landesrecht-Portalen (Stand 15./16.11.2026). Es stehen nur Normen und Gesetzesnamen hier,
 * Inhalte sind sinngemäß und kurz umschrieben. Nicht Verifiziertes wurde bewusst weggelassen.
 */
export interface SchoolLaw {
  state: string;
  /** offizieller Name des Gesetzes, in dem die Schulpflicht geregelt ist */
  law: string;
  abbr: string;
  /** Norm zur Schulpflicht, z. B. „Art. 35“, und ihre amtliche Überschrift */
  duty: { norm: string; title: string };
  /** Norm zur regelmäßigen Teilnahme am Unterricht (inkl. Gesetzeskürzel, falls abweichend) */
  attendance: string;
  /** Ordnungswidrigkeit; maxFine nur, wenn das Gesetz selbst einen Höchstbetrag nennt */
  offence: { norm: string; maxFine?: string };
  /** verifizierte Regel zu Beurlaubung bzw. Ferien (sinngemäß) */
  leave?: string;
  sources: string[];
}

export const SCHOOL_LAWS: SchoolLaw[] = [
  {
    state: 'BW',
    law: 'Schulgesetz für Baden-Württemberg',
    abbr: 'SchG',
    duty: { norm: '§ 72', title: 'Schulpflicht, Pflichten der Schüler' },
    attendance: '§ 72 Abs. 3 SchG',
    offence: { norm: '§ 92' },
    leave: 'eine Beurlaubung ist nach § 4 SchulBesV nur in besonders begründeten Ausnahmefällen möglich',
    sources: ['https://www.landesrecht-bw.de/perma?j=SchulG_BW_!_72', 'https://www.landesrecht-bw.de/perma?j=SchulBesV_BW_!_4'],
  },
  {
    state: 'BY',
    law: 'Bayerisches Gesetz über das Erziehungs- und Unterrichtswesen',
    abbr: 'BayEUG',
    duty: { norm: 'Art. 35', title: 'Schulpflicht' },
    attendance: 'Art. 56 Abs. 4 BayEUG',
    offence: { norm: 'Art. 119' },
    leave: 'eine Beurlaubung ist nach § 20 Abs. 3 BaySchO nur in begründeten Ausnahmefällen möglich',
    sources: ['https://www.gesetze-bayern.de/Content/Document/BayEUG-35', 'https://www.gesetze-bayern.de/Content/Document/BayEUG-119'],
  },
  {
    state: 'BE',
    law: 'Schulgesetz für das Land Berlin',
    abbr: 'SchulG',
    duty: { norm: '§ 41', title: 'Grundsätze' },
    attendance: '§ 46 Abs. 2 SchulG',
    offence: { norm: '§ 126', maxFine: '2.500 €' },
    leave: 'Beurlaubungen unmittelbar vor oder nach den Ferien sollen nach § 2 Abs. 1 AV Schulbesuchspflicht nicht genehmigt werden',
    sources: ['https://gesetze.berlin.de/perma?j=SchulG_BE_!_41', 'https://www.berlin.de/sen/bildung/schule/rechtsvorschriften/av-schulbesuchspflicht.pdf'],
  },
  {
    state: 'BB',
    law: 'Brandenburgisches Schulgesetz',
    abbr: 'BbgSchulG',
    duty: { norm: '§ 36', title: 'Grundsätze' },
    attendance: '§ 44 Abs. 3 BbgSchulG',
    offence: { norm: '§ 42', maxFine: '2.500 €' },
    leave: 'Reise- und Urlaubstermine der Eltern gelten nach Nr. 8 Abs. 4 VV-Schulbetrieb nicht als wichtiger Grund',
    sources: ['https://bravors.brandenburg.de/gesetze/bbgschulg', 'https://bravors.brandenburg.de/verwaltungsvorschriften/vv_schulbetrieb'],
  },
  {
    state: 'HB',
    law: 'Bremisches Schulgesetz',
    abbr: 'BremSchulG',
    duty: { norm: '§ 55', title: 'Erfüllung der Schulpflicht' },
    attendance: '§ 55 Abs. 8 BremSchulG',
    offence: { norm: '§ 65', maxFine: '1.000 € (Erziehungsberechtigte)' },
    leave: 'eine Verlängerung der Ferien ist nach Mitteilung 96/2026 grundsätzlich nicht zu genehmigen',
    sources: [
      'https://www.transparenz.bremen.de/metainformationen/bremisches-schulgesetz-bremschulg-in-der-fassung-der-bekanntmachung-vom-28-juni-2005-270394',
      'https://www.bildung.bremen.de/sixcms/media.php/13/mitteilung_96_2026.pdf',
    ],
  },
  {
    state: 'HH',
    law: 'Hamburgisches Schulgesetz',
    abbr: 'HmbSG',
    duty: { norm: '§ 37', title: 'Grundsätze zur Schulpflicht' },
    attendance: '§ 28 Abs. 2 HmbSG',
    offence: { norm: '§ 113' },
    leave: 'eine Beurlaubung setzt nach § 28 Abs. 3 HmbSG einen wichtigen Grund voraus',
    sources: ['https://www.landesrecht-hamburg.de/bsha/document/jlr-SchulGHArahmen'],
  },
  {
    state: 'HE',
    law: 'Hessisches Schulgesetz',
    abbr: 'HSchG',
    duty: { norm: '§ 56', title: 'Begründung der Schulpflicht' },
    attendance: '§ 69 Abs. 4 HSchG',
    offence: { norm: '§ 181' },
    leave: 'über Beurlaubungen in Verbindung mit Ferien entscheidet nach § 3 Abs. 2 VOGSV die Schulleitung, Antrag spätestens vier Wochen vorher',
    sources: ['https://www.rv.hessenrecht.hessen.de/bshe/document/jlr-NNLHE0000507B', 'https://www.rv.hessenrecht.hessen.de/bshe/document/hevr-SchulVerhGVHE2011V10P3'],
  },
  {
    state: 'MV',
    law: 'Schulgesetz für das Land Mecklenburg-Vorpommern',
    abbr: 'SchulG M-V',
    duty: { norm: '§ 41', title: 'Grundsatz' },
    attendance: '§ 53 Abs. 2 SchulG M-V',
    offence: { norm: '§ 139', maxFine: '2.500 €' },
    leave: 'vor und nach den Ferien ist eine Beurlaubung nach § 8 Abs. 1 SchPflVO M-V nur bei persönlicher Härte zulässig',
    sources: ['https://www.landesrecht-mv.de/bsmv/document/jlr-NNLMV000070FB', 'https://www.landesrecht-mv.de/bsmv/document/jlr-NNLMV0000740DNN00000000015'],
  },
  {
    state: 'NI',
    law: 'Niedersächsisches Schulgesetz',
    abbr: 'NSchG',
    duty: { norm: '§ 63', title: 'Allgemeines' },
    attendance: '§ 58 Abs. 2 NSchG',
    offence: { norm: '§ 176' },
    leave: 'unmittelbar vor und nach den Ferien ist eine Befreiung nach Nr. 3.2.1 des RdErl. vom 08.12.2025 nur bei persönlicher Härte zulässig',
    sources: [
      'https://voris.wolterskluwer-online.de/browse/document/f33479ae-b8b9-3169-9986-83bc54f22c98',
      'https://voris.wolterskluwer-online.de/browse/document/5351f3ce-23b6-3f89-81c0-f2579f3b0ca2',
    ],
  },
  {
    state: 'NW',
    law: 'Schulgesetz für das Land Nordrhein-Westfalen',
    abbr: 'SchulG NRW',
    duty: { norm: '§ 34', title: 'Grundsätze' },
    attendance: '§ 43 Abs. 1 SchulG NRW',
    offence: { norm: '§ 126' },
    leave: 'unmittelbar vor und im Anschluss an die Ferien ist eine Beurlaubung nach BASS 12-52 Nr. 1 (Nr. 5.4) nur ausnahmsweise zulässig',
    sources: ['https://bass.schule.nrw/6043.htm', 'https://bass.schule.nrw/15402.htm'],
  },
  {
    state: 'RP',
    law: 'Schulgesetz Rheinland-Pfalz',
    abbr: 'SchulG',
    duty: { norm: '§ 56', title: 'Grundsatz' },
    attendance: '§ 64 Abs. 1 SchulG',
    offence: { norm: '§ 99', maxFine: '1.500 €' },
    leave: 'Beurlaubungen unmittelbar vor oder nach den Ferien sollen nach § 38 Abs. 2 ÜSchO nicht ausgesprochen werden',
    sources: ['https://landesrecht.rlp.de/bsrp/document/jlr-NNLRP00005A6BNN00000000157', 'https://landesrecht.rlp.de/bsrp/document/jlr-NNLRP00005B7FNN00000000091'],
  },
  {
    state: 'SL',
    law: 'Gesetz über die Schulpflicht im Saarland (Schulpflichtgesetz)',
    abbr: 'SchulPflG',
    duty: { norm: '§ 1', title: 'Allgemeine Schulpflicht' },
    attendance: '§ 6 ASchO',
    offence: { norm: '§ 17' },
    leave: 'über Urlaub unmittelbar vor oder nach den Ferien entscheidet nach § 9 Abs. 4 ASchO die Schulleitung',
    sources: ['https://recht.saarland.de/bssl/document/jlr-NNLSL00009D67NN00000000068', 'https://recht.saarland.de/bssl/document/jlr-NNLSL00009D6BNN00000000035'],
  },
  {
    state: 'SN',
    law: 'Sächsisches Schulgesetz',
    abbr: 'SächsSchulG',
    duty: { norm: '§ 26', title: 'Allgemeines' },
    attendance: '§ 26 Abs. 2 SächsSchulG',
    offence: { norm: '§ 61', maxFine: '1.250 €' },
    leave: 'eine Beurlaubung ist nach § 4 SBO nur in besonderen Ausnahmefällen möglich',
    sources: ['https://www.revosax.sachsen.de/vorschrift_gesamt/4192/47431.html', 'https://www.revosax.sachsen.de/vorschrift_gesamt/4864/3070.html'],
  },
  {
    state: 'ST',
    law: 'Schulgesetz des Landes Sachsen-Anhalt',
    abbr: 'SchulG LSA',
    duty: { norm: '§ 36', title: 'Allgemeines' },
    attendance: '§ 43 Abs. 1 SchulG LSA',
    offence: { norm: '§ 84', maxFine: '1.000 €' },
    leave: 'über Beurlaubungen bis zu zehn Unterrichtstagen entscheidet die Schulleitung (RdErl. vom 03.03.2010, Abschn. 2 Nr. 7)',
    sources: ['https://www.landesrecht.sachsen-anhalt.de/bsst/document/jlr-NNLST0000418ANN00000000209', 'https://www.landesrecht.sachsen-anhalt.de/bsst/document/VVST-VVST000004272'],
  },
  {
    state: 'SH',
    law: 'Schleswig-Holsteinisches Schulgesetz',
    abbr: 'SchulG',
    duty: { norm: '§ 20', title: 'Umfang der Schulpflicht' },
    attendance: '§ 11 Abs. 2 SchulG',
    offence: { norm: '§ 144' },
    leave: 'die „Verlängerung der Ferien“ ist nach dem Anwendungserlass zu § 15 SchulG kein wichtiger Grund für eine Beurlaubung',
    sources: [
      'https://www.gesetze-rechtsprechung.sh.juris.de/bssh/document/jlr-NNLSH00002AAFNN00000000501',
      'https://www.schleswig-holstein.de/DE/fachinhalte/S/schulrecht/Downloads/Erlasse/Downloads/Anwendungserlass_Beurlaubung.pdf',
    ],
  },
  {
    state: 'TH',
    law: 'Thüringer Schulgesetz',
    abbr: 'ThürSchulG',
    duty: { norm: '§ 17', title: 'Allgemeines zur Schulpflicht' },
    attendance: '§ 23 Abs. 1 ThürSchulG',
    offence: { norm: '§ 59', maxFine: '1.500 €' },
    leave: 'über Beurlaubungen unmittelbar vor und nach den Ferien entscheidet nach § 7 ThürSchulO die Schulleitung',
    sources: ['https://landesrecht.thueringen.de/bsth/document/jlr-NNLTH0000391BNN00000000220', 'https://landesrecht.thueringen.de/bsth/document/jlr-NNLTH0000384ENN00000000040'],
  },
];

export function schoolLaw(state: string): SchoolLaw | undefined {
  return SCHOOL_LAWS.find((l) => l.state === state);
}

/**
 * Übertrieben förmlicher „Amtlicher Hinweis“ für Reisen, die in die Unterrichtszeit ragen.
 * Nennt bewusst nicht die Zahl der Schultage.
 */
export function officialNotice(states: string[], type: HolidayType, year: string): { title: string; lines: string[]; footer: string } {
  const lines: string[] = [
    'Betreff: Beabsichtigte Unterrichtsversäumnis infolge einer Kreuzfahrt',
    `Az. FMA-${states.join('-')}/${holidayLabel(type).toUpperCase().replace(/FERIEN$/, '')}-${year} · Ihr Zeichen: Fernweh`,
    '',
    'Sehr geehrte Reisende,',
    'wir gestatten uns den förmlichen Hinweis, dass die gewählte Reise in die Unterrichtszeit hineinragt.',
  ];
  for (const st of states) {
    const law = schoolLaw(st);
    if (!law) continue;
    const info = stateInfo(st);
    const fine = law.offence.maxFine ? `mit einer Geldbuße bis zu ${law.offence.maxFine}` : 'mit einer Geldbuße (bis 1.000 €, § 17 OWiG)';
    lines.push('');
    lines.push(
      `${info.in[0]!.toUpperCase()}${info.in.slice(1)} folgt die Schulpflicht aus ${law.duty.norm} ${law.abbr} (${law.duty.title}); ` +
        `die regelmäßige Teilnahme am Unterricht regelt ${law.attendance}. ` +
        `Zuwiderhandlungen können nach ${law.offence.norm} ${law.abbr} als Ordnungswidrigkeit ${fine} geahndet werden.`,
    );
    if (law.leave) lines.push(`Ferner gilt: ${law.leave}.`);
  }
  lines.push('');
  lines.push('Einwendungen sind schriftlich, in dreifacher Ausfertigung und vor Abfahrt einzureichen. Sonnencreme ist dessen ungeachtet mitzuführen.');
  lines.push('Hochachtungsvoll · i. A. Ihre Reiseleitung');
  return { title: 'AMTLICHER HINWEIS', lines, footer: 'Kein Rechtsrat. Über Beurlaubungen entscheidet die Schule.' };
}
