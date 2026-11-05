import { writeFile } from 'node:fs/promises';
import { jsonSchema } from '../src/schema.js';
import { extractionPrompt } from '../src/prompt.js';
import { example } from '../src/example.js';
await Promise.all([
  writeFile('public/schedule.schema.json', JSON.stringify(jsonSchema, null, 2) + '\n'),
  writeFile('public/extraction-prompt.txt', extractionPrompt),
  writeFile('public/example.json', JSON.stringify(example, null, 2) + '\n'),
  writeFile('examples/fictional-schedule.json', JSON.stringify(example, null, 2) + '\n'),
  writeFile('docs/GPT-PROMPT.txt', extractionPrompt),
]);
