# Proposta Comercial — Sistema Paraíso Motel

> **Documento de uso duplo:** as seções 1–10 são o conteúdo da proposta para o cliente. O **Apêndice A** (final) é estratégia interna — não compartilhar.

---

## 1. Resumo do investimento

| Item | Valor |
|---|---|
| **Implantação (one-shot)** | **R$ 10.000** |
| **Mensalidade** | **R$ 600/mês** |
| **Hardware (PC, impressora, leitor Stone)** | Por conta do motel |
| **Domínio do site** | Cortesia (1 ano) |
| **Cardápio digital** | Cortesia |

Total ano 1: **R$ 17.200** (R$ 10.000 + 12 × R$ 600).
Investimento mensal a partir do ano 2: **R$ 7.200/ano**.

---

## 2. Por que esse valor — dados de mercado

### 2.1 Software sob medida no Brasil (2026)

Pesquisa de mercado feita em abril/2026 com fontes públicas:

| Categoria | Faixa de preço | Fonte |
|---|---|---|
| Software sob medida pequeno porte (10–25 telas) | **R$ 40.000 a R$ 150.000** | Aegis AI, Dynamica Soft |
| SaaS intermediário com dashboards + APIs | R$ 150.000 a R$ 600.000 | Aegis AI |
| Cada integração externa adicional | R$ 5.000 a R$ 50.000 | Aegis AI |

O sistema entregue tem **8 telas operacionais + dashboard do dono (Next.js separado) + 4 integrações externas** (Supabase, Stone/Pagar.me, Evolution API WhatsApp, Gemini IA). Pelo critério de mercado, custo de mercado seria entre **R$ 60.000 e R$ 200.000**.

**O preço apresentado representa entre 5% e 17% do custo de mercado** — possível pela relação direta de parceria, ausência de overhead de agência (comerciais, gerentes de projeto, infraestrutura corporativa) e contrapartida do desconto de 50% nos próximos motéis do grupo.

### 2.2 Concorrentes diretos no segmento motel

| Sistema | Modelo | O que entrega | Código pertence a |
|---|---|---|---|
| **Sismotel** | SaaS (mensalidade eterna) | Recepção, gerencial, estoque, fiscal, mobile, autoatendimento | Sismotel — cliente nunca é dono |
| **Control-in (Chebib)** | SaaS | Automação, reservas | Control-in |
| **HSystem / CMNet** | SaaS / licença anual | PMS hoteleiro completo | Fornecedor |

**Em SaaS, o cliente paga mensalidade pra sempre e nunca vira dono do código.** Se trocar de fornecedor, perde tudo (dados, integrações, processos). É refém.

**Nesta proposta, o código-fonte é entregue ao motel.** Ao fim de 24 meses de operação, o motel terá pago R$ 24.400 e será dono do sistema. No mesmo período, em SaaS equivalente, o motel pagaria entre R$ 14.400 e R$ 24.000 sem nunca ser dono de nada.

### 2.3 O que isso significa pro Paraíso

- **R$ 10.000 implantação ≠ pagar caro**. É 5–17% do que custaria de uma agência para uma entrega equivalente.
- **R$ 600/mês ≠ caro**. Está dentro da faixa de mensalidade SaaS de mercado, mas com a diferença crítica: o código é do motel, não meu.
- **Sem refém**: a qualquer momento, o motel pode operar o sistema com outro técnico. Não há lock-in.

---

## 3. O sistema entregue — escopo

### 3.1 Aplicação de recepção (kiosk Windows .exe)

Aplicação nativa para Windows, instalável, roda offline quando a internet cai. Telas:

