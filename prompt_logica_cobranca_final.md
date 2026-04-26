# Prompt para Claude Code — Correção da Lógica de Cobrança · Paraíso Motel

---

## CONTEXTO

Este prompt corrige e substitui a lógica de tempo e cobrança definida anteriormente. A lógica estava errada em dois pontos: o adicional não é por bloco de 2h, é por hora. E o pernoite tem um comportamento específico para entradas antes da meia-noite. Substitua qualquer implementação anterior por esta.

---

## LÓGICA DE COBRANÇA — VERSÃO FINAL E DEFINITIVA

### Modalidade: Estadia

- O hóspede paga o valor base da suíte pelas primeiras 2h:
  - Suíte Simples: R$ 40,00
  - Suíte Luxo: R$ 50,00
  - Suíte Super Luxo: R$ 80,00
- Após as 2h iniciais: **R$ 15,00 por hora adicional**
- Hora iniciada já conta — sem tolerância
- Exemplo:
  - Entrou 20:00 → base até 22:00
  - Saiu 22:01 → cobra R$15 (1h iniciada)
  - Saiu 23:00 → cobra R$15 (1h exata)
  - Saiu 23:01 → cobra R$30 (2h iniciadas)

### Modalidade: Pernoite

- Período fixo: **00:00 às 06:00**
- Valor fixo: **R$ 90,00**
- O pernoite pode ser contratado a partir das **22:00**
- Se o hóspede entrar **antes da meia-noite**, as horas anteriores às 00:00 são cobradas à parte, no mesmo modelo de adicional por hora:
  - **R$ 15,00 por hora** entre a entrada e a meia-noite
  - Hora iniciada já conta
- Exemplo:
  - Entrou 22:00 → 2h antes da meia-noite = R$30 + R$90 pernoite = **R$120 total**
  - Entrou 23:00 → 1h antes da meia-noite = R$15 + R$90 pernoite = **R$105 total**
  - Entrou 00:00 → R$90 pernoite = **R$90 total**
  - Entrou 00:30 → R$90 pernoite = **R$90 total** (já dentro do período, sem adicional)

---

## IMPLEMENTAÇÃO TÉCNICA

### Campos necessários na tabela de check-in (stays)

```
modalidade         ENUM('estadia', 'pernoite')
check_in_at        TIMESTAMP WITH TIME ZONE   -- gravado automaticamente na abertura
expected_checkout_at TIMESTAMP WITH TIME ZONE -- calculado na abertura:
                                              --   estadia: check_in_at + 2h
                                              --   pernoite: dia seguinte às 06:00
preco_base         DECIMAL                    -- valor da suíte na modalidade escolhida
```

### Função de cálculo do adicional

Implementar como função pura, isolada e testável:

```
calcular_adicional(modalidade, check_in_at, checkout_at, preco_base):

  SE modalidade == 'estadia':
    tempo_extra = checkout_at - (check_in_at + 2h)
    SE tempo_extra <= 0: retorna 0
    horas_extras = ceil(tempo_extra em horas)   -- hora iniciada conta
    retorna horas_extras * 15.00

  SE modalidade == 'pernoite':
    meia_noite = início do dia seguinte ao check_in (00:00)
    SE check_in_at >= meia_noite: retorna 0     -- entrou já no período do pernoite
    horas_antes = ceil((meia_noite - check_in_at) em horas)
    retorna horas_antes * 15.00
```

### Valor total no checkout

```
total = preco_base + soma_itens_consumidos + calcular_adicional(...)
```

### Tela de check-in — comportamento da UI

- Antes das 22:00: mostrar apenas opção "Estadia 2h"
- Das 22:00 às 23:59: mostrar as duas opções
  - 🟡 Estadia · 2h · R$ 40 / 50 / 80
  - 🌙 Pernoite · até 06:00 · R$ 90
  - Se pernoite selecionado antes da meia-noite: exibir aviso em tempo real:
    > *"Entrada às 22:15 · Adicional de 2h antes da meia-noite: R$30 · Pernoite: R$90 · Total estimado: R$120 (sem consumo)"*
- Das 00:00 às 06:00: mostrar apenas opção "Pernoite" (se ainda houver hóspede)
- Após 06:00: mostrar apenas opção "Estadia 2h"

### Dashboard — exibição em tempo real (por suíte ocupada)

**Estadia:**
- Tempo decorrido desde o check-in
- Status: `dentro do prazo` (primeiras 2h) ou `em adicional` (após 2h)
- Valor acumulado = preco_base + (horas_extras_até_agora * 15) + consumo

**Pernoite:**
- Se ainda antes da meia-noite: exibir "Pré-pernoite · Xx min até 00:00 · adicional em andamento"
- Se já após meia-noite: exibir "Pernoite ativo · Checkout às 06:00 · Xh Xmin restantes"
- Alerta visual quando faltar 30 minutos para as 06:00

### Alertas WhatsApp (Evolution API)

- Suíte em estadia completou 2h sem sinalizar saída → alerta ao dono
- A cada hora adicional que passar sem checkout → novo alerta
- Pernoite faltando 30min para as 06:00 → alerta ao recepcionista e ao dono

---

## RESUMO DO QUE MUDAR

1. Corrigir o cálculo de adicional: era por bloco de 2h, agora é **por hora (ceil)**
2. Implementar lógica de pré-pernoite: horas antes das 00:00 cobradas a R$15/hora
3. Bloquear opção pernoite na UI antes das 22:00
4. Exibir estimativa de custo em tempo real na tela de check-in quando pernoite for selecionado antes da meia-noite
5. Atualizar o dashboard para refletir os dois estados do pernoite (pré e pós meia-noite)

Não mexa em mais nada além do que está listado acima.
