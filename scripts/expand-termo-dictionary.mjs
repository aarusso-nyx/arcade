#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'public/assets/termo');

const LENGTH_FILES = new Map([
  [5, 'valid-guesses.txt'],
  [6, 'valid-guesses-6.txt'],
  [7, 'valid-guesses-7.txt'],
]);

const SOLUTION_FILES = new Map([
  [5, 'solutions.txt'],
  [6, 'solutions-6.txt'],
  [7, 'solutions-7.txt'],
]);

const REGULAR_ENDINGS = {
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

const IRREGULAR_VERB_FORMS = {
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
  SAIR: ['SAIO', 'SAI', 'SAEM', 'SAIU', 'SAIA', 'SAIREI', 'SAIRIA', 'SAIDO'],
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

const SUPPLEMENTAL_MORPHOLOGY_SEEDS = [
  // Four-letter stems are not present in the 5/6/7-letter Termo assets,
  // but their common plurals can be valid 5-letter guesses.
  'rena',
];

const COMMON_VERBS = [
  'abrir',
  'acabar',
  'achar',
  'acontecer',
  'acordar',
  'acreditar',
  'admitir',
  'adorar',
  'ajudar',
  'alcançar',
  'amar',
  'andar',
  'apagar',
  'aparecer',
  'aprender',
  'apresentar',
  'aproveitar',
  'arrumar',
  'assistir',
  'assumir',
  'atender',
  'atingir',
  'avisar',
  'baixar',
  'bater',
  'beber',
  'botar',
  'brincar',
  'buscar',
  'caber',
  'cair',
  'calar',
  'cantar',
  'casar',
  'causar',
  'chegar',
  'chorar',
  'chamar',
  'colocar',
  'comecar',
  'comentar',
  'comer',
  'comprar',
  'conduzir',
  'confiar',
  'conhecer',
  'conseguir',
  'contar',
  'continuar',
  'convidar',
  'corrigir',
  'correr',
  'cortar',
  'cozinhar',
  'crer',
  'crescer',
  'cuidar',
  'cumprir',
  'curtir',
  'custar',
  'dar',
  'decidir',
  'deixar',
  'deitar',
  'depender',
  'descer',
  'desejar',
  'desistir',
  'dever',
  'dizer',
  'doer',
  'dormir',
  'duvidar',
  'educar',
  'encontrar',
  'entrar',
  'entregar',
  'enviar',
  'errar',
  'escapar',
  'escolher',
  'escrever',
  'escutar',
  'esperar',
  'esquecer',
  'estar',
  'estudar',
  'evitar',
  'existir',
  'explicar',
  'falar',
  'faltar',
  'fazer',
  'fechar',
  'ficar',
  'filmar',
  'ganhar',
  'gastar',
  'gostar',
  'gravar',
  'gritar',
  'guardar',
  'haver',
  'imaginar',
  'impedir',
  'incluir',
  'insistir',
  'jogar',
  'juntar',
  'lavar',
  'lembrar',
  'ler',
  'levar',
  'ligar',
  'limpar',
  'lutar',
  'mandar',
  'marcar',
  'matar',
  'medir',
  'mentir',
  'mexer',
  'morar',
  'morrer',
  'mostrar',
  'mudar',
  'nascer',
  'notar',
  'obedecer',
  'olhar',
  'ouvir',
  'pagar',
  'parar',
  'parecer',
  'partir',
  'passar',
  'pedir',
  'pegar',
  'pensar',
  'perceber',
  'perder',
  'permitir',
  'poder',
  'por',
  'precisar',
  'preferir',
  'preparar',
  'prender',
  'procurar',
  'prometer',
  'propor',
  'proteger',
  'pular',
  'querer',
  'receber',
  'reclamar',
  'reconhecer',
  'resolver',
  'responder',
  'rir',
  'saber',
  'sair',
  'salvar',
  'sentar',
  'sentir',
  'ser',
  'servir',
  'subir',
  'sumir',
  'surgir',
  'tentar',
  'ter',
  'terminar',
  'tirar',
  'tocar',
  'tomar',
  'torcer',
  'trabalhar',
  'tratar',
  'trazer',
  'trocar',
  'usar',
  'valer',
  'vender',
  'vencer',
  'ver',
  'viajar',
  'vir',
  'virar',
  'viver',
  'voltar',
  'votar',
];

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function cleanWord(value) {
  const word = normalize(value.trim());
  return /^[A-Z]+$/.test(word) ? word : '';
}

function pluralVariants(word) {
  if (word.endsWith('AO')) return [`${word.slice(0, -2)}OES`];
  if (/[AEIOU]$/.test(word)) return [`${word}S`];
  if (/[RZ]$/.test(word)) return [`${word}ES`];
  if (SINGULAR_TERMINAL_S_WORDS.has(word)) return [`${word}ES`];
  if (word.endsWith('M')) return [`${word.slice(0, -1)}NS`];
  if (word.endsWith('L')) return [`${word.slice(0, -1)}IS`];
  return [];
}

function genderVariants(word) {
  if (word.endsWith('O')) return [`${word.slice(0, -1)}A`];
  if (word.endsWith('A')) return [`${word.slice(0, -1)}O`];
  return [];
}

function verbClass(infinitive) {
  if (infinitive.endsWith('AR')) return 'AR';
  if (infinitive.endsWith('ER')) return 'ER';
  if (infinitive.endsWith('IR')) return 'IR';
  return null;
}

function regularVerbForms(infinitive) {
  const cls = verbClass(infinitive);
  if (!cls || infinitive.length <= 2) return [];

  const stem = infinitive.slice(0, -2);
  const endings = REGULAR_ENDINGS[cls];
  return [
    infinitive,
    ...endings.present.map((ending) => `${stem}${ending}`),
    ...endings.preterite.map((ending) => `${stem}${ending}`),
    ...endings.imperfect.map((ending) => `${stem}${ending}`),
    ...endings.future.map((ending) => `${stem}${ending}`),
    ...endings.conditional.map((ending) => `${stem}${ending}`),
    ...endings.subjunctive.map((ending) => `${stem}${ending}`),
    ...endings.imperative.map((ending) => `${stem}${ending}`),
    `${stem}${endings.participle}`,
    `${stem}${endings.gerund}`,
  ];
}

function verbForms(infinitive) {
  return Array.from(
    new Set([...regularVerbForms(infinitive), ...(IRREGULAR_VERB_FORMS[infinitive] ?? [])]),
  );
}

async function readWords(fileName) {
  const raw = await readFile(path.join(ASSET_DIR, fileName), 'utf8');
  return raw.split('\n').map(cleanWord).filter(Boolean);
}

const validByLength = new Map();
const beforeCounts = new Map();
const allSourceWords = new Set();

for (const [length, fileName] of LENGTH_FILES) {
  const words = await readWords(fileName);
  const filtered = words.filter((word) => word.length === length);
  validByLength.set(length, new Set(filtered));
  beforeCounts.set(length, filtered.length);
  filtered.forEach((word) => allSourceWords.add(word));
}

for (const [length, fileName] of SOLUTION_FILES) {
  const words = await readWords(fileName);
  words
    .filter((word) => word.length === length)
    .forEach((word) => {
      validByLength.get(length)?.add(word);
      allSourceWords.add(word);
    });
}

for (const seed of SUPPLEMENTAL_MORPHOLOGY_SEEDS) {
  const word = cleanWord(seed);
  if (word) allSourceWords.add(word);
}

function addCandidate(word) {
  if (!/^[A-Z]+$/.test(word)) return;
  const target = validByLength.get(word.length);
  if (!target || target.has(word)) return false;
  target.add(word);
  return true;
}

const verbSeeds = new Set(COMMON_VERBS.map(cleanWord).filter(Boolean));
for (const word of allSourceWords) {
  if (/^[A-Z]{4,10}(AR|ER|IR)$/.test(word)) verbSeeds.add(word);
}
for (const verb of Object.keys(IRREGULAR_VERB_FORMS)) verbSeeds.add(verb);

const morphologyQueue = [...allSourceWords];
const verbQueue = [...verbSeeds];
const processedMorphology = new Set();
const processedVerbs = new Set();

function enqueueWord(word) {
  morphologyQueue.push(word);
  if (/^[A-Z]{4,10}(AR|ER|IR)$/.test(word)) verbQueue.push(word);
}

while (morphologyQueue.length > 0 || verbQueue.length > 0) {
  while (morphologyQueue.length > 0) {
    const word = morphologyQueue.pop();
    if (!word || processedMorphology.has(word)) continue;
    processedMorphology.add(word);

    for (const candidate of [...genderVariants(word), ...pluralVariants(word)]) {
      if (addCandidate(candidate)) enqueueWord(candidate);
    }
  }

  const verb = verbQueue.pop();
  if (!verb || processedVerbs.has(verb)) continue;
  processedVerbs.add(verb);

  for (const form of verbForms(verb)) {
    if (addCandidate(form)) enqueueWord(form);
    for (const candidate of [...genderVariants(form), ...pluralVariants(form)]) {
      if (addCandidate(candidate)) enqueueWord(candidate);
    }
  }
}

for (const [length, fileName] of LENGTH_FILES) {
  const words = Array.from(validByLength.get(length)).sort();
  await writeFile(
    path.join(ASSET_DIR, fileName),
    `${words.map((word) => word.toLowerCase()).join('\n')}\n`,
    'utf8',
  );
  console.log(`${fileName}: ${beforeCounts.get(length)} -> ${words.length}`);
}
