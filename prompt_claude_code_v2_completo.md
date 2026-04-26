# Prompt para Claude Code — Paraíso Motel · Atualização Completa v2

---

## CONTEXTO GERAL

Este é o sistema de gestão do Paraíso Motel. O banco de dados contém dados de teste que precisam ser substituídos pelos dados reais abaixo. Além disso, a lógica de cobrança por tempo de estadia precisa ser implementada corretamente.

Faça tudo em ordem:
1. Atualize os dados (suítes + itens de estoque)
2. Implemente a lógica de tempo e cobrança
3. Confirme o que foi feito com um resumo ao final

---

## PARTE 1 — SUÍTES (substituir dados de teste)

### Categorias de suíte

| Categoria | Preço 2h | Pernoite (00:00–06:00h) |
|---|---|---|
| Suíte Simples | R$ 40,00 | R$ 90,00 |
| Suíte Luxo | R$ 50,00 | R$ 90,00 |
| Suíte Super Luxo | R$ 80,00 | R$ 90,00 |

### Distribuição dos quartos

| Nº | Categoria | Equipamentos |
|---|---|---|
| 1 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 2 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 3 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 4 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 5 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 6 | Suíte Luxo | Espelho no teto, cadeira erótica |
| 7 | Suíte Super Luxo | Sofá erótico, espelho, polidance |
| 8 | Suíte Super Luxo | Sofá erótico, espelho no teto, banheira |
| 9 | Suíte Super Luxo | Sofá erótico, espelho no teto, banheira |
| 10 | Suíte Simples | — |
| 11 | Suíte Simples | — |
| 12 | Suíte Simples | — |
| 13 | Suíte Simples | — |
| 14 | Suíte Simples | — |
| 15 | Suíte Simples | — |
| 16 | Suíte Simples | — |

---

## PARTE 2 — ITENS DE ESTOQUE/CARDÁPIO (substituir dados de teste)

Apague todos os itens de teste e insira os abaixo, com categoria e preço.

### Alimentação
| Item | Preço |
|---|---|
| Carne de Sol | R$ 40,00 |
| Calabresa | R$ 25,00 |
| Caldo de Ovos | R$ 10,00 |
| Batata Ondulada | R$ 7,00 |
| Ovos Cozidos ou Fritos | R$ 3,00 |
| Batata Frita | R$ 10,00 |
| Suco da Fruta c/ Leite | R$ 10,00 |
| Suco de Polpa | R$ 10,00 |
| Suco Psiu | R$ 6,00 |
| Misto | R$ 10,00 |
| Nescau em Caixa | R$ 5,00 |
| Café da Manhã | R$ 25,00 |

### Bombons
| Item | Preço |
|---|---|
| Trident | R$ 4,00 |
| Halls | R$ 4,00 |
| Talentos Barra | R$ 15,00 |
| Kit Kat | R$ 8,00 |

### Bebidas
| Item | Preço |
|---|---|
| Água Mineral | R$ 5,00 |
| Refri Lata | R$ 5,00 |
| Cerveja Lata | R$ 8,00 |
| Cerveja 600ml | R$ 12,00 |
| Longneck | R$ 12,00 |
| ICE (Caipirinha pronta) | R$ 6,00 |
| Campari (dose) | R$ 10,00 |
| Whisky (dose) | R$ 10,00 |
| Red Bull | R$ 15,00 |

### Diversos
| Item | Preço |
|---|---|
| Preservativo | R$ 5,00 |
| Creme Erótico | R$ 5,00 |
| Absorvente (unidade) | R$ 3,00 |
| Escova (kit) | R$ 8,00 |
| Prestobarba | R$ 5,00 |
| Cigarro Free | R$ 20,00 |
| Toalha (extra) | R$ 3,00 |
| Lençol (extra) | R$ 3,00 |
| Fronha (extra) | R$ 3,00 |
| Copo | R$ 10,00 |
| Touca | R$ 5,00 |
| Fósforo | R$ 2,00 |

