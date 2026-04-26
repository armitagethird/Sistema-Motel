# Como publicar uma atualização

Guia passo a passo pra você (dono) publicar uma nova versão do app no kiosk do motel via Supabase Storage.

---

## 1. Setup uma vez só

### 1.1. Gerar par de chaves de assinatura

Na sua máquina, com Tauri instalado:

```bash
npm run tauri signer generate -- -w ~/.tauri/paraiso.key
```

- Define uma senha forte. **Anota num gerenciador de senhas.**
- Gera 2 arquivos: `~/.tauri/paraiso.key` (privada, NUNCA compartilha) e `~/.tauri/paraiso.key.pub` (pública).

### 1.2. ⚠️ Backup da chave privada

**Se perder a chave privada, nunca mais consegue publicar atualizações.** O app fica preso na versão atual e a única saída é distribuir uma nova v1 manualmente com pubkey nova.

Backup obrigatório em pelo menos 2 lugares:
- Gerenciador de senhas (1Password / Bitwarden)
- Pen drive offline guardado em local seguro

### 1.3. Colar a pubkey em `tauri.conf.json`

Abre `~/.tauri/paraiso.key.pub`, copia o conteúdo (linha única tipo `dW50cnVzdGVkIGNvbW1lbnQ6...`) e cola em `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": [...],
    "dialog": false,
    "pubkey": "<COLE AQUI O CONTEÚDO DE paraiso.key.pub>",
    ...
  }
}
```

Commita essa mudança.

### 1.4. Configurar variáveis de ambiente

No terminal que vai rodar `npm run tauri build`:

```bash
# Windows (PowerShell)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw ~/.tauri/paraiso.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "sua-senha-aqui"

# Pra release
$env:SUPABASE_SERVICE_ROLE_KEY = "..."  # pega em Supabase → Settings → API → service_role
```

Recomendado: criar um `.env.release` (fora do git) e carregar antes de cada release.

### 1.5. Criar o bucket no Supabase

Dashboard → Storage → New bucket:
- **Nome**: `releases`
- **Public bucket**: ✅ SIM (read público pro updater funcionar)

Sem RLS extra. O `service_role` key tem write automático; o anon (e o app no kiosk) só lê.

---

## 2. Em cada release

### 2.1. Atualizar o `CHANGELOG.md`

Adiciona uma seção no topo:

```markdown
## [1.2.0] - 2026-05-15

### Added
- Funcionalidade tal

### Fixed
- Bug tal
```

A seção é o que aparece pro dono na tela de "Atualização disponível" — escreve direto o que ele vai ler.

### 2.2. Bumpar a versão em 3 arquivos

Mantém os 3 sempre alinhados (senão o updater quebra silenciosamente):

- `src-tauri/tauri.conf.json` → `"version": "1.2.0"`
- `src-tauri/Cargo.toml` → `version = "1.2.0"`
- `package.json` → `"version": "1.2.0"`

### 2.3. Build assinado

```bash
npm run tauri build
```

Tauri vai pedir a senha da chave privada (ou pegar do env). Se der certo, output em `src-tauri/target/release/bundle/nsis/`:
- `Paraíso Recepção_1.2.0_x64-setup.exe` — instalador normal pra distribuição inicial
- `Paraíso Recepção_1.2.0_x64-setup.nsis.zip` — bundle do updater
- `Paraíso Recepção_1.2.0_x64-setup.nsis.zip.sig` — assinatura

Se o `.sig` não foi gerado, a chave privada não tá visível pro processo — verifica `TAURI_SIGNING_PRIVATE_KEY`.

### 2.4. Publicar

```bash
npm run release
```

O script:
1. Lê a versão de `tauri.conf.json`
2. Lê as notas da seção `## [1.2.0]` em `CHANGELOG.md`
3. Sobe `Paraíso Recepção_1.2.0_x64-setup.nsis.zip` pra `releases/v1.2.0/`
4. Reescreve `releases/latest.json` apontando pra essa versão

A partir desse momento, todo kiosk com a app aberta vai detectar a atualização na próxima abertura (ou quando o dono clicar "Verificar agora" na aba Auditoria).

### 2.5. Commit + tag

```bash
git add -A
git commit -m "release v1.2.0"
git tag v1.2.0
git push origin main --tags
```

---

## 3. Como o dono atualiza no kiosk

1. Abre o app, faz login (role `owner`)
2. Vai em **Auditoria** → aba **Atualização** (vai ter um ⚡ se houver versão nova)
3. Vê a versão atual, a nova versão e as notas
4. Clica em **Instalar e reiniciar agora**
5. O app baixa, verifica a assinatura, instala e reinicia automaticamente

---

## 4. Primeira instalação no destino

**Status atual (2026-04-25)**: o app ainda não foi instalado no kiosk da recepção. A primeira versão a chegar lá vai ser a v1.1.0 (já com o auto-updater embutido), então **não há ponte manual de v1.0.0 → v1.1.0 a fazer**. Hoje o `.exe` da v1.1.0 está rodando só no PC de casa do proprietário pra teste.

Pra qualquer máquina nova (PC do dono, kiosk da recepção, etc.):

1. Compila com `npm run tauri build` (com a `TAURI_SIGNING_PRIVATE_KEY` no env).
2. Pega o `.exe` em `src-tauri/target/release/bundle/nsis/` (o instalador normal — não o `.nsis.zip`).
3. Manda pro destino (e-mail, drive, pen drive — o que for prático). Roda como qualquer instalador Windows.
4. Daí em diante, todo update da máquina acontece sozinho via `npm run release`. Sem mais cópia manual.

A diferença entre o `.exe` e o `.nsis.zip`:
- `.exe` — instalador completo, usado na **primeira** instalação numa máquina.
- `.nsis.zip` (+ `.sig`) — bundle do auto-updater, usado em **todos os updates seguintes**. É o que o `npm run release` sobe pro Supabase.

---

## 5. Rollback / desfazer

Se a v1.2.0 estiver quebrada, edita `releases/latest.json` no Supabase Storage manualmente apontando de volta pra v1.1.0 (ou roda `npm run release` numa branch antiga). Os kiosks vão "ver" a v1.1.0 como mais nova na próxima checagem e instalar.

⚠️ Como o updater compara versões via SemVer, **a versão do `latest.json` precisa ser maior** que a do kiosk. Em rollback puro isso não acontece — então o caminho real é: corrigir o bug, bumpar pra v1.2.1, publicar.
