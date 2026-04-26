# Mapa do Projeto — Paraíso Motel · Sistema de Recepção

> Guia de navegação: onde fica cada coisa dentro do projeto.
> Projeto em `C:\dev\paraiso-recepcao\`

---

## Visão Geral da Estrutura

```
paraiso-recepcao/
│
├── src/                        ← Frontend React (TypeScript)
│   ├── App.tsx                 ← Roteador principal de telas
│   ├── App.css                 ← CSS global (regras do kiosk)
│   ├── main.tsx                ← Ponto de entrada React
│   │
│   ├── app/                    ← Cada pasta = uma tela do sistema
│   │   ├── login/              ← Tela de login
│   │   ├── home/               ← Dashboard principal
│   │   ├── checkin/            ← Check-in de hóspedes
│   │   ├── checkout/           ← Checkout + pagamento
│   │   ├── quartos/            ← Mapa de suítes + pedidos
│   │   ├── estoque/            ← Controle de inventário
│   │   ├── turno/              ← Abertura/fechamento de turno
│   │   └── auditoria/          ← Logs e auditoria (owner only)
│   │
│   ├── components/             ← Componentes reutilizáveis
│   │   ├── BigButton.tsx       ← Botão grande do dashboard
│   │   ├── StatusBar.tsx       ← Barra de status (online/offline)
│   │   ├── PinModal.tsx        ← Modal de PIN do gerente
│   │   ├── PermissionGate.tsx  ← Controle de acesso por role
│   │   └── SuiteMap.tsx        ← Grid de suítes (componente genérico)
│   │
│   ├── lib/                    ← Lógica e serviços
│   │   ├── supabase.ts         ← Cliente Supabase (conexão com o banco)
│   │   ├── store.ts            ← Estado global (Zustand)
│   │   ├── logger.ts           ← Sistema de logs
│   │   ├── offline.ts          ← Fila offline + watcher de conectividade
│   │   ├── permissions.ts      ← Tabela de permissões por role
│   │   ├── suiteStatus.ts      ← Máquina de estados das suítes
│   │   └── tauri.ts            ← Wrappers dos comandos Rust (invoke)
│   │
│   └── types/                  ← Tipos TypeScript
│       ├── index.ts            ← Todos os tipos do sistema
│       └── dashboard.ts        ← Tipos para a futura dashboard do dono
│
├── src-tauri/                  ← Backend Rust (Tauri)
│   ├── src/
│   │   ├── lib.rs              ← Registro de todos os comandos Rust
│   │   ├── main.rs             ← Ponto de entrada do processo Rust
│   │   └── commands/           ← Comandos invocados pelo frontend
│   │       ├── logger.rs       ← Leitura/escrita de logs locais (JSONL)
│   │       ├── stone.rs        ← Integração Stone/Pagar.me (pagamentos)
│   │       ├── auth.rs         ← Alertas WhatsApp via Evolution API
│   │       ├── db.rs           ← SQLite local (stubs — offline cache)
│   │       ├── sync.rs         ← Sincronização nativa
│   │       └── mod.rs          ← Declara os módulos para o Rust
│   ├── tauri.conf.json         ← Config da janela, bundle, ícones
│   ├── Cargo.toml              ← Dependências Rust
│   └── capabilities/
│       └── default.json        ← Permissões da API do Tauri
│
├── supabase/                   ← Banco de dados (SQL)
│   ├── schema.sql              ← Schema base completo
│   ├── seed.sql                ← Dados iniciais de exemplo
│   ├── migration_v2.sql        ← Atualizações v2
│   ├── migration_v3.sql        ← updated_at, soft delete, views, Realtime
│   ├── fixup_pgcrypto_manager.sql  ← Correção bcrypt do PIN
│   └── rate_limit_pin.sql      ← Rate limiting tentativas de PIN
│
├── .env                        ← Variáveis de ambiente (não sobe no git)
├── .env.example                ← Modelo do .env
├── package.json                ← Dependências npm + scripts
├── vite.config.ts              ← Config do Vite (bundler)
├── tsconfig.json               ← Config do TypeScript
├── CLAUDE.md                   ← Guia para o Claude Code (arquitetura)
├── API_CONTRACT.md             ← Contrato de dados para a dashboard futura
└── MAPA_DO_PROJETO.md          ← Este arquivo
```

---

## Telas do Sistema

| Tela | Arquivo | O que faz |
|------|---------|-----------|
| Login | `src/app/login/index.tsx` | Autenticação via Supabase Auth, abre turno |
| Home | `src/app/home/index.tsx` | Dashboard com botões para todas as telas |
| Check-in | `src/app/checkin/index.tsx` | Registra entrada de hóspede, cria stay |
| Checkout | `src/app/checkout/index.tsx` | Finaliza stay, processa pagamento, void |
| Quartos | `src/app/quartos/index.tsx` | Mapa de suítes, pedidos do quarto, mudança de status |
| Estoque | `src/app/estoque/index.tsx` | Inventário, baixa manual, reposição, correção |
| Turno | `src/app/turno/index.tsx` | Fechamento de turno, contagem de caixa |
| Auditoria | `src/app/auditoria/index.tsx` | Logs locais e audit log Supabase (owner only) |

**Como a navegação funciona:** não há router — `App.tsx` usa um simples `useState<Screen>` que troca qual componente é renderizado. Para ir de uma tela para outra, chama `onNavigate('nome-da-tela')`.

---

## Onde Ficam os Logs

### Logs locais (JSONL — escritos pelo Rust)

```
Durante desenvolvimento (npm run tauri dev):
  D:\logs teste\YYYY-MM-DD.jsonl

