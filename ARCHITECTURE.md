# ARCHITECTURE.md
## Paraíso Motel — Sistema de Gestão & Controle Antifraude

---

### Visão Geral

Kiosk desktop (.exe) para recepção de motel. Gerencia check-in/checkout de suítes, controle de estoque com pedidos de quarto, fechamento de turno com conferência de caixa, e cancelamentos com PIN de gerente. Audit trail duplo: triggers Postgres no banco + JSONL local via Rust. Suporte offline com fila de sincronização.

---

### Stack & Decisões Técnicas

| Tecnologia | Papel | Por quê |
|---|---|---|
| **Tauri 2** | Shell desktop (Rust) | .exe sem Electron; segredos (Stone, Evolution) ficam no processo Rust, jamais no bundle JS |
| **React 19 + TypeScript** | UI / frontend | Ecossistema, velocidade de desenvolvimento |
| **Tailwind CSS v4** | Estilo | Zero config via `@tailwindcss/vite` |
| **Zustand** | Estado global | Mínimo boilerplate; acesso fora de componentes via `getState()` |
| **Supabase** | BaaS: Postgres + Auth + Realtime | RLS nativa, triggers de auditoria, Realtime sem WebSocket manual |
| **Stone/Pagar.me** | Pagamentos em cartão | Integrado via Rust; secret key nunca toca o frontend |
| **Evolution API** | Alertas WhatsApp | Notificação de void ao dono via Baileys |

---

### Estrutura de Pastas

```
paraiso-recepcao/
├── src/
│   ├── app/               # Telas (cada subpasta = uma Screen)
│   │   ├── login/         # Autenticação Supabase
│   │   ├── home/          # Dashboard + Realtime de suítes
│   │   ├── checkin/       # Fluxo de abertura de estadia
│   │   ├── checkout/      # Fechamento + pagamento + void
│   │   ├── estoque/       # Inventário com baixa e reposição
│   │   ├── quartos/       # Mapa ao vivo + pedidos por suíte
│   │   └── turno/         # Fechamento de turno + conferência de caixa
│   ├── components/        # Componentes reutilizáveis
│   │   ├── BigButton.tsx  # Botão de dashboard com h-full
│   │   ├── PinModal.tsx   # Modal de PIN do gerente (6 dígitos, bcrypt)
│   │   ├── StatusBar.tsx  # Barra fixa de conectividade (pb-14)
│   │   └── SuiteMap.tsx   # Grid de suítes com seleção
│   ├── lib/
│   │   ├── logger.ts      # Audit local (JSONL) + mirror Supabase
│   │   ├── offline.ts     # Fila localStorage + watcher 30s
│   │   ├── store.ts       # Zustand store global
│   │   ├── supabase.ts    # Client Supabase
│   │   └── tauri.ts       # Wrappers de invoke() para comandos Rust
│   ├── types/index.ts     # Tipos compartilhados
│   └── App.tsx            # Roteador simples via useState<Screen>
├── src-tauri/
│   └── src/commands/
│       ├── stone.rs       # Pagar.me API (cria/cancela ordens)
│       ├── auth.rs        # Notificação WhatsApp via Evolution API
│       ├── db.rs          # SQLite offline (cache de suítes)
│       ├── logger.rs      # Escrita de JSONL em disco
│       └── sync.rs        # Hook de sincronização nativa
└── supabase/
    ├── schema.sql         # Schema completo + RLS + triggers + funções
    └── seed.sql           # Dados iniciais (suítes, inventário)
```

---

### Banco de Dados

#### Diagrama de Tabelas

```
auth.users (Supabase Auth)
    └─ profiles (id, name, role, pin_hash, active)
           ├─ shifts (user_id → profiles)
           ├─ stays.opened_by → profiles
           ├─ stays.closed_by → profiles
           ├─ stays.void_approved_by → profiles
           ├─ inventory_movements.user_id → profiles
           └─ audit_log.user_id → profiles

suites (id, number, type, status, prices jsonb)
    └─ stays (suite_id → suites)

stays (id, suite_id, opened_by, type, price, payment_method, payment_status, ...)
    └─ inventory_movements (stay_id → stays)

inventory (id, name, category, quantity, min_quantity, unit_price)
    └─ inventory_movements (inventory_id → inventory)

audit_log (id, user_id, table_name, operation, old_data, new_data, created_at)
```

#### Estratégia de RLS por Role

| Tabela | receptionist | manager | owner |
|---|---|---|---|
| `profiles` | SELECT todos | SELECT todos | SELECT todos |
| `suites` | SELECT/UPDATE | ALL | ALL |
| `stays` | INSERT + UPDATE próprias | ALL | ALL |
| `inventory` | ALL | ALL | ALL |
| `inventory_movements` | INSERT + SELECT | INSERT + SELECT | INSERT + SELECT |
| `shifts` | SELECT/UPDATE próprio | ALL | ALL |
| `audit_log` | INSERT only | INSERT only | INSERT only |