1. **Login** com PIN/senha por funcionário (3 níveis: recepcionista, gerente, dono)
2. **Home** — dashboard de turno
3. **Entrada (check-in)** — seleção de suíte, modalidade (estadia 2h ou pernoite), cálculo automático
4. **Saída (checkout)** — fechamento, cobrança hora-extra, integração Stone, troca de modalidade
5. **Quartos** — visão ao vivo das 16 suítes, status colorido, timer de limpeza, alertas
6. **Estoque** — 5 categorias, baixa manual, reposição, correção com PIN gerencial
7. **Turno** — abertura/fechamento, conferência de caixa, divisão por método de pagamento
8. **Auditoria (só dono)** — 3 abas: logs locais, audit Supabase, eventos de autenticação

### 3.2 Regras de negócio implementadas

- **Estadia 2h**: cobrança da diária + R$ 15 por hora extra iniciada após o tempo base
- **Pernoite**: período fixo 00:00–06:00 a R$ 90, com adicional de R$ 15/hora pré-meia-noite quando contratado entre 22h–23h59
- **Filtro horário**: só oferece pernoite no checkin entre 22:00 e 05:59
- **Recálculo no checkout**: se o cliente trocou a modalidade, o sistema recalcula tudo

### 3.3 Integrações

| Integração | Função |
|---|---|
| **Stone / Pagar.me** | Cobrança no cartão presencial e cancelamento (void) |
| **Evolution API (WhatsApp)** | Alertas automáticos pro dono — void aprovado, hora extra iniciada, pernoite encerrando em 30min |
| **Supabase (Postgres + Realtime)** | Banco de dados, sincronização entre dispositivos, autenticação |
| **Gemini 2.5 Flash-Lite** | Resumos diários, semanais e mensais escritos em linguagem natural |

### 3.4 Modo offline

Quando a internet cai, o sistema continua funcionando: check-ins, checkouts (em dinheiro), movimentações de estoque ficam em fila local (SQLite + localStorage). Quando a conexão volta, replica automaticamente. Cartão fica bloqueado offline (proteção contra fraude).

### 3.5 Auditoria e segurança

- **Todas as ações são logadas** em arquivo local JSONL (1 por dia) **e** no banco Supabase
- **Cancelamento de pagamento (void)** exige PIN do gerente — tentativas falhas ficam registradas
- **Correção de movimentação de estoque** exige PIN — nunca há DELETE físico, só soft-delete com motivo
- **Dono tem acesso a 3 níveis de auditoria**: logs locais (servidor do motel), banco (todas as alterações nas tabelas), eventos de autenticação (logins, logouts, falhas)
- **Triplo registro** garante que mesmo se um log for adulterado, os outros dois preservam a verdade

### 3.6 Dashboard do dono (aplicação web separada — Next.js)

Acessível de qualquer celular ou computador. Mostra:

- Receita do dia, da semana, do mês
- Suítes ocupadas em tempo real
- Alertas pendentes
- Resumo gerado por IA (diário, semanal, mensal)
- Histórico de turnos e diferenças de caixa
- Acesso a todos os logs

### 3.7 IA aplicada (Gemini 2.5 Flash-Lite)

Todo dia às 07:00, todo domingo às 09:00 e todo dia 1 do mês, o sistema gera automaticamente um resumo escrito em português natural, com:

- Faturamento do período + comparação com período anterior
- Suítes mais ocupadas
- Padrões de consumo (estoque)
- Anomalias detectadas (turnos com diferença de caixa, voids, hora-extra acima da média)
- Sugestões operacionais

Entregue por WhatsApp e disponível no dashboard.

### 3.8 Site institucional do motel

Site público, otimizado para celular, com fotos das suítes, informações de localização e botão direto pro WhatsApp. Hospedado em Vercel (gratuito).

---

## 4. Mimos (cortesia, sem custo adicional)

- **Domínio do site**: 1º ano cortesia (a partir do 2º ano, ~R$ 50/ano paga pelo motel diretamente no registro.br)
- **Cardápio digital**: aplicação web com QR Code colocado nas suítes para o hóspede ver bebidas/alimentação
- **Treinamento presencial** da equipe (recepcionistas + gerente)
- **Material de apoio impresso** (cheat-sheet de uso pra plastificar e deixar na recepção)
- **30 primeiros dias com suporte estendido** (resposta em até 15 minutos em qualquer horário)

