# AUTENTICACAO.md
## Paraíso Motel — Guia de Autenticação

---

## Existem DOIS sistemas de senha distintos

### 1. Senha de Login (Supabase Auth)

**O que é:** senha que o funcionário usa para entrar no app (tela de login).

**Onde fica:** Supabase Dashboard → Authentication → Users

**Como criar/alterar:**
- Supabase Dashboard → Authentication → Users → seleciona o usuário → Reset Password
- Ou via SQL: `update auth.users set encrypted_password = crypt('nova_senha', gen_salt('bf')) where email = 'email@exemplo.com';`

**Quem tem:** todos os funcionários (receptionist, manager, owner).

**Usado em:** tela de login do app (`app/login/index.tsx`).

---

### 2. PIN de Gerente (tabela `profiles.pin_hash`)

**O que é:** código numérico de 6 dígitos usado para autorizar cancelamentos (void) de estadias.

**Onde fica:** coluna `pin_hash` na tabela `profiles` do banco — armazenado como hash bcrypt via pgcrypto.

**NÃO aparece no Supabase Authentication.** É completamente separado da senha de login.

**Como definir ou alterar o PIN** (rodar no SQL Editor do Supabase):

```sql
update profiles
set pin_hash = crypt('XXXXXX', gen_salt('bf'))
where id = '<uuid-do-gerente-ou-owner>';
```

Exemplo com o owner atual (`romerosaraiva4`):
```sql
update profiles
set pin_hash = crypt('123456', gen_salt('bf'))
where id = '2d2573d9-2418-4094-ab43-87f439b85b8c';
```

**Quem deve ter PIN:** apenas usuários com role `manager` ou `owner`.
Recepcionistas (`receptionist`) não precisam de PIN — eles digitam o PIN do gerente para solicitar aprovação.

**Usado em:** `PinModal` → teclado numérico na tela de cancelamento → valida via `validate_manager_pin()` no banco.

---

## Roles disponíveis

| Role | Acesso |
|---|---|
| `receptionist` | Check-in, checkout, estoque, pedidos de quarto, fechar turno próprio |
| `manager` | Tudo do receptionist + aprova voids via PIN + vê turnos de todos |
| `owner` | Acesso total |

**Como alterar o role de um usuário** (SQL Editor):
```sql
update profiles set role = 'manager' where id = '<uuid>';
update profiles set role = 'owner'   where id = '<uuid>';
```

---

## Fluxo completo de um cancelamento (void)

```
Recepcionista clica em "Cancelar estadia"
    → PinModal abre (teclado numérico de 6 dígitos)
    → Gerente/owner digita o PIN dele
    → App chama supabase.rpc('validate_manager_pin', { pin_input: '...' })
    → Banco verifica: bcrypt(pin_input) == profiles.pin_hash
        ↳ Inválido → INSERT em audit_log (FAILED_PIN_ATTEMPT) + mensagem de erro
        ↳ Válido   → retorna { user_id, name } do aprovador
    → Stay atualizado: payment_status = 'void', void_approved_by = aprovador
    → Suite volta a 'free'
    → WhatsApp de alerta enviado ao dono (Evolution API)
    → Evento 'void_success' gravado em audit_log
```

---

## Usuários atuais

| Nome | UUID | Role | PIN |
|---|---|---|---|
| romerosaraiva4 | `2d2573d9-2418-4094-ab43-87f439b85b8c` | owner (após fixup) | definir via SQL |
| jeffersinho123123 | `b7d8600b-6caf-4d37-a1cf-3bd89524e354` | receptionist | não necessário |

---

## Checklist de configuração inicial

- [ ] Rodar `fixup_pgcrypto_manager.sql` no SQL Editor
- [ ] Trocar `'123456'` pelo PIN real antes de rodar
- [ ] Confirmar que `validate_manager_pin` funciona: testar um void no app
- [ ] Guardar o PIN em local seguro — não há recuperação sem acesso ao SQL Editor