Em produção (app instalado):
  C:\Users\{usuario}\AppData\Roaming\paraiso-recepcao\logs\YYYY-MM-DD.jsonl
```

- Um arquivo por dia, formato JSONL (uma linha JSON por evento)
- Escritos pelo comando Rust `write_local_log` em `src-tauri/src/commands/logger.rs`
- Lidos pelo comando Rust `read_local_logs(date)` — usado na tela Auditoria

### Logs no Supabase (audit_log)

- Tabela `audit_log` no banco Supabase
- Eventos de aplicação (login, logout, void, offline) → inseridos por `src/lib/logger.ts`
- Mudanças em `stays` e `inventory_movements` → inseridos automaticamente pelo trigger `audit_trigger_fn()`
- Visível na tela Auditoria → aba "Audit Supabase"

### Onde é chamado o log no frontend

```
src/lib/logger.ts  →  logAction('nome-do-evento', { ...dados })
```

Quem chama `logAction`:

| Evento | Arquivo |
|--------|---------|
| `login` | `src/app/login/index.tsx` |
| `logout` | `src/App.tsx` |
| `shift_open` / `shift_close` | `src/App.tsx` / `src/app/turno/index.tsx` |
| `checkin` | `src/app/checkin/index.tsx` |
| `checkout` | `src/app/checkout/index.tsx` |
| `void_attempt` / `void_success` / `void_denied` | `src/app/checkout/index.tsx` / `src/components/PinModal.tsx` |
| `room_order_add` | `src/app/quartos/index.tsx` |
| `suite_status_update` | `src/app/quartos/index.tsx` |
| `inventory_restock` | `src/app/estoque/index.tsx` |
| `inventory_correction` | `src/app/estoque/index.tsx` |
| `offline_enter` / `offline_exit` | `src/lib/offline.ts` |

---

## Onde Fica a Lógica de Negócio

### Regras de status das suítes
```
src/lib/suiteStatus.ts
```
Define quais transições são permitidas: quem pode mudar de `cleaning` para `free`, de `free` para `maintenance`, etc.

### Regras de permissão por role
```
src/lib/permissions.ts
```
Define o que cada role (`receptionist`, `manager`, `owner`) pode fazer. Para verificar uma permissão no código, use `temPermissao(role, 'nome-da-permissao')`.

### Estado global da aplicação (memória em tempo de execução)
```
src/lib/store.ts
```
Guarda: usuário logado (`profile`), lista de suítes (`suites[]`), turno atual (`currentShift`), status da conexão (`connStatus`). Qualquer tela pode ler ou atualizar esses dados.

### Fila offline
```
src/lib/offline.ts
```
Quando o sistema fica sem internet, operações são salvas no `localStorage` (`paraiso_offline_queue`). A cada 30 segundos, tenta reenviar tudo ao Supabase.

### Comunicação com Supabase
```
src/lib/supabase.ts        ← cria o cliente (URL + chave anon)
```
Todas as telas importam `supabase` daqui para fazer queries, inserts e updates.

### Comunicação com o Rust (backend nativo)
```
src/lib/tauri.ts           ← lista de todos os invoke() disponíveis
```
Usado para: pagamentos Stone, alertas WhatsApp, leitura/escrita de logs locais.

---

## Onde Ficam as Integrações Externas

### Stone / Pagar.me (pagamentos com cartão)
```
src-tauri/src/commands/stone.rs
```
- `stone_create_order` → cria cobrança
- `stone_cancel_order` → cancela (void)
- Chave secreta lida de variável de ambiente `STONE_SECRET_KEY` (nunca exposta ao frontend)

### WhatsApp (alertas de void)
```
src-tauri/src/commands/auth.rs
```
- `auth_notify_void` → envia mensagem via Evolution API
- Requer: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `OWNER_PHONE` no ambiente do Rust

### Supabase (banco de dados + auth)
```
src/lib/supabase.ts        ← frontend
.env                       ← VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

