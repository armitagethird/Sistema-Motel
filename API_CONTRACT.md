# API_CONTRACT.md
## Contrato de Dados — App Recepção → Dashboard do Dono

### Projeto Supabase
URL: (ver .env — VITE_SUPABASE_URL)

### Views para a dashboard consumir
| View | Descrição |
|------|-----------|
| `v_suites_live` | Status de todas as suítes + quem está atendendo + tempo no status |
| `v_receita_hoje` | Receita do dia por forma de pagamento |
| `v_turnos_ativos` | Funcionários com turno aberto agora |
| `v_alertas_pendentes` | Divergências de caixa e voids nas últimas 24h |

### Tabelas com Realtime habilitado
- `suites` (já habilitado)
- `stays`, `shifts`, `inventory_movements` (habilitados via migration_v3.sql)

### Como a dashboard se autentica
- Mesmo Supabase project
- Login com credenciais do owner (Supabase Auth)
- RLS garante acesso completo para role `'owner'`

### Tipos TypeScript compartilhados
Ver: `src/types/dashboard.ts`

### Notas de schema
- `stays.price` = valor da diária (não `total_price`)
- `shifts.user_id` = ID do funcionário (não `receptionist_id`)
- `shifts.ended_at` = quando o turno foi fechado (não `closed_at`)
- `suites.updated_at` = quando o status da suíte foi alterado pela última vez (adicionado em migration_v3.sql)