---

## 5. Mensalidade — o que cobre

### Incluso na mensalidade

- Hospedagem do banco de dados (Supabase)
- Hospedagem do dashboard e do site (Vercel)
- Servidor da Evolution API (WhatsApp)
- Custos de IA (Gemini)
- **Suporte 24/7 via WhatsApp** com SLA:
  - Crítico (sistema fora do ar / não consegue cobrar): resposta em ≤30 min, 24h por dia
  - Não crítico (dúvida, ajuste pequeno): resposta em ≤4h em horário comercial
- Backup diário automatizado dos dados
- Monitoramento de saúde do sistema
- Atualizações de segurança e correções de bug
- **Ajustes pequenos** (até 4h de trabalho técnico por mês, acumulativos por 3 meses)

### Custos cobertos pela mensalidade (pra você ver onde vai o dinheiro)

| Custo | Valor mensal |
|---|---|
| Supabase Pro | R$ 140 |
| Evolution API (servidor) | R$ 25 |
| Gemini 2.5 Flash-Lite (IA) | R$ 5 |
| Domínio amortizado | R$ 5 |
| Suporte + manutenção + evoluções | R$ 425 |
| **Total** | **R$ 600** |

---

## 6. O que NÃO está incluso

Para deixar claro e evitar mal-entendidos:

- **Hardware** (PC, monitor touch, impressora térmica, leitor Stone) — motel compra
- **Plano de internet** do motel — responsabilidade do motel (sistema funciona offline, mas os benefícios todos exigem conexão)
- **Funcionalidades novas grandes** (mais de 4h de trabalho) — orçadas à parte, sob aprovação do motel
- **Treinamento de funcionários** após a entrega — R$ 150/funcionário (presencial) ou R$ 50/funcionário (remoto)
- **Integrações com sistemas terceiros não previstos** (outro adquirente, outro sistema fiscal, ERP do motel) — orçadas à parte
- **Dia de visita técnica presencial** depois da entrega — R$ 300 + transporte (caso necessário)

---

## 7. Modelo de pagamento

### Implantação (R$ 10.000)

Em **2 parcelas**:

- **R$ 5.000 na assinatura do contrato** — destrava o trabalho final, treinamento, instalação
- **R$ 5.000 no aceite** — após sistema rodando estável por 7 dias no motel

Pagamento via PIX. Nota fiscal emitida na entrega final.

### Mensalidade (R$ 600)

- Primeira mensalidade: **30 dias após o aceite** (mês 1 é shake-down, ainda no escopo da implantação)
- Pagamento dia 5 de cada mês via PIX
- Reajuste anual pelo IPCA acumulado (limitado a 8% ao ano), aplicado no aniversário do contrato

---

## 8. Cláusulas do contrato

### 8.1 Propriedade do código

O código-fonte completo é entregue ao motel ao fim do shake-down. O motel pode:

- Usar o sistema indefinidamente em todas as suas unidades (motéis, casas, sítios do mesmo grupo)
- Contratar qualquer outro técnico pra dar manutenção
- Modificar o que quiser

Limitação: o motel **não pode revender** o código-fonte ou licenciar pra terceiros fora do grupo.

### 8.2 Suporte continuado e cancelamento da mensalidade

- Mensalidade pode ser cancelada com **aviso de 30 dias**
- No cancelamento, motel mantém o código mas perde: hospedagens (Supabase, Vercel, Evolution), suporte 24/7, atualizações, IA
- Migração para servidores próprios do motel: orçada à parte (estimativa: R$ 2.000–4.000 dependendo da escolha de provedor)

### 8.3 Garantia de bugs

- 90 dias após o aceite, qualquer bug do sistema é corrigido sem custo (mesmo se a mensalidade for cancelada)
- Após 90 dias, correção de bugs entra no pacote de suporte da mensalidade

