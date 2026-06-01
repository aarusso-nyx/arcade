import { normalize } from './normalize';

type VerbClass = 'AR' | 'ER' | 'IR';

const REGULAR_ENDINGS: Record<
  VerbClass,
  {
    present: readonly string[];
    preterite: readonly string[];
    imperfect: readonly string[];
    future: readonly string[];
    conditional: readonly string[];
    subjunctive: readonly string[];
    imperative: readonly string[];
    participle: string;
    gerund: string;
  }
> = {
  AR: {
    present: ['O', 'AS', 'A', 'AMOS', 'AM'],
    preterite: ['EI', 'OU', 'AMOS', 'ARAM'],
    imperfect: ['AVA', 'AVAS', 'AVAMOS', 'AVAM'],
    future: ['AREI', 'ARA', 'AREMOS', 'ARAO'],
    conditional: ['ARIA', 'ARIAS', 'ARIAMOS', 'ARIAM'],
    subjunctive: ['E', 'ES', 'EMOS', 'EM'],
    imperative: ['A', 'E', 'EM'],
    participle: 'ADO',
    gerund: 'ANDO',
  },
  ER: {
    present: ['O', 'ES', 'E', 'EMOS', 'EM'],
    preterite: ['I', 'EU', 'EMOS', 'ERAM'],
    imperfect: ['IA', 'IAS', 'IAMOS', 'IAM'],
    future: ['EREI', 'ERA', 'EREMOS', 'ERAO'],
    conditional: ['ERIA', 'ERIAS', 'ERIAMOS', 'ERIAM'],
    subjunctive: ['A', 'AS', 'AMOS', 'AM'],
    imperative: ['E', 'A', 'AM'],
    participle: 'IDO',
    gerund: 'ENDO',
  },
  IR: {
    present: ['O', 'ES', 'E', 'IMOS', 'EM'],
    preterite: ['I', 'IU', 'IMOS', 'IRAM'],
    imperfect: ['IA', 'IAS', 'IAMOS', 'IAM'],
    future: ['IREI', 'IRA', 'IREMOS', 'IRAO'],
    conditional: ['IRIA', 'IRIAS', 'IRIAMOS', 'IRIAM'],
    subjunctive: ['A', 'AS', 'AMOS', 'AM'],
    imperative: ['E', 'A', 'AM'],
    participle: 'IDO',
    gerund: 'INDO',
  },
};

export const IRREGULAR_VERB_FORMS: Record<string, readonly string[]> = {
  DAR: ['DOU', 'DA', 'DAO', 'DEI', 'DEU', 'DERAM', 'DAVA', 'DAREI', 'DARIA', 'DEEM', 'DADO'],
  DIZER: ['DIGO', 'DIZ', 'DISSE', 'DIZIA', 'DIREI', 'DIRIA', 'DITO', 'DIGA'],
  ESTAR: [
    'ESTOU',
    'ESTA',
    'ESTAO',
    'ESTAVA',
    'ESTIVE',
    'ESTEVE',
    'ESTEJA',
    'ESTEJAM',
    'ESTAREI',
    'ESTARIA',
    'ESTADO',
  ],
  FAZER: ['FACO', 'FAZ', 'FEZ', 'FIZ', 'FIZERAM', 'FAZIA', 'FAREI', 'FARIA', 'FEITO', 'FACA'],
  HAVER: ['HEI', 'HA', 'HAO', 'HAVIA', 'HOUVE', 'HAVERA', 'HAVERIA', 'HAJA'],
  IR: [
    'VOU',
    'VAI',
    'VAO',
    'VAMOS',
    'FUI',
    'FOI',
    'FOMOS',
    'FORAM',
    'IA',
    'IAM',
    'IREI',
    'IRIA',
    'VA',
  ],
  LER: ['LEIO', 'LE', 'LEEM', 'LI', 'LEU', 'LERAM', 'LIA', 'LEREI', 'LERIA', 'LEIA', 'LIDO'],
  OUVIR: [
    'OUCO',
    'OUVE',
    'OUVEM',
    'OUVI',
    'OUVIU',
    'OUVIA',
    'OUVIREI',
    'OUVIRIA',
    'OUCA',
    'OUVIDO',
  ],
  PEDIR: [
    'PECO',
    'PEDE',
    'PEDEM',
    'PEDI',
    'PEDIU',
    'PEDIA',
    'PEDIREI',
    'PEDIRIA',
    'PECA',
    'PEDIDO',
  ],
  PODER: ['POSSO', 'PODE', 'PODEM', 'PUDE', 'PODIA', 'PODEREI', 'PODERIA', 'POSSA', 'PODIDO'],
  POR: ['PONHO', 'POE', 'POEM', 'PUS', 'POS', 'PUNHA', 'PORIA', 'POREI', 'PONHA', 'POSTO'],
  QUERER: [
    'QUERO',
    'QUER',
    'QUEREM',
    'QUIS',
    'QUISERAM',
    'QUERIA',
    'QUEREREI',
    'QUERERIA',
    'QUEIRA',
    'QUERIDO',
  ],
  SABER: ['SEI', 'SABE', 'SABEM', 'SOUBE', 'SABIA', 'SABEREI', 'SABERIA', 'SAIBA', 'SABIDO'],
  SAIR: ['SAIO', 'SAI', 'SAEM', 'SAI', 'SAIU', 'SAIA', 'SAIREI', 'SAIRIA', 'SAIA', 'SAIDO'],
  SER: [
    'SOU',
    'ES',
    'E',
    'SOMOS',
    'SAO',
    'FUI',
    'FOI',
    'FOMOS',
    'FORAM',
    'ERA',
    'ERAM',
    'SEREI',
    'SERIA',
    'SEJA',
  ],
  TER: ['TENHO', 'TEM', 'TEMOS', 'TINHA', 'TIVE', 'TEVE', 'TEREI', 'TERIA', 'TENHA', 'TIDO'],
  TRAZER: ['TRAGO', 'TRAZ', 'TROUXE', 'TRAZIA', 'TRAREI', 'TRARIA', 'TRAGA', 'TRAZIDO'],
  VALER: [
    'VALHO',
    'VALE',
    'VALEM',
    'VALI',
    'VALEU',
    'VALIA',
    'VALEREI',
    'VALERIA',
    'VALHA',
    'VALIDO',
  ],
  VER: ['VEJO', 'VE', 'VEEM', 'VI', 'VIU', 'VIA', 'VEREI', 'VERIA', 'VEJA', 'VISTO'],
  VIR: ['VENHO', 'VEM', 'VIM', 'VEIO', 'VINHA', 'VIREI', 'VIRIA', 'VENHA', 'VINDO'],
};