---

## Onde Ficam as Configurações

| O que configurar | Onde fica |
|-----------------|-----------|
| URL e chave do Supabase | `.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Chave Stone (pagamento) | Variável de ambiente do OS → `STONE_SECRET_KEY` |
| ID da conta Stone | Variável de ambiente do OS → `STONE_ACCOUNT_ID` |
| WhatsApp (Evolution API) | Variáveis do OS → `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `OWNER_PHONE` |
| Tamanho da janela, kiosk | `src-tauri/tauri.conf.json` |
| Permissões de API Tauri | `src-tauri/capabilities/default.json` |
| Dependências npm | `package.json` |
| Dependências Rust | `src-tauri/Cargo.toml` |

---

## Onde Fica o Banco de Dados

O banco roda no Supabase (nuvem). Os arquivos SQL aqui servem para configurar ou atualizar o banco.

| Arquivo | Quando rodar |
|---------|-------------|
| `supabase/schema.sql` | Uma vez, na criação do projeto |
| `supabase/seed.sql` | Opcional — dados de exemplo |
| `supabase/migration_v2.sql` | Já aplicado |
| `supabase/migration_v3.sql` | **Pendente** — adiciona `updated_at` nas suítes, soft delete no estoque, views para dashboard |
| `supabase/fixup_pgcrypto_manager.sql` | Já aplicado |
| `supabase/rate_limit_pin.sql` | Já aplicado |

> Como rodar: Supabase Dashboard → SQL Editor → colar o conteúdo → Run.

### Tabelas principais

| Tabela | O que armazena |
|--------|----------------|
| `profiles` | Funcionários (nome, role, PIN hash) |
| `suites` | Suítes (número, tipo, status, preços) |
| `stays` | Estadias (check-in, checkout, pagamento) |
| `shifts` | Turnos de trabalho |
| `inventory` | Itens do estoque |
| `inventory_movements` | Movimentações do estoque (entradas, saídas, pedidos de quarto) |
| `audit_log` | Log de auditoria (INSERT only — nunca deletado) |

---

## Componentes Reutilizáveis

| Componente | Arquivo | Uso |
|-----------|---------|-----|
| `BigButton` | `src/components/BigButton.tsx` | Botões grandes do Home dashboard |
| `StatusBar` | `src/components/StatusBar.tsx` | Barra de rodapé fixa (online/offline/usuário) |
| `PinModal` | `src/components/PinModal.tsx` | Teclado numérico de PIN — valida gerente/owner |
| `PermissionGate` | `src/components/PermissionGate.tsx` | Esconde elementos sem permissão |
| `SuiteMap` | `src/components/SuiteMap.tsx` | Grid visual de suítes (genérico, usado no check-in) |

---

## Como Rodar o Projeto

```bash
# Apenas o frontend (sem Rust — mais rápido para testar UI)
npm run dev

# App completo com Rust (requer MSVC Build Tools instalado)
npm run tauri dev

# Verificar se tem erro de TypeScript
npx tsc --noEmit

# Gerar o instalador .exe
npm run tauri build
```

> Projeto deve estar em `C:\dev\paraiso-recepcao\` (sem acento no path).
> O MSVC Build Tools está instalado em `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\`.

---

## Fluxo Principal de uma Estadia

```
Login do funcionário
    ↓
Home (dashboard)
    ↓
Check-in → cria linha em stays (payment_status = 'pending')
           → suites.status muda para 'occupied'
    ↓
[durante a estadia]
    Quartos → adiciona pedidos (inventory_movements com quantity negativa)
    ↓
Checkout → atualiza stays (payment_status = 'confirmed', payment_method, closed_at)
         → suites.status muda para 'cleaning'
         → se cartão: chama Stone API via Rust
    ↓
Quartos → botão "Marcar Livre" → suites.status volta para 'free'
```

---

*Gerado em 21/04/2026 · Paraíso Motel · Sistema de Recepção v1.0*