### 8.4 Confidencialidade

- Dados de hóspedes, faturamento, operação são confidenciais
- Acesso técnico ao banco existe apenas pra suporte, mediante autorização do motel
- LGPD: sistema implementa logs de auditoria que facilitam compliance, mas a operação responde pelo tratamento dos dados

---

## 9. Próximos motéis do grupo

Compromisso firmado em contrato:

- **50% de desconto na implantação** para qualquer outro motel do mesmo grupo (mesmo CNPJ ou sócios em comum) — **R$ 5.000 por unidade**
- **Mensalidade integral** por unidade (R$ 600/mês cada — porque suporte 24/7 dobra de trabalho a cada motel novo)
- Validade do desconto: **24 meses a contar da assinatura deste contrato**
- Aplicável para todos os estabelecimentos do grupo (inclui casas/sítios)

---

## 10. SLA de suporte 24/7

| Severidade | Definição | Tempo de resposta | Tempo de resolução |
|---|---|---|---|
| **Crítico** | Sistema fora do ar; não consegue receber pagamento; perda de dados | ≤30 min | ≤4h |
| **Alto** | Função importante quebrada (ex: WhatsApp não envia, dashboard não carrega) | ≤2h | ≤24h |
| **Médio** | Função secundária com problema (ex: relatório com erro de cálculo) | ≤4h horário comercial | ≤72h |
| **Baixo** | Dúvida, melhoria estética, ajuste de texto | ≤24h horário comercial | acordo entre as partes |

Canal: WhatsApp dedicado.

---

# Apêndice A — Estratégia de apresentação (USO INTERNO)

> Esta seção é só pra você. **Não envia ao cliente.** Apaga ou separa em outro arquivo antes de mandar.

## A.1 Ordem de apresentação na conversa

**Passo 1 — Ancorar antes de falar valor:**
> "Antes de falar de número, queria te mostrar o que custa um sistema desses no mercado. Pesquisei agora pra ser justo com você."

Mostra a tabela da seção 2.1 e a 2.2. Foca em:
- Software sob medida começa em R$ 40k (Aegis AI)
- Sismotel/Control-in/etc são SaaS — código nunca vira do cliente

**Passo 2 — Posicionar o valor como vantagem:**
> "Pelo nosso histórico e por ser meu primeiro grande cliente, fecho R$ 10k de implantação + R$ 600/mês. É 5–17% do que uma agência cobraria, e diferente do Sismotel, o código é seu pra sempre."

**Passo 3 — Fechar com o desconto de futuros motéis:**
> "E pra firmar a parceria: nos próximos motéis seus, 50% off na implantação. Vale por 24 meses."

## A.2 Objeções esperadas e respostas

**"R$ 10 mil tá caro"**
> "Caro comparado a quê? Sismotel cobra R$ 800/mês pra sempre — em 12 meses já passou de R$ 10k e o código continua sendo deles, não seu. Aqui você paga R$ 10k uma vez e em 17 meses já tá no positivo."

**"R$ 600 por mês é muito"**
> "Te mostro onde vai o dinheiro: R$ 175 só de infraestrutura (Supabase, Evolution, IA). Sobra R$ 425 pra suporte 24/7. Se um problema acontecer 2h da manhã sábado, você tem alguém. Sismotel não atende fim de semana."

**"E se eu não gostar depois?"**
> "Cancela com 30 dias. O código é seu, fica rodando. Você só perde os serviços online. E nos primeiros 90 dias, qualquer bug eu conserto sem cobrar nada, mesmo se você cancelar."

**"Posso pagar em mais parcelas?"**
> "A implantação já tá em 2x (5k + 5k). Se precisar de uma 3ª parcela, posso fazer 4k + 3k + 3k, mas a mensalidade só começa depois da última."

**"E se você sumir / morrer / cansar?"**
> "Por isso o código é seu. Te entrego documentado. Qualquer dev de Tauri+React+Supabase consegue continuar. Vou te indicar 2–3 desenvolvedores de confiança que conseguem assumir."