const SINGULAR_TERMINAL_S_WORDS = new Set(['LAPIS', 'ONIBUS', 'PIRES']);

export function pluralVariants(word: string): string[] {
  const normalized = normalize(word);
  if (normalized.length === 0) return [];

  if (normalized.endsWith('AO')) return [`${normalized.slice(0, -2)}OES`];
  if (/[AEIOU]$/.test(normalized)) return [`${normalized}S`];
  if (/[RZ]$/.test(normalized)) return [`${normalized}ES`];
  if (SINGULAR_TERMINAL_S_WORDS.has(normalized)) return [`${normalized}ES`];
  if (normalized.endsWith('M')) return [`${normalized.slice(0, -1)}NS`];
  if (normalized.endsWith('L')) return [`${normalized.slice(0, -1)}IS`];

  return [];
}

export function genderVariants(word: string): string[] {
  const normalized = normalize(word);
  if (normalized.endsWith('O')) return [`${normalized.slice(0, -1)}A`];
  if (normalized.endsWith('A')) return [`${normalized.slice(0, -1)}O`];
  return [];
}

function verbClass(infinitive: string): VerbClass | null {
  if (infinitive.endsWith('AR')) return 'AR';
  if (infinitive.endsWith('ER')) return 'ER';
  if (infinitive.endsWith('IR')) return 'IR';
  return null;
}

export function regularVerbForms(infinitive: string): string[] {
  const normalized = normalize(infinitive);
  const cls = verbClass(normalized);
  if (!cls || normalized.length <= 2) return [];

  const stem = normalized.slice(0, -2);
  const endings = REGULAR_ENDINGS[cls];
  return Array.from(
    new Set([
      normalized,
      ...endings.present.map((ending) => `${stem}${ending}`),
      ...endings.preterite.map((ending) => `${stem}${ending}`),
      ...endings.imperfect.map((ending) => `${stem}${ending}`),
      ...endings.future.map((ending) => `${stem}${ending}`),
      ...endings.conditional.map((ending) => `${stem}${ending}`),
      ...endings.subjunctive.map((ending) => `${stem}${ending}`),
      ...endings.imperative.map((ending) => `${stem}${ending}`),
      `${stem}${endings.participle}`,
      `${stem}${endings.gerund}`,
    ]),
  );
}

export function verbForms(infinitive: string): string[] {
  const normalized = normalize(infinitive);
  return Array.from(
    new Set([...regularVerbForms(normalized), ...(IRREGULAR_VERB_FORMS[normalized] ?? [])]),
  );
}

export function morphologyVariants(word: string): string[] {
  return Array.from(new Set([...pluralVariants(word), ...genderVariants(word)]));
}