### Patrimônio interno (sem preço de venda — controle de integridade)
| Item |
|---|
| Cinzeiro |
| Controle de TV |

---

## PARTE 3 — LÓGICA DE TEMPO E COBRANÇA (implementar ou revisar)

Esta é a parte mais crítica. Implemente seguindo as melhores práticas de sistemas de motel.

### Regras de negócio

**Modalidade Estadia (2h):**
- O hóspede paga no check-in pela estadia de 2 horas
- O sistema registra o `check_in_at` (timestamp exato da entrada)
- O sistema calcula o `expected_checkout_at` = check_in_at + 2 horas
- Quando o tempo de 2h é atingido, o sistema não expulsa o hóspede — ele continua, mas a cada bloco adicional de 2h é cobrado R$ 15,00
- Exemplo: entrou às 20:00 → checkout esperado 22:00 → se sair às 22:30 → cobra R$15 adicional → se sair às 00:30 → cobra R$30 adicional (dois blocos de 2h)

**Modalidade Pernoite:**
- Período fixo: 00:00 às 06:00h
- Valor fixo de R$ 90,00 para qualquer categoria de suíte
- A regra de adicional de 2h não se aplica ao pernoite

**Cortesia:**
- Válida apenas na modalidade de 2h (não no pernoite)

### O que implementar tecnicamente

1. **Campo `modalidade`** na tabela de check-in: `estadia_2h` ou `pernoite`

2. **Campo `check_in_at`** (timestamp): gravado automaticamente na abertura

3. **Campo `expected_checkout_at`** (timestamp): calculado na abertura com base na modalidade

4. **Cálculo do adicional em tempo real:**
   - Para `estadia_2h`: a cada 2h além do período base → + R$ 15,00
   - Fórmula: `blocos_extras = floor((agora - expected_checkout_at) / 2h)`
   - `valor_adicional = blocos_extras * 15.00` (somente se blocos_extras > 0)
   - O valor adicional é calculado no momento do checkout, não cobrado em tempo real

5. **Valor total no checkout:**
   - `total = preco_base_suite + soma_consumo_itens + valor_adicional`

6. **Alertas automáticos (WhatsApp via Evolution API):**
   - Disparar alerta para o dono quando uma suíte atingir o tempo base (2h) sem sinalizar saída
   - Disparar novo alerta a cada bloco adicional de 2h que passar sem checkout

7. **Dashboard em tempo real:**
   - Para cada suíte ocupada, exibir:
     - Status: `dentro do prazo` / `em adicional`
     - Tempo decorrido desde o check-in
     - Valor atual acumulado (base + consumo + adicional em andamento)
     - Quanto tempo falta para o próximo bloco de adicional

8. **Pernoite no dashboard:**
   - Exibir horário de término (06:00h)
   - Alertar o funcionário quando faltarem 30 minutos para o término

### Boas práticas a seguir

- Todos os timestamps devem ser gravados em UTC no banco e convertidos para o fuso horário local (America/Fortaleza, UTC-3) apenas na exibição
- O cálculo do adicional deve ser feito sempre no momento do checkout, nunca pre-calculado e salvo, para evitar inconsistências
- O audit trail deve registrar: quem abriu, quem fechou, modalidade escolhida, valor base, consumo de itens, adicional calculado e total final
- Nunca permita alterar o `check_in_at` após o registro — qualquer correção deve gerar um log de auditoria com PIN do gerente
- A lógica de adicional deve ser uma função pura e testável, isolada da UI

---

## RESUMO ESPERADO AO FINAL

Após executar tudo, me retorne:
- Quantas suítes foram inseridas (deve ser 16)
- Quantos itens de estoque foram inseridos por categoria
- Confirmação de que a lógica de tempo foi implementada ou revisada
- Se algum campo ou tabela precisou ser criado, liste quais foram
