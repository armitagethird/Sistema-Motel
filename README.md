<div align="center">

# Paraíso Recepção

**Aplicativo desktop de frente de caixa para o Paraíso Motel**
Kiosk Windows (.exe) — check-in, check-out, controle de suítes, estoque, turno, auditoria e pagamentos integrados.

[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=black)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Realtime-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Rust](https://img.shields.io/badge/Rust-1.95-000000?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Versão](https://img.shields.io/badge/version-1.1.1-blue)](./CHANGELOG.md)

</div>

---

## Visão geral

App desktop, em tela única (kiosk), instalado no PC da recepção. Foi desenhado para ser:

- **Rápido** — toda navegação por estado local; UI sempre responsiva.
- **Confiável offline** — operações são enfileiradas em `localStorage` e replicadas quando a conexão volta.
- **Auditável** — toda ação relevante gera log JSONL local + linha em `audit_log` no Supabase.
- **Seguro por papel** — recepcionista, gerente e dono têm permissões distintas; ações críticas exigem PIN.
- **Atualizável remotamente** — o dono publica novas versões pelo Supabase Storage e o app se auto-atualiza.

---

## Sumário

- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Telas](#telas)
- [Lógica de cobrança](#lógica-de-cobrança)
- [Permissões](#permissões)
- [Modo offline](#modo-offline)
- [Auditoria e logs](#auditoria-e-logs)
- [Auto-update](#auto-update)
- [Setup local](#setup-local)
- [Comandos](#comandos)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Banco de dados](#banco-de-dados)
- [Segurança](#segurança)
- [Releases](#releases)
- [Documentação adicional](#documentação-adicional)

---

## Stack

| Camada      | Tecnologia                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| Shell       | **Tauri 2** (Rust 1.95) — bundle Windows `.exe` + Updater assinado         |
| UI          | **React 19** + **TypeScript 5.8** + **Vite 7**                             |
| Estilos     | **Tailwind CSS v4** (`@tailwindcss/vite`, sem `tailwind.config.js`)        |
| Estado      | **Zustand 5** (single store)                                               |
| Backend     | **Supabase** (Postgres + Auth + Realtime + Storage)                        |
| Pagamentos  | **Stone / Pagar.me** (chamado pelo processo Rust — secret nunca no front) |
| Notificações| **Evolution API** (WhatsApp do dono)                                       |
| Offline     | `localStorage` queue + watcher de conectividade (30s)                      |

---

## Arquitetura

```
                  ┌─────────────────────────────────────┐
                  │           Supabase                  │
                  │  Postgres · Auth · Realtime · RLS   │
                  └──────────────▲──────────────────────┘
                                 │ realtime / REST
                                 │
            ┌────────────────────┴────────────────────┐
            │           React 19 (Vite)               │
            │  Zustand store · Tailwind v4 · TSX      │
            └──────────────▲──────────────────────────┘
                           │ invoke()
                           │
            ┌──────────────┴──────────────┐
            │     Rust (Tauri commands)   │
            │                             │
            │  stone.rs   → Pagar.me API  │
            │  auth.rs    → Evolution API │
            │  logger.rs  → JSONL local   │
            │  db.rs      → SQLite cache  │
            └─────────────────────────────┘
```

Sem router: `App.tsx` mantém um `useState<Screen>` que decide qual tela renderiza. Navegação é prop-drilled (`onNavigate`, `onBack`).

---

## Telas

| Chave        | Rótulo na UI         | Descrição                                                              |
| ------------ | -------------------- | ---------------------------------------------------------------------- |
| `login`      | Login                | Autenticação Supabase + abertura de turno                              |
| `home`       | Home                 | Dashboard kiosk com botões grandes (`BigButton`)                       |
| `checkin`    | **Entrada**          | Cria `stays` com `payment_method = null` (pagamento só na saída)       |
| `checkout`   | **Saída**            | Cobrança final, fecha estadia, define método de pagamento              |
| `quartos`    | Quartos              | Mapa de suítes em tempo real, pedidos, troca de quarto, alertas        |
| `estoque`    | Estoque              | Inventário, reposição, baixas e correção de movimentação               |
| `turno`      | Turno                | Fechamento de turno: caixa esperado vs. caixa contado                  |
| `auditoria`  | Auditoria (owner)    | Logs locais, audit Supabase, eventos auth, painel de atualização       |

### Máquina de estados das suítes

```
   free ──→ occupied ──→ cleaning ──→ free
    ▲                                  │
    │                                  │
    └────── maintenance ◄── free ──────┘
              (apenas manager / owner)
```

---

## Lógica de cobrança

Toda regra fiscal vive em `src/lib/cobranca.ts` — função pura, sem dependência de UI/DB. Duas modalidades:

### Estadia 2h

Base de 2h pelo preço da suíte. Após o tempo base, cobra-se **R$ 15 por hora iniciada** (sem tolerância — 1ms já conta como 1h cheia).

| Cenário                                 | Cobrança              |
| --------------------------------------- | --------------------- |
| Entrou 20:00, saiu 21:50                | base                  |
| Entrou 20:00, saiu 22:01                | base + 1h (R$ 15)     |
| Entrou 20:00, saiu 23:00                | base + 1h (R$ 15)     |
| Entrou 20:00, saiu 23:01                | base + 2h (R$ 30)     |

### Pernoite

Período fixo **00:00–06:00** (horário Fortaleza), valor de **R$ 90,00**. Contratável entre 22:00 e 05:59. Quando contratado entre 22:00 e 23:59, cobra-se um **adicional pré-meia-noite a R$ 15/hora iniciada** entre o check-in e 00:00. Após 06:00, cobra-se **R$ 15/hora iniciada**, mesma regra da estadia 2h.

| Cenário                            | Cobrança                                         |
| ---------------------------------- | ------------------------------------------------ |
| Entrou 22:00, saiu 06:00           | 2h pré (R$ 30) + R$ 90 = **R$ 120**              |
| Entrou 23:00, saiu 06:00           | 1h pré (R$ 15) + R$ 90 = **R$ 105**              |
| Entrou 00:00, saiu 06:00           | **R$ 90**                                        |
| Entrou 00:30, saiu 06:00           | **R$ 90** (já dentro do período)                 |
| Entrou 23:00, saiu 07:01           | 1h pré + R$ 90 + 2h adicional = **R$ 135**       |
| Entrou 00:00, saiu 06:01           | R$ 90 + 1h adicional = **R$ 105**                |

### Recálculo no checkout

A modalidade pode ser trocada na saída (ex.: contratou pernoite, mas saiu antes). O preço é sempre re-lido de `suites.prices['2h' | 'pernoite']` — o recepcionista nunca digita valor. `expected_checkout_at`, `extra_hours`, `extra_value` e `pre_pernoite_value` são regravados no momento do checkout.

---

## Permissões

| Permissão                   | Recepcionista | Gerente | Dono |
| --------------------------- | :-----------: | :-----: | :--: |
| Marcar suíte livre          | ✓             | ✓       | ✓    |
| Colocar em manutenção       | —             | ✓       | ✓    |
| Liberar manutenção          | —             | ✓       | ✓    |
| Cancelar movimentação       | —             | ✓       | ✓    |
| Void / cancelar pagamento   | —             | ✓       | ✓    |
| Ver log completo            | —             | ✓       | ✓    |
| Ver audit raw               | —             | —       | ✓    |
| Gerenciar usuários          | —             | —       | ✓    |

Ações críticas (void e correção de estoque) exigem **PIN do gerente** via `PinModal`, validado por RPC `validate_manager_pin` com rate-limit no Postgres.

Para esconder/mostrar JSX por papel:

```tsx
<PermissionGate permission="colocar_em_manutencao" role={profile.role}>
  <button>Colocar em Manutenção</button>
</PermissionGate>
```

---

## Modo offline

Quando `connStatus === 'offline'`, operações são empilhadas em `localStorage` (chave `paraiso_offline_queue`) e replicadas no reconnect. Tipos suportados:

- `checkin`
- `checkout`
- `inventory_movement`
- `suite_status_update`

Pagamentos com cartão são bloqueados offline — apenas dinheiro é oferecido.

Um watcher de 30s pinga o Supabase e dispara o replay. Transições de estado são logadas como `offline_enter` / `offline_exit`.

---

## Auditoria e logs

Toda ação relevante chama `logAction(action, extra?)`:

- **Local (JSONL)** — uma linha por evento, gravada via `invoke('write_local_log')`.
  - Dev: `D:\logs teste\YYYY-MM-DD.jsonl`
  - Prod: `%APPDATA%\paraiso-recepcao\logs\YYYY-MM-DD.jsonl`
- **Supabase** — eventos críticos são espelhados em `audit_log` (`table_name = 'app'`). Mudanças de banco já são cobertas por `audit_trigger_fn()`.

### Eventos cobertos

`login`, `logout`, `shift_open`, `shift_close`, `checkin`, `checkout`, `void_attempt`, `void_success`, `void_denied`, `room_order_add`, `room_order_remove`, `inventory_restock`, `inventory_correction`, `suite_status_update`, `overtime_alert`, `pernoite_close_alert`, `room_swap`, `update_check`, `update_install`, `offline_enter`, `offline_exit`.

### Tela Auditoria (apenas owner)

Três abas:

1. **Logs Locais** — lê JSONL via `read_local_logs(date)`, filtra por ação.
2. **Audit Supabase** — últimos 200 eventos da tabela `audit_log`.
3. **Auth Eventos** — RPC `get_auth_audit_logs(lim)` lendo `auth.audit_log_entries`.

---

## Auto-update

O app se atualiza via `tauri-plugin-updater`, apontando para `releases/latest.json` no Supabase Storage (bucket público `releases`). O dono verifica e instala a atualização em **Auditoria → aba Atualização**.

- Atualizações são assinadas com a chave privada do dono (`~/.tauri/paraiso.key`).
- A `pubkey` fica em `tauri.conf.json` — nenhum build não-assinado é aceito.
- A versão precisa estar idêntica em três arquivos: `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.

Detalhes do fluxo de release em [`RELEASE.md`](./RELEASE.md).

---

## Setup local

### Pré-requisitos

- Node.js 20+
- Rust 1.95 (apenas para builds e `tauri dev`)
- Conta Supabase com as migrations aplicadas (ver [Banco de dados](#banco-de-dados))

### Instalação

```bash
git clone https://github.com/armitagethird/Sistema-Motel.git
cd Sistema-Motel
npm install
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

> **Stone secret key NÃO entra em `VITE_*`.** A chave do Pagar.me precisa ficar no ambiente do processo Rust (system env), nunca no frontend.

---

## Comandos

```bash
npm run dev              # Vite (frontend apenas, sem compilar Rust)
npx tsc --noEmit         # Type-check do TS
npm run build            # tsc + build de produção (dist/)
npm run tauri dev        # App desktop em modo dev (requer Rust)
npm run tauri build      # Gera o instalador .exe
npm run release          # Sobe bundle + reescreve latest.json no Supabase Storage
```

> O script `dev` usa `cross-env NODE_OPTIONS=--max-http-header-size=65536` para evitar HTTP 431 — JWTs do Supabase ultrapassam o limite padrão de 8KB do Vite.

---

## Estrutura de pastas

```
paraiso-recepcao/
├── src/                       # Frontend React
│   ├── App.tsx                # Roteamento por useState<Screen>
│   ├── app/                   # Telas (login, home, checkin, checkout, ...)
│   ├── components/            # BigButton, PinModal, PermissionGate, ...
│   ├── lib/                   # cobranca, store, supabase, offline, logger, ...
│   └── types/                 # Tipos compartilhados (incl. dashboard.ts)
├── src-tauri/                 # Shell Rust
│   ├── src/commands/          # stone, auth, db, sync, logger
│   ├── tauri.conf.json
│   └── Cargo.toml
├── supabase/                  # schema.sql + migrations versionadas
├── scripts/release.mjs        # Pipeline de publicação (assina + sobe latest.json)
├── public/                    # Assets servidos pelo Vite
├── CLAUDE.md                  # Guia técnico para Claude Code
├── ARCHITECTURE.md            # Diagrama detalhado da arquitetura
├── MAPA_DO_PROJETO.md         # Mapa de arquivos e responsabilidades
├── API_CONTRACT.md            # Contrato pra dashboard externo (Next.js)
├── RELEASE.md                 # Fluxo de release e auto-update
└── CHANGELOG.md               # Histórico semver
```

---

## Banco de dados

### Tabelas principais

`profiles` · `suites` · `stays` · `inventory` · `inventory_movements` · `shifts` · `audit_log`

Todo write em `stays` e `inventory_movements` é auto-auditado por `audit_trigger_fn()`.

### Views para dashboard

`v_suites_live` · `v_receita_hoje` · `v_turnos_ativos` · `v_alertas_pendentes`

`v_suites_live` (recriada na `migration_v6.sql`) inclui `equipamentos`, `modalidade` e `expected_checkout_at` da estadia ativa.

### Migrations (rodar nesta ordem)

| Arquivo                                | Descrição                                                              |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `schema.sql`                           | Schema base completo                                                   |
| `migration_v2.sql`                     | Atualizações iniciais                                                  |
| `migration_v3.sql`                     | `updated_at` em suites + soft delete + views + Realtime                |
| `fixup_pgcrypto_manager.sql`           | Correção bcrypt                                                        |
| `rate_limit_pin.sql`                   | Rate limit em `validate_manager_pin`                                   |
| `migration_v4.sql`                     | RPC `get_auth_audit_logs` + `is_owner_or_manager()` helper             |
| `migration_v5.sql`                     | Trigger `handle_new_auth_user` (cria profile automático)               |
| `migration_v6.sql` **(destrutivo)**    | Limpa dados teste, novos enums, seed de 16 suítes + 39 itens           |
| `migration_v7.sql`                     | Renomeia `extra_blocks → extra_hours` + `pre_pernoite_value`           |

Habilitar **Realtime** em: `suites`, `stays`, `shifts`, `inventory_movements`.
Habilitar **Auth Audit Log** em Dashboard → Authentication → Settings.

---

## Segurança

Regras inegociáveis do projeto:

- Void/cancel sempre exige PIN do gerente. Tentativas falhas vão para `audit_log`.
- Preços vêm exclusivamente de `suites.prices` (jsonb). Recepcionista nunca digita valor.
- Adicional por hora e pré-pernoite são calculados em `lib/cobranca.ts` a partir de `opened_at`/`expected_checkout_at`.
- Correção de estoque é **soft delete** (`status = 'cancelled'`). Nunca DELETE físico em `inventory_movements`.
- `audit_log` RLS: INSERT para todo authenticated; SELECT apenas para owner/manager via `is_owner_or_manager()`. UPDATE e DELETE são proibidos.
- A secret key da Stone só existe no environment do processo Rust — nunca em `VITE_*`.
- Permissão `ver_audit_raw` é **apenas owner**.
- RLS em `profiles` usa `using (id = auth.uid())` — nunca consultar `profiles` de dentro de uma policy (recursão infinita, erro `42P17`).

---

## Releases

Versionamento [SemVer](https://semver.org/lang/pt-BR/) e [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

| Tipo  | Quando                                              |
| ----- | --------------------------------------------------- |
| MAJOR | Mudança incompatível ou rework grande do banco      |
| MINOR | Funcionalidade nova, compatível com versões anteriores |
| PATCH | Correção de bug, sem mudança de comportamento       |

Versão precisa ser bumpada simultaneamente em **três** arquivos:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Histórico completo em [`CHANGELOG.md`](./CHANGELOG.md). Fluxo de publicação em [`RELEASE.md`](./RELEASE.md).

---

## Documentação adicional

| Arquivo                                                  | Para que serve                                              |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| [`CLAUDE.md`](./CLAUDE.md)                               | Guia técnico do projeto (regras, padrões, gotchas)          |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                   | Visão arquitetural detalhada                                |
| [`MAPA_DO_PROJETO.md`](./MAPA_DO_PROJETO.md)             | Mapa de arquivos e responsabilidades                        |
| [`API_CONTRACT.md`](./API_CONTRACT.md)                   | Contrato com a futura dashboard externa (Next.js)           |
| [`AUTENTICACAO.md`](./AUTENTICACAO.md)                   | Fluxo de autenticação e recuperação de senha                |
| [`PROPOSTA-PARAISO.md`](./PROPOSTA-PARAISO.md)           | Proposta original do projeto                                |
| [`RELEASE.md`](./RELEASE.md)                             | Como publicar e assinar uma nova versão                     |
| [`CHANGELOG.md`](./CHANGELOG.md)                         | Histórico de versões                                        |

---

<div align="center">

**Paraíso Recepção** · v1.1.1 · 2026

Desenvolvido sob medida para o Paraíso Motel.

</div>
