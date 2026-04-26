# Changelog

Todas as mudanças relevantes do app de recepção do Paraíso.

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versionamento: [SemVer](https://semver.org/lang/pt-BR/).

**Convenção de versão:**
- `MAJOR.MINOR.PATCH` — ex: `1.2.3`
- **MAJOR** (1.x.x → 2.0.0): mudanças incompatíveis ou rework grande do banco
- **MINOR** (1.1.x → 1.2.0): nova funcionalidade compatível com versões anteriores
- **PATCH** (1.1.0 → 1.1.1): correção de bug, sem mudança de comportamento

A versão precisa ser bumpada simultaneamente em 3 arquivos: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`.

---

## [1.1.1] - 2026-04-25

### Fixed
- **Pernoite agora cobra adicional após 06:00** — antes, se o hóspede passasse das 06:00 (fim do período fixo do pernoite), nada extra era cobrado e a tela só mostrava "passou 06:00". Agora cobra **R$ 15 por hora iniciada** após 06:00, mesma regra da estadia 2h. Sem tolerância: 06:01 já conta como 1 hora extra. Valor fica gravado em `stays.extra_value` no checkout, e o card/painel da Suíte mostram o adicional em tempo real. Alerta no WhatsApp também dispara a cada nova hora iniciada após 06:00.

  Exemplos:
  - Entrou 23:00, saiu 07:01 → 1h pré (R$15) + R$90 + 2h adicional (R$30) = **R$135**
  - Entrou 00:00, saiu 06:01 → R$90 + 1h adicional (R$15) = **R$105**

---

## [1.1.0] - 2026-04-25

### Added
- **Troca de quarto sem cobrança em 15 min** — após o check-in, recepcionista vê contador na tela Quartos. Pode trocar a estadia pra outra suíte livre sem cobrança adicional dentro de 15 min (com 2 min de cortesia silenciosa). Suíte antiga vai pra `cleaning`, nova pra `occupied`. Audit log cobre a mudança automaticamente.
- **Auto-update via Supabase Storage** — app agora se atualiza sozinho. Owner vê na tela Auditoria → aba "Atualização": versão atual, status, notas da nova versão, e botão pra instalar e reiniciar. Atualizações são assinadas digitalmente — apenas builds do dono são aceitas.
- Logs de auditoria: `room_swap`, `update_check`, `update_install`.

### Changed
- `package.json.version` alinhada com `tauri.conf.json` (era `0.1.0`, agora `1.1.0`).

---

## [1.0.0] - 2026-04-21

### Added
- Versão inicial do app de recepção (Tauri + React + Supabase).
- Telas: Login, Home, Entrada (check-in), Saída (checkout), Quartos, Estoque, Turno, Auditoria.
- Modalidades de cobrança: estadia 2h e pernoite com adicional pré-meia-noite.
- Cobrança por hora iniciada (R$15) após o período base da estadia 2h.
- Alertas WhatsApp (Evolution API): cancelamento aprovado, hora extra iniciada, pernoite encerrando.
- Modo offline com fila de operações em localStorage.
- Logs locais em JSONL + auditoria em Supabase.
- Pagamentos via Stone/Pagar.me.
- 16 suítes seed (simples / luxo / super luxo) e 39 itens de estoque.
- Permissões por role: receptionist, manager, owner.
- Tela Auditoria (owner): logs locais, audit Supabase, eventos auth.