> `get_auth_role()` é uma função SECURITY DEFINER que lê o role sem subquery dentro de policy de `profiles` (evita erro 42P17).

#### Audit Trail

Duas camadas:

**1. Triggers Postgres** (`audit_trigger_fn`): automático em `stays` (INSERT/UPDATE/DELETE) e `inventory_movements` (INSERT). Captura `old_data`/`new_data` como JSONB, `user_id` via `auth.uid()`. INSERT-only RLS — ninguém apaga ou altera logs.

**2. Logger de aplicação** (`src/lib/logger.ts`): eventos de app (login, logout, shift_open/close, void_attempt/success/denied, offline_enter/exit) vão para:
- JSONL local em `%APPDATA%\paraiso-recepcao\logs\YYYY-MM-DD.jsonl` (via Rust `write_local_log`)
- `audit_log` no Supabase com `table_name = 'app'`

---

### Fluxo de Autenticação

```
Login (email + senha)
    → supabase.auth.signInWithPassword()
    → busca profiles WHERE id = auth.uid()
    → verifica profile.active = true
    → setProfile(profile) no Zustand
    → checa shift aberto: SELECT shifts WHERE ended_at IS NULL
        ↳ existe → reusa
        ↳ não existe → INSERT shifts, logAction('shift_open')
    → navega para 'home'

onAuthStateChange(SIGNED_OUT)
    → setProfile(null)
    → volta para 'login'
```

---

### Fluxo de uma Reserva Completa

```
1. CHECK-IN
   Recepcionista seleciona suíte livre → escolhe período (3h/6h/12h/pernoite)
   → INSERT stays { payment_method: null, payment_status: 'pending' }
   → UPDATE suites SET status = 'occupied'
   → logAction('checkin')
   [offline: enqueueOperation → sync ao reconectar]

2. PEDIDOS DE QUARTO (opcional)
   Quartos screen → seleciona item + quantidade
   → INSERT inventory_movements { quantity: -N, stay_id }
   → UPDATE inventory SET quantity = quantity - N
   → logAction('room_order_add')

3. CHECKOUT
   Recepcionista abre a suíte ocupada
   → SELECT stays WHERE suite_id = X AND closed_at IS NULL
   → SELECT inventory_movements WHERE stay_id = stay.id AND quantity < 0
   → exibe total = stay.price + orders
   → pode trocar período cobrado (preço relido de suites.prices)
   → seleciona forma de pagamento
     [cartão] → invoke('stone_create_order') → Pagar.me API (Rust)
   → UPDATE stays { payment_method, payment_status: 'confirmed', closed_at }
   → UPDATE suites SET status = 'cleaning'
   → logAction('checkout')

4. VOID (cancelamento)
   → PinModal exibe teclado de 6 dígitos
   → supabase.rpc('validate_manager_pin') → bcrypt verify no Postgres
   [falha] → INSERT audit_log { FAILED_PIN_ATTEMPT }, logAction('void_denied')
   [sucesso] → invoke('stone_cancel_order') se houver stone_order_id
            → UPDATE stays { payment_status: 'void', void_approved_by }
            → UPDATE suites SET status = 'free'
            → invoke('auth_notify_void') → WhatsApp ao dono (Evolution API)
            → logAction('void_success') → audit_log Supabase

5. FECHAR TURNO
   → SELECT stays WHERE opened_at >= shift.started_at AND payment_status = 'confirmed'
   → SELECT inventory_movements para somar pedidos
   → exibe breakdown: cartão / PIX / dinheiro + pedidos
   → recepcionista informa contagem física de caixa
   → UPDATE shifts { ended_at, expected_cash, reported_cash }
   → logAction('shift_close')
```

---

### Sistema de Logs

| Onde | O quê | Como consultar |
|---|---|---|
| `audit_log` (Supabase) | Mudanças em `stays`, `inventory_movements`, eventos de app | `SELECT * FROM audit_log ORDER BY created_at DESC` |
| JSONL local | Todos os eventos com contexto completo (shift_id, user_name, etc.) | `%APPDATA%\paraiso-recepcao\logs\YYYY-MM-DD.jsonl` |

Eventos gravados em ambos (via `SUPABASE_EVENTS` no logger):
`login`, `logout`, `shift_open`, `shift_close`, `void_attempt`, `void_success`, `void_denied`, `offline_enter`, `offline_exit`, `app_start`

---

### Realtime: o que é sincronizado ao vivo

