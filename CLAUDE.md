# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Desktop kiosk app (.exe) for motel front desk — Paraíso Motel. Stack: **Tauri 2** (Rust) + **React 19** + **TypeScript** + **Tailwind CSS v4** + **Zustand** + **Supabase**.

## Commands

```bash
# Install dependencies
npm install

# Run dev server (frontend only, no Rust compilation)
npm run dev

# TypeScript type check
npx tsc --noEmit

# Build frontend only
npm run build

# Full Tauri dev (requires Rust installed)
npm run tauri dev

# Build .exe installer (requires Rust installed)
npm run tauri build
```

**Rust is required for `tauri dev` and `tauri build`.** Rust 1.95 is installed via rustup (`~/.cargo/bin/`). Without a new terminal the PATH may not be in scope — open a fresh terminal before running tauri commands.

The dev script uses `cross-env NODE_OPTIONS=--max-http-header-size=65536` to avoid HTTP 431 errors caused by Supabase JWTs exceeding Vite's default 8KB header limit.

## Architecture

### Data flow

```
Supabase (source of truth)
    ↕ realtime subscriptions
React frontend (Zustand store)
    ↕ invoke()
Rust backend (Tauri commands)
    → Stone/Pagar.me API  (payments)
    → Evolution API        (WhatsApp alerts)
    → SQLite local         (offline queue)
```

### Screen routing (`src/App.tsx`)

No router library — simple `useState<Screen>` drives which component renders.

Screens: `login | home | checkin | checkout | estoque | turno | quartos | auditoria`

Home dashboard uses `bg-gray-900` (same as login) with `border-b border-gray-700` on the header to create visual separation. UI labels for `checkin`/`checkout` screens are **"Entrada"** / **"Saída"** — screen keys are unchanged.

Navigation is prop-drilled (`onNavigate`, `onBack`). The `auditoria` screen is only reachable from Home and only visible to `owner` role.

### State management (`src/lib/store.ts`)

Single Zustand store holds: `profile`, `suites[]`, `currentShift`, `connStatus`. Components read slices with `useAppStore(s => s.field)`. No Context API.

`updateSuiteStatus(id, status)` updates a single suite in the store without refetching.

### Offline mode (`src/lib/offline.ts`)

Operations are queued to `localStorage` (key: `paraiso_offline_queue`) when `connStatus === 'offline'`. A 30-second interval watcher (`startConnectivityWatcher`) pings Supabase, then replays the queue on reconnect. Card payments are blocked offline; only `cash` is offered.

Supported operation types: `checkin | checkout | inventory_movement | suite_status_update`

### Rust commands (`src-tauri/src/commands/`)

| File | Purpose |
|------|---------|
| `stone.rs` | POST/DELETE to Pagar.me API — secret key lives here, never in frontend |
| `auth.rs` | WhatsApp alerts via Evolution API: `auth_notify_void` (cancelamento aprovado), `auth_notify_overtime` (suíte estadia ultrapassou tempo base / iniciou nova hora extra), `auth_notify_pernoite_close` (pernoite faltam ≤30min para 06:00) |
| `db.rs` | SQLite stubs (tauri-plugin-sql) for offline suite cache |
| `sync.rs` | Coordination hook for native sync if needed |
| `logger.rs` | `write_local_log` (append JSONL) + `read_local_logs(date)` (read JSONL by date) |

All commands are registered in `lib.rs` via `invoke_handler!`.

### Supabase schema (`supabase/schema.sql`)

Key tables: `profiles`, `suites`, `stays`, `audit_log`, `inventory`, `inventory_movements`, `shifts`. All writes to `stays` and `inventory_movements` are auto-audited via `audit_trigger_fn()` triggers.

The `stays.payment_method` column is **nullable** — payment is set only at checkout, not at check-in.

RLS on `profiles` uses `using (id = auth.uid())` — never query `profiles` from within a policy, as it causes infinite recursion (Postgres error `42P17`).

**Column names to remember (common mistakes):**
- `stays.price` — not `total_price` (preço base da diária; adicional vai em `extra_value`)
- `stays.expected_checkout_at` — calculado no checkin via `calcExpectedCheckout`
- `stays.extra_hours` / `stays.extra_value` — adicional por hora (estadia 2h), gravado no checkout. Renomeado de `extra_blocks` em `migration_v7.sql`.
- `stays.pre_pernoite_value` — adicional cobrado entre check-in e 00:00 quando pernoite contratado antes da meia-noite. Adicionado em `migration_v7.sql`.
- `shifts.user_id` — not `receptionist_id`
- `shifts.ended_at` — not `closed_at`
- `suites.updated_at` — added in `migration_v3.sql`
- `suites.equipment` (text[]) — added in `migration_v6.sql`

**Enums atuais (após migration_v6):**
- `suites.type`: `simples | luxo | super_luxo`
- `stays.type`: `estadia_2h | pernoite`
- `inventory.category`: `alimentacao | bombons | bebidas | diversos | patrimonio`
- `suites.prices` jsonb: `{ "2h": <number>, "pernoite": <number> }`

### Migrations

| File | What it adds |
|------|-------------|
| `supabase/schema.sql` | Schema base completo |
| `supabase/migration_v2.sql` | Atualizações anteriores |
| `supabase/migration_v3.sql` | `updated_at` em suites + soft delete em `inventory_movements` + views para dashboard + Realtime |
| `supabase/fixup_pgcrypto_manager.sql` | Correção bcrypt |
| `supabase/rate_limit_pin.sql` | Rate limiting no `validate_manager_pin` |
| `supabase/migration_v4.sql` | `get_auth_audit_logs` RPC + `is_owner_or_manager()` helper + SELECT policy em `audit_log` |
| `supabase/migration_v5.sql` | Trigger `handle_new_auth_user` — cria `profiles` row automaticamente ao criar user em `auth.users` |
| `supabase/migration_v6.sql` | **DESTRUTIVO** — limpa dados teste, troca enums (`suites.type`, `stays.type`, `inventory.category`), adiciona `suites.equipment`, `stays.expected_checkout_at`, `stays.extra_blocks`, `stays.extra_value`, recria `v_suites_live`, popula 16 suítes + 39 itens |
| `supabase/migration_v7.sql` | Renomeia `stays.extra_blocks` → `stays.extra_hours` (cobrança por hora, não por bloco 2h) + adiciona `stays.pre_pernoite_value` (adicional pré-meia-noite no pernoite). Não destrutivo. |

## Business logic

### Entrada vs. Saída (check-in / checkout)

UI labels: **"Entrada"** (check-in) and **"Saída"** (checkout). Screen keys in `App.tsx` remain `'checkin'` and `'checkout'` — only the visible text changed.

Payment happens **only at saída**, never at entrada. Entrada inserts a `stays` row with `payment_method = null` and `payment_status = 'pending'`. Saída updates the same row with the final `payment_method`, `payment_status = 'confirmed'`, `closed_at`, and optionally `stone_order_id`.

### Modalidades de cobrança (estadia 2h vs pernoite)

Duas modalidades:

**`estadia_2h`** — base 2h pelo preço da suíte. Após `expected_checkout_at`, cobra-se **R$ 15 por hora iniciada** (não mais bloco de 2h). Sem tolerância: `now > expected_checkout_at` por 1ms já conta como 1 hora. Exemplo: entrou 20:00 → base até 22:00 → sai 22:01 cobra +R$15 (1h iniciada) → sai 23:00 cobra +R$15 (1h exata) → sai 23:01 cobra +R$30 (2h iniciadas).

**`pernoite`** — período fixo 00:00–06:00 horário Fortaleza, **R$ 90,00**. Pode ser contratado entre 22:00 e 05:59 (UI checkin filtra opções por hora — ver `modalidadesDisponiveis(now)`). `expected_checkout_at` = próximo 06:00 local. Quando contratado entre 22:00 e 23:59, cobra-se **adicional pré-meia-noite a R$ 15/hora iniciada** entre check-in e 00:00, gravado em `stays.pre_pernoite_value`. Após 06:00, cobra-se **R$ 15 por hora iniciada** (mesma regra da estadia 2h após o tempo base), gravado em `stays.extra_value`. `pernoiteState='overtime'` sinaliza visualmente que entrou nessa janela.

Exemplos pernoite:
- Entrou 22:00, saiu 06:00 → 2h pré (R$30) + R$90 = **R$120**
- Entrou 23:00, saiu 06:00 → 1h pré (R$15) + R$90 = **R$105**
- Entrou 00:00, saiu 06:00 → R$90
- Entrou 00:30, saiu 06:00 → R$90 (já dentro do período)
- Entrou 23:00, saiu 07:01 → 1h pré (R$15) + R$90 + 2h adicional (R$30) = **R$135**
- Entrou 00:00, saiu 06:01 → R$90 + 1h adicional (R$15) = **R$105**

Toda lógica de cobrança vive em `src/lib/cobranca.ts` — função pura, sem dependência de UI/DB. Funções principais:
- `calcExpectedCheckout(openedAt, type)` — chamada no checkin pra gravar `stays.expected_checkout_at`
- `calcMidnightAfter(openedAt)` — próxima 00:00 Fortaleza após openedAt; `null` se já em 00:00–06:00
- `calcPrePernoiteHours(openedAt)` — horas pré-meia-noite (ceil), 0 se já em 00:00–06:00
- `calcExtraHours(expected, now)` — `Math.ceil(diff / 1h)` após `expected`. Vale para ambas as modalidades (estadia 2h após tempo base; pernoite após 06:00).
- `calcHourValue(hours)` — `hours × 15`
- `modalidadesDisponiveis(now)` — `['estadia_2h']` antes 22h e após 06h, `['estadia_2h','pernoite']` 22:00–23:59, `['pernoite']` 00:00–05:59
- `snapshotCobranca({ ... })` — retorna `{ basePrice, ordersTotal, extraHours, extraValue, prePernoiteHours, prePernoiteValue, grandTotal, msSinceOpened, msUntilExpected, msUntilNextHour, msUntilMidnight, pernoiteState, isOvertime, pernoiteCloseAlert }` pra dashboards/checkout

**`pernoiteState`** assume `'pre' | 'active' | 'overtime' | 'n/a'`:
- `'pre'`: pernoite contratado, ainda antes da próxima 00:00
- `'active'`: entre 00:00 e 06:00
- `'overtime'`: passou de 06:00 (cobra R$15/hora iniciada via `extra_value`)
- `'n/a'`: estadia 2h

**Recálculo no checkout:** receptionist pode trocar a modalidade no checkout (e.g., contratou `pernoite` mas saiu antes). `stayType` state inicia em `activeStay.type` e é editável. Preço sempre re-lido de `selectedSuite.prices['2h' | 'pernoite']`, nunca digitado. `expected_checkout_at` é recalculado e regravado caso a modalidade tenha mudado, e `extra_hours`/`extra_value`/`pre_pernoite_value` são gravados no `stays` no momento do checkout (snapshot recalculado a partir de `openedAt` + `stayType` final).

**Estimativa pré-pernoite no checkin:** quando o usuário seleciona `pernoite` antes da meia-noite, a tela exibe um painel laranja com tempo até 00:00, valor do adicional, valor do pernoite e total estimado (sem consumo). Atualiza com `now` a cada 30s.

### Alertas WhatsApp (Evolution API)

Disparados de `src/app/quartos/index.tsx` via tick de 30s. Só rodam se `'__TAURI_INTERNALS__' in window`.

**Hora adicional (`auth_notify_overtime`)**: `lastNotifiedHours: useRef<Map<stayId, number>>`. A cada nova hora extra iniciada (`snap.extraHours > last`), dispara o alerta com `(suite, horasExtras, valorAcumulado, minutosAtraso)`. Vale para estadia 2h (após tempo base) e pernoite (após 06:00). Logado como `overtime_alert` com `stay_type` no extra.

**Pernoite encerrando (`auth_notify_pernoite_close`)**: `pernoiteCloseNotified: useRef<Set<stayId>>`. Quando `snap.pernoiteCloseAlert` (faltam ≤30min para 06:00), dispara uma única vez por estadia com `(suite, minutosRestantes)`. Logado como `pernoite_close_alert`.

### Room orders (Quartos screen)

Pedidos are stored as negative-quantity rows in `inventory_movements` (linked to a `stay_id`). To read them back, filter `.lt('quantity', 0)`. The screen joins `inventory_movements` with `inventory` in two separate queries (movements first, then `inventory` rows by id list), merging in JS with a map.

Adding an order writes an `inventory_movements` row and immediately decrements `inventory.quantity` in the same flow.

### Suite status machine (`src/lib/suiteStatus.ts`)

```
free ──────→ occupied ──→ cleaning ──→ free
 ↑                                      ↑
 └──── maintenance ────────────────────┘
free ──→ maintenance (manager/owner only)
```

Valid transitions:
- `free → occupied` (checkin flow)
- `occupied → cleaning` (checkout flow)
- `cleaning → free` (**"Marcar Livre"** button — any role)
- `free → maintenance` (manager/owner only)
- `maintenance → free` (manager/owner only)

`transicaoValida(atual, novo)` validates before any status update. All updates call `logAction('suite_status_update', ...)` and enqueue to offline queue if offline.

The `cleaning` status card shows a live timer (`CleaningTimer` component). Text turns red after 30 min.

### Fechar Turno (shift close)

Reads all `stays` with `payment_status = 'confirmed'` opened after `currentShift.started_at`. Totals are split by `payment_method` (cash / card / pix) somando `price + extra_value`. The receptionist enters the physical cash count; the difference is stored in `shifts` (`expected_cash` vs `reported_cash`). Consumo (`inventory_movements` negativos) é exibido em linha separada — atualmente não é alocado por método de pagamento.

### Estoque (inventory)

Categorias: `alimentacao | bombons | bebidas | diversos | patrimonio`. Labels human-friendly em `INVENTORY_CATEGORY_LABEL` (`src/types/index.ts`). Itens de `patrimonio` (Cinzeiro, Controle de TV) servem só pra controle de integridade — `unit_price = 0`, `min_quantity = 0`, e a tela Quartos filtra `.neq('category', 'patrimonio')` no seletor de pedidos.

Each item has a `-1` (baixa manual) button and a `Repor` button. Repor expands an inline input for the quantity to add. Both write an `inventory_movements` row and update `inventory.quantity` directly. Low-stock items (`quantity <= min_quantity`) get a red left border.

**Correção de movimentação (manager/owner):** Header button "Corrigir Movimentação" reveals a list of active movements. Clicking "Cancelar" opens a 2-step flow: (1) type reason, (2) manager PIN via `PinModal`. On approval: soft-delete (`status = 'cancelled'`, `cancelled_by`, `cancelled_at`, `cancel_reason`) + revert `inventory.quantity` + `logAction('inventory_correction')`. Never physical DELETE.

### Void / cancel

Requires manager PIN via `PinModal`. On success, calls `tauriCommands.stoneCancelOrder` (if a Stone order exists), sets `stays.payment_status = 'void'`, sets suite to `free`, and sends a WhatsApp alert via `tauriCommands.authNotifyVoid`.

### Permissions (`src/lib/permissions.ts`)

```typescript
temPermissao(role, permission) → boolean
```

Roles: `receptionist | manager | owner`

Key permissions:
| Permission | Quem pode |
|---|---|
| `marcar_suite_livre` | todos |
| `colocar_em_manutencao` | manager, owner |
| `liberar_manutencao` | manager, owner |
| `remover_movimentacao` | manager, owner |
| `void_pagamento` | manager, owner |
| `ver_log_completo` | manager, owner |
| `ver_audit_raw` | owner |
| `gerenciar_usuarios` | owner |

Use `PermissionGate` component to hide/show JSX by role:
```tsx
<PermissionGate permission="colocar_em_manutencao" role={profile.role}>
  <button>Colocar em Manutenção</button>
</PermissionGate>
```

### Auditoria (owner only, `app/auditoria/index.tsx`)

Accessible from Home only when `role === 'owner'`. Three tabs:

**Aba "Logs Locais":** calls `invoke('read_local_logs', { date })` → parses JSONL lines, shows in reverse chronological order, filter by `action`. Falls back to empty array if Tauri is not running.

**Aba "Audit Supabase":** queries `audit_log` table (last 200 rows), filter by user and table. Click a row to expand `old_data`/`new_data` JSON. SELECT accessible to owner and manager via `audit_select_owner_manager` policy (uses `is_owner_or_manager()` security definer helper — added in `migration_v4.sql`).

**Aba "Auth Eventos":** calls RPC `get_auth_audit_logs(lim)` → reads `auth.audit_log_entries` (Supabase native auth log). Returns: `entry_id`, `created_at`, `ip_address`, `action`, `actor_id`, `actor_email`. Requires Auth Audit Log enabled in Supabase Dashboard → Authentication → Settings. Function is `security definer`, owner-only, returns last 200 events. Color-coded by action type (login=green, logout=gray, token_refreshed=blue, etc.).

### Local audit logging (`src/lib/logger.ts`)

Every significant action calls `logAction(action, extra?)`. It reads the current `profile` and `currentShift` from the Zustand store and writes a JSONL line via `invoke('write_local_log')`.

**Log file location:**
- Dev (`npm run tauri dev`): `D:\logs teste\YYYY-MM-DD.jsonl`
- Production build: `%APPDATA%\paraiso-recepcao\logs\YYYY-MM-DD.jsonl`

**Detection:** `'__TAURI_INTERNALS__' in window` — if Tauri is not running (plain `npm run dev`), the entry is printed to the DevTools console instead of written to a file.

**Logged actions:**

| Action | File |
|--------|------|
| `login` | `app/login/index.tsx` |
| `logout` | `App.tsx` |
| `shift_open` | `App.tsx` |
| `shift_close` | `app/turno/index.tsx` |
| `checkin` | `app/checkin/index.tsx` |
| `checkout` | `app/checkout/index.tsx` |
| `void_attempt` | `app/checkout/index.tsx` |
| `void_success` | `app/checkout/index.tsx` |
| `void_denied` | `components/PinModal.tsx` |
| `room_order_add` | `app/quartos/index.tsx` |
| `room_order_remove` | `app/quartos/index.tsx` |
| `inventory_restock` | `app/estoque/index.tsx` |
| `inventory_correction` | `app/estoque/index.tsx` |
| `suite_status_update` | `app/quartos/index.tsx` |
| `overtime_alert` | `app/quartos/index.tsx` (1 alerta ao atingir base + 1 a cada nova hora extra iniciada) |
| `pernoite_close_alert` | `app/quartos/index.tsx` (1x quando faltam ≤30min para 06:00) |
| `offline_enter` / `offline_exit` | `lib/offline.ts` |

**Supabase mirror:** events in `SUPABASE_EVENTS` (login, logout, shift open/close, void attempts, offline transitions) are also inserted into `audit_log` with `table_name = 'app'`. DB-level changes are covered by `audit_trigger_fn()`.

**Entry shape:**
```json
{
  "ts": "2026-04-21T14:32:05.123Z",
  "action": "checkin",
  "conn": "online",
  "user_id": "uuid",
  "user_name": "João Silva",
  "role": "receptionist",
  "shift_id": "uuid",
  "suite_number": 12,
  "suite_id": "uuid",
  "stay_type": "estadia_2h",
  "expected_checkout_at": "2026-04-21T16:32:05.123Z",
  "price": 40.00
}
```

## Layout rules (kiosk-critical)

These patterns must be followed on every screen to prevent content being cut off:

- **Screen root**: `h-screen bg-... flex flex-col` — never `min-h-screen`.
- **Header**: `shrink-0` — prevents it from collapsing.
- **Scrollable content area**: `flex-1 min-h-0 overflow-y-auto pb-14` — `min-h-0` is required for flex children to shrink below their content height; `pb-14` clears the fixed StatusBar (~44px).
- **StatusBar**: `position: fixed bottom-0 left-0 right-0` — always rendered last inside the screen root.
- **Panels with sub-sections** (e.g. Quartos right panel): use a single `overflow-y-auto pb-14` block container — do **not** use nested `flex-1` inside, as it traps the add-item section below the viewport.
- **`App.css`**: `body { overflow: hidden; height: 100vh; }` and `#root { height: 100vh; }` — required to contain all screens.

## Key components

### `BigButton`

Full-height button used on the Home dashboard. Uses `h-full w-full` — the parent container must set explicit height (e.g. `shrink-0 h-20` for the Quartos row, `flex-1` grid cells for the 2×2 grid). Never put a `min-h` on `BigButton` itself.

Label uses `text-xl leading-tight text-balance px-4` and icon uses `text-4xl leading-none` — sized to fit within `h-20` containers without overflow. `overflow-hidden` on the button prevents text escaping the rounded border.

### `StatusBar`

Fixed-position bar at the bottom. Shows connectivity status. Always present — all scrollable areas need `pb-14`.

### `PinModal`