## A.3 O que NÃO fazer

- **Não fala R$ 10k antes de mostrar os R$ 40k de mercado.** Sem ancoragem, vira "caro". Com ancoragem, vira pechincha.
- **Não baixa o preço se ele negociar.** Se baixar, ele perde a confiança no número. Em vez disso, acrescenta valor (mais 1 funcionário no treinamento, mais 1 mês de shake-down). Manter R$ 10k + R$ 600 firme.
- **Não promete coisa que não tá no escopo.** Se ele pedir algo extra, anota e diz "isso eu orço à parte depois da entrega".
- **Não fala que "tá quase pronto".** Fala que "tá em fase final de testes, entrega em [data realista que você bate certo]".

## A.4 Pré-fechamento — calibração final

Antes da reunião:

1. **Lista exata do que ainda falta** com prazo realista (multiplica sua estimativa por 1.5)
2. **Datas de entrega no contrato** — sem isso vira projeto eterno
3. **Nome registrado do domínio**: registra no CNPJ do motel, não no seu — evita problema se a parceria mudar
4. **Conta Supabase / Vercel**: criar no email de operação do motel, não no seu pessoal
5. **Backup dos dados na entrega**: agenda automática + entrega manual antes do aceite

## A.5 Riscos identificados nesta proposta

1. **"Código deles" sem NDA escrito** — se algum funcionário do motel sair com o código e tentar revender, você não tem proteção. **Recomendação**: cláusula 8.1 com proibição de revenda já cobre, mas considere também NDA padrão assinado por funcionários com acesso.

2. **Suporte 24/7 dilui margem rápido** — se ele te chamar 3x por semana às 2h da manhã por bobagem, R$ 425 líquidos somem rápido. **Recomendação**: define no SLA o que é "crítico" e o que não é. Bobagem fora do horário comercial = severidade média = resposta no dia seguinte.

3. **Reajuste anual** — sem cláusula de reajuste, em 5 anos R$ 600 vira R$ 400 reais por causa da inflação. Cláusula 7 já cobre (IPCA limitado a 8%).

4. **MEI estoura no ano 2** — Implantação R$ 10k + 12×R$ 600 = R$ 17.200 ano 1. Ano 2 só de mensalidade = R$ 7.200. Cabe no MEI confortavelmente. **Mas se entrar o 2º motel** (R$ 5k impl + 12×R$ 600 = R$ 12.200), ano 2 com 2 motéis = R$ 14.400 só de mensalidade — perto do teto. Antes do 2º motel, migra MEI → ME (Simples Nacional). Conta com contador.

5. **"Dá um jeitinho" sem nota** — cliente é amigo, vai aparecer. **Não aceita.** Você tá começando, precisa rastreabilidade financeira pra crescer. Sem nota nesse valor, em uma fiscalização vira problema sério.

## A.6 Após o fechamento

- **Imprime contrato em 2 vias**, ambos assinam
- **Foto de RG e CNPJ** das duas partes anexadas ao contrato
- **PIX no momento da assinatura** (R$ 5.000 entrada) — se ele não pagar na hora, contrato não valida
- **Foto/print** da transferência arquivado
- **Cria pasta no drive** com: contrato assinado, comprovantes, atas de reunião, lista de pendências

## A.7 Texto pra mandar fechando a reunião

> "Show, então fechamos: R$ 10.000 de implantação em 2x (5k assinatura + 5k aceite) + R$ 600/mês de mensalidade começando 30 dias após o aceite, com suporte 24/7. Próximos motéis seus saem 50% off por 24 meses. Vou montar o contrato e te mando até [data]. Quando você assinar e mandar a entrada, eu coloco a entrega final no cronograma e marcamos a data de instalação."

---

**Versão deste documento:** 1.0
**Data:** 2026-04-25
**Cliente:** Paraíso Motel — Av. dos Africanos, São Luís/MA