| Channel | Tabela | Evento | Onde usado |
|---|---|---|---|
| `suites-realtime` | `suites` | `*` | Home — recarrega lista ao mudar status |
| `quartos-rt` | `suites` | `UPDATE` | Quartos — atualiza mapa sem reload |

---

### Integrações Externas

**Stone/Pagar.me**
- `stone_create_order(amount_centavos, description)` — POST `/orders`
- `stone_cancel_order(order_id)` — DELETE `/orders/:id/closed`
- Secret key: `STONE_SECRET_KEY` (env var do OS, apenas processo Rust)
- Falha de rede → erro mostrado na UI; checkout não é confirmado

**Evolution API (WhatsApp)**
- `auth_notify_void(approverName, suiteNumber, reason)` — alerta ao dono
- Chamado após void aprovado, antes de navegar para tela de sucesso
- Configuração: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`

**Offline / Fila**
- `localStorage` key: `paraiso_offline_queue`
- Watcher a cada 30s: pinga Supabase, replaya a fila em ordem
- Checkins offline: UUID gerado no cliente para que checkout possa referenciar o mesmo ID
- Pagamento em cartão bloqueado offline (requer Rust → Stone API)

---

### Segurança

**Modelo de ameaças considerado**
- Funcionário desonesto tentando anular pagamentos ou manipular estoque
- Re-login para criar múltiplos turnos e ocultar movimentações
- Acesso físico ao terminal para alterar registros

**Mecanismos implementados**
- Void exige PIN bcrypt de gerente/dono validado server-side (RPC SECURITY DEFINER)
- Tentativas de PIN com PIN errado gravadas em `audit_log` com `user_id`
- `audit_log` INSERT-only no banco (sem UPDATE/DELETE via RLS)
- `void_success` gravado em `audit_log` Supabase (não apenas JSONL local)
- Stone secret key apenas no processo Rust (nunca em `VITE_*`)
- Preços sempre lidos de `suites.prices` — recepcionista nunca digita valor
- Turno duplicado prevenido: reutiliza turno aberto existente ao re-logar
- Triggers de auditoria cobrem INSERT/UPDATE/DELETE em `stays`
- `get_auth_role()` SECURITY DEFINER evita recursão de RLS (42P17)

**Pendências de segurança**
- [ ] Rate limiting em `validate_manager_pin` (ex: max 5 tentativas / 15min)
- [ ] Realtime em `audit_log` para dono monitorar ao vivo
- [ ] Sessão com timeout automático após inatividade

---

### Pendências e Dívida Técnica

| Prioridade | Item |
|---|---|
| Alta | Definir PIN bcrypt para gerente/dono via SQL (ver instrução no schema.sql) |
| Alta | Rate limiting em validate_manager_pin |
| Alta | `logout` não chama `supabase.auth.signOut()` — wired apenas no Home; mover para handler global |
| Média | Realtime em `inventory` e `shifts` (hoje só `suites`) |
| Média | Tela de configuração para gerente adicionar/editar suítes e inventário |
| Média | Relatório diário exportável (PDF ou CSV) |
| Baixa | Timeout de sessão por inatividade |
| Baixa | Tela de histórico de audit_log para dono/gerente |

---

### Como Rodar Localmente

```bash
# 1. Clone e instale dependências
npm install

# 2. Configure variáveis de ambiente
cp .env.example .env
# edite .env com suas credenciais Supabase

# 3. Configure vars do Stone (processo Rust — não vai em .env)
set STONE_SECRET_KEY=sk_...
set STONE_ACCOUNT_ID=...

# 4. Rode o schema no Supabase SQL Editor
#    Cole o conteúdo de supabase/schema.sql
#    Cole o conteúdo de supabase/seed.sql

# 5. Crie profiles para os usuários Supabase Auth:
#    INSERT INTO profiles SELECT id, email, 'receptionist', null, true FROM auth.users

# 6. Defina PIN do gerente:
#    UPDATE profiles SET pin_hash = crypt('123456', gen_salt('bf')) WHERE role = 'manager';

# 7. Habilite Realtime na tabela suites (Supabase Dashboard > Database > Replication)

# 8. Dev server (sem compilação Rust)
npm run dev

# 9. App completo com Tauri (requer Rust instalado)
npm run tauri dev
```

---

### Deploy

**Frontend (Tauri .exe)**
```bash
# Requer Rust + cargo instalados
npm run tauri build
# Gera: src-tauri/target/release/bundle/msi/paraiso-recepcao_*.msi
```

**Backend (Supabase)**
- Projeto hospedado em supabase.co (plano Free ou Pro)
- Migrations: rodar `schema.sql` manualmente no SQL Editor
- Realtime: habilitar nas tabelas `suites` (obrigatório) e `audit_log` (opcional)
- RLS: habilitado por padrão via schema; confirmar no Dashboard > Authentication > Policies