Manager/owner PIN gate. Calls `validate_manager_pin` RPC (covers both `manager` and `owner` roles). Returns `{ approvedById, approvedByName }` to parent via `onSuccess`. Used for: void, inventory correction.

### `PermissionGate`

```tsx
<PermissionGate permission="..." role={profile.role}>
  {/* rendered only if role has permission */}
</PermissionGate>
```

Source: `src/components/PermissionGate.tsx`. Uses `temPermissao()` from `src/lib/permissions.ts`.

## Dashboard do dono (futura app Next.js)

O Supabase já está preparado. Ver `API_CONTRACT.md` na raiz para o contrato de dados.

Views disponíveis: `v_suites_live`, `v_receita_hoje`, `v_turnos_ativos`, `v_alertas_pendentes`

`v_suites_live` (recriada no `migration_v6.sql`) inclui `equipamentos`, `modalidade` e `expected_checkout_at` da estadia ativa — útil pra dashboard mostrar tempo restante e alerta de overtime.

Tipos TypeScript compartilhados: `src/types/dashboard.ts` (copiar para o projeto Next.js).

## Environment

`.env` values (already configured):
```
VITE_SUPABASE_URL=https://nzwfgkcboopjkicbwyry.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_Tj28PeURcZSA2FgFnMPPWA_RKHSo3pZ
```

`VITE_STONE_SECRET_KEY` must **not** exist — Stone key goes in the OS environment for the Rust process only.

## Supabase setup

1. Run `supabase/schema.sql` in Supabase SQL editor.
2. Run `supabase/migration_v3.sql` para adicionar `updated_at`, soft delete e views.
3. Run `supabase/migration_v4.sql` para SELECT policy em `audit_log` e RPC de auth events.
4. Run `supabase/migration_v5.sql` para criar trigger automático de `profiles` em novos `auth.users`.
5. Run `supabase/migration_v6.sql` (**DESTRUTIVO**) para limpar dados teste, novos enums (estadia_2h/pernoite, simples/luxo/super_luxo, novas categorias), colunas de adicional 2h e seed de 16 suítes + 39 itens.
6. Run `supabase/migration_v7.sql` para renomear `extra_blocks`→`extra_hours` e adicionar `pre_pernoite_value` (cobrança por hora + pré-pernoite).
7. Ensure `profiles` rows exist for every Supabase Auth user (migration_v5 cobre criações novas).
8. Enable Realtime on `suites`, `stays`, `shifts`, `inventory_movements`.
9. Enable Auth Audit Log: Dashboard → Authentication → Settings → "Enable Auth Audit Log".

## Security rules (non-negotiable)

- **Void/cancel** always requires manager PIN via `PinModal`. Failed attempts written to `audit_log`.
- **Prices** always come from `suites.prices` (jsonb chaves `2h` e `pernoite`). Receptionist never types a price. Adicional por hora (estadia) e pré-pernoite (pernoite antes meia-noite) são calculados por `lib/cobranca.ts` a partir de `opened_at`/`expected_checkout_at`, nunca digitado.
- **Inventory correction** (soft delete) always requires manager PIN. Never physical DELETE on `inventory_movements`.
- `audit_log` RLS: INSERT for all authenticated; SELECT for owner/manager via `is_owner_or_manager()` policy. No UPDATE or DELETE ever.
- Stone secret key must only exist in the Rust process environment, never in `VITE_*` vars.
- `ver_audit_raw` permission (tela Auditoria) is `owner` only — never expose to `receptionist` or `manager`.

## Auto-update (Tauri Updater)

App se atualiza sozinho via `tauri-plugin-updater` apontando pra `releases/latest.json` no Supabase Storage (bucket público `releases`). Owner verifica/instala em **Auditoria → aba Atualização**. Atualizações são assinadas com chave do dono — `pubkey` em `tauri.conf.json`, privada fora do repo (`~/.tauri/paraiso.key`).

Versão precisa estar idêntica em 3 arquivos: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`.

Workflow de release: `npm run tauri build` → `npm run release` (script em `scripts/release.mjs` lê `CHANGELOG.md` + sobe bundle/sig + reescreve `latest.json`). Detalhes completos em `RELEASE.md` na raiz.

## Tailwind v4

Uses `@tailwindcss/vite` plugin — no `tailwind.config.js`. Import is `@import "tailwindcss"` at the top of `App.css`.
