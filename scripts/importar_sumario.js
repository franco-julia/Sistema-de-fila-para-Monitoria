const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const FILE_PATH = './01_SUMÁRIO_6V_UNIFICADO.xlsx';

// Ex.: A01, B12, C03
const MODULE_CODE_REGEX = /^[A-Z]\d{2}$/i;

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

function isModuleCode(value) {
  const text = normalizeText(value);
  return !!text && MODULE_CODE_REGEX.test(text);
}

function isPortugueseSheet(sheetName) {
  const text = normalizeText(sheetName)?.toLowerCase() || '';
  return text.includes('portugu');
}

function isArtsSheet(sheetName) {
  const text = normalizeText(sheetName)?.toLowerCase() || '';
  return text.includes('arte');
}

function isFrontLabel(value) {
  const text = normalizeText(value);
  return !!text && /^frente\s+[a-z]$/i.test(text);
}

function isBookLabel(value) {
  const text = normalizeText(value);
  return !!text && /^livro[-\s]?\d+/i.test(text);
}

function shouldIgnoreAsTopic(text) {
  if (!text) return true;

  return (
    /^frente\s+[a-z]$/i.test(text) ||
    /^livro[-\s]?\d+/i.test(text) ||
    /^m[oó]d/i.test(text) ||
    /^módulo/i.test(text) ||
    /^aula/i.test(text) ||
    /^conte[uú]dos?/i.test(text) ||
    /^tema/i.test(text) ||
    /^tópicos?/i.test(text)
  );
}

async function upsertSubject(name) {
  return prisma.subject.upsert({
    where: { name },
    update: {},
    create: { name }
  });
}

async function saveParsedModules(parsedModules) {
  const subjectCache = new Map();

  for (const item of parsedModules) {
    let subject = subjectCache.get(item.subjectName);

    if (!subject) {
      subject = await upsertSubject(item.subjectName);
      subjectCache.set(item.subjectName, subject);
    }

    const moduleRecord = await prisma.module.upsert({
      where: {
        subjectId_code: {
          subjectId: subject.id,
          code: item.code
        }
      },
      update: {
        title: item.title,
        front: item.front || null,
        book: item.book || null,
        sourceSheet: item.sourceSheet || null,
        sortOrder: item.sortOrder ?? null
      },
      create: {
        subjectId: subject.id,
        code: item.code,
        title: item.title,
        front: item.front || null,
        book: item.book || null,
        sourceSheet: item.sourceSheet || null,
        sortOrder: item.sortOrder ?? null
      }
    });

    await prisma.topic.deleteMany({
      where: { moduleId: moduleRecord.id }
    });

    if (item.topics?.length) {
      await prisma.topic.createMany({
        data: item.topics.map((topic, index) => ({
          moduleId: moduleRecord.id,
          name: topic,
          sortOrder: index + 1
        }))
      });
    }
  }
}

function parsePortugueseSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false
  });

  const modules = [];
  const currentByStartCol = {};
  let fronts = {};

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r].map(normalizeText);

    // Detecta cabeçalhos "Frente A", "Frente B", etc.
    for (let c = 0; c < row.length; c++) {
      if (isFrontLabel(row[c])) {
        fronts[c] = row[c];
      }
    }

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];

      if (!cell) continue;

      if (isModuleCode(cell)) {
        const front = fronts[c] || fronts[c - 1] || null;
        const title = row[c + 1] || '';

        const mod = {
          subjectName: sheetName,
          sourceSheet: sheetName,
          code: cell,
          title,
          front,
          book: null,
          topics: [],
          sortOrder: modules.length + 1
        };

        modules.push(mod);
        currentByStartCol[c] = mod;
        continue;
      }

      const currentModule =
        currentByStartCol[c] ||
        currentByStartCol[c - 1] ||
        currentByStartCol[c - 2] ||
        null;

      if (!currentModule) continue;
      if (cell === currentModule.title) continue;
      if (isModuleCode(cell)) continue;
      if (shouldIgnoreAsTopic(cell)) continue;

      const alreadyExists = currentModule.topics.includes(cell);
      if (!alreadyExists) {
        currentModule.topics.push(cell);
      }
    }
  }

  return modules.filter(m => m.code && m.title);
}

function parseArtsSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false
  });

  const modules = [];
  let currentBook = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r].map(normalizeText);

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];

      if (!cell) continue;

      if (isBookLabel(cell)) {
        currentBook = cell;
      }

      if (isModuleCode(cell)) {
        const title = row[c + 1] || row[c + 2] || '';

        if (!title) continue;

        modules.push({
          subjectName: sheetName,
          sourceSheet: sheetName,
          code: cell,
          title,
          front: null,
          book: currentBook,
          topics: [],
          sortOrder: modules.length + 1
        });
      }
    }
  }

  return modules.filter(m => m.code && m.title);
}

function parseGenericSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false
  });

  const modules = [];
  const activeModuleByCol = {};
  let fronts = {};
  let currentBook = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r].map(normalizeText);

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];

      if (!cell) continue;

      if (isFrontLabel(cell)) fronts[c] = cell;
      if (isBookLabel(cell)) currentBook = cell;
    }

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];

      if (!cell) continue;

      if (isModuleCode(cell)) {
        const title = row[c + 1] || '';
        if (!title) continue;

        const mod = {
          subjectName: sheetName,
          sourceSheet: sheetName,
          code: cell,
          title,
          front: fronts[c] || fronts[c - 1] || null,
          book: currentBook,
          topics: [],
          sortOrder: modules.length + 1
        };

        modules.push(mod);
        activeModuleByCol[c] = mod;
        continue;
      }

      const currentModule =
        activeModuleByCol[c] ||
        activeModuleByCol[c - 1] ||
        activeModuleByCol[c - 2] ||
        null;

      if (!currentModule) continue;
      if (cell === currentModule.title) continue;
      if (shouldIgnoreAsTopic(cell)) continue;

      const exists = currentModule.topics.includes(cell);
      if (!exists) currentModule.topics.push(cell);
    }
  }

  return modules.filter(m => m.code && m.title);
}

function parseSheet(sheetName, sheet) {
  if (isPortugueseSheet(sheetName)) {
    console.log(`Lendo aba de Português: ${sheetName}`);
    return parsePortugueseSheet(sheetName, sheet);
  }

  if (isArtsSheet(sheetName)) {
    console.log(`Lendo aba de Artes: ${sheetName}`);
    return parseArtsSheet(sheetName, sheet);
  }

  console.log(`Lendo aba genérica: ${sheetName}`);
  return parseGenericSheet(sheetName, sheet);
}

async function main() {
  console.log('Iniciando importação do sumário...');

  const workbook = XLSX.readFile(FILE_PATH);
  const parsedModules = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const modules = parseSheet(sheetName, sheet);

    console.log(`- ${sheetName}: ${modules.length} módulos encontrados`);
    parsedModules.push(...modules);
  }

  console.log(`Total de módulos encontrados: ${parsedModules.length}`);

  await saveParsedModules(parsedModules);

  console.log('Importação concluída com sucesso.');
}

main()
  .catch((error) => {
    console.error('Erro na importação:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });