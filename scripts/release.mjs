#!/usr/bin/env node
// Sobe um release pro bucket "releases" do Supabase Storage:
//  1. Lê versão de src-tauri/tauri.conf.json
//  2. Lê notas de CHANGELOG.md (seção `## [<versão>]`)
//  3. Pega o .nsis.zip + .sig de src-tauri/target/release/bundle/nsis/
//  4. Faz upload dos 2 arquivos + reescreve latest.json apontando pra eles
//
// Requer variável de ambiente SUPABASE_SERVICE_ROLE_KEY (chave secreta, não a anon).
// Uso: npm run release

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nzwfgkcboopjkicbwyry.supabase.co';
const BUCKET = 'releases';
const PLATFORM = 'windows-x86_64';
const BUNDLE_DIR = 'src-tauri/target/release/bundle/nsis';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não definida.');
  console.error('   Pegue em Supabase Dashboard → Settings → API → service_role (secret).');
  console.error('   Defina no terminal antes de rodar:  set SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

// 1. versão
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = conf.version;
console.log(`📦 Release v${version}`);

// 2. notas
if (!existsSync('CHANGELOG.md')) {
  console.error('❌ CHANGELOG.md não encontrado.');
  process.exit(1);
}
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const sectionRegex = new RegExp(
  `## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`,
  'm'
);
const match = changelog.match(sectionRegex);
if (!match) {
  console.error(`❌ Nenhuma seção "## [${version}]" em CHANGELOG.md.`);
  console.error('   Adicione as notas dessa versão antes de subir.');
  process.exit(1);
}
const notes = match[1].trim();
console.log(`📝 Notas (${notes.split('\n').length} linhas):\n${notes}\n`);

// 3. bundle + sig
if (!existsSync(BUNDLE_DIR)) {
  console.error(`❌ ${BUNDLE_DIR} não existe. Rode "npm run tauri build" antes.`);
  process.exit(1);
}
const files = readdirSync(BUNDLE_DIR);
const zipName = files.find((f) => f.endsWith('.nsis.zip'));
const sigName = files.find((f) => f.endsWith('.nsis.zip.sig'));
if (!zipName || !sigName) {
  console.error('❌ Arquivos .nsis.zip / .nsis.zip.sig não encontrados.');
  console.error('   Confirme que TAURI_SIGNING_PRIVATE_KEY está no env durante o build.');
  process.exit(1);
}
console.log(`📁 Bundle:    ${zipName}`);
console.log(`🔏 Signature: ${sigName}`);

const zipBuf = readFileSync(join(BUNDLE_DIR, zipName));
const sigBuf = readFileSync(join(BUNDLE_DIR, sigName));
const signature = sigBuf.toString('utf8').trim();

// 4. upload
const supabase = createClient(SUPABASE_URL, serviceKey);

async function upload(path, body, contentType) {
  console.log(`⬆️  ${path}`);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    console.error(`❌ Falha ao subir ${path}: ${error.message}`);
    process.exit(1);
  }
}

const zipPath = `v${version}/${zipName}`;
await upload(zipPath, zipBuf, 'application/zip');

const publicZipUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${zipPath}`;

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [PLATFORM]: {
      signature,
      url: publicZipUrl,
    },
  },
};

await upload('latest.json', JSON.stringify(latest, null, 2), 'application/json');

console.log(`\n✅ Release v${version} publicada.`);
console.log(`   Os kiosks vão pegar a atualização na próxima checagem.`);
