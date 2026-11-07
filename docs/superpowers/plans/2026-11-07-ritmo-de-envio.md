# Ritmo de envio: cota espalhada, mais quente primeiro e prazo entre follow-ups

Data: 07/11/2026. Pedido do dono, implementado no mesmo dia.

**Objetivo:** o envio automático dos follow-ups aprovados continua ligado, no modo conservador
(20 por dia), mas sem rajada de manhã, sempre do lead mais quente para o mais frio e sem
insistir no mesmo lead.

## Decisões do dono

- Envio automático continua; nada de envio manual no lugar.
- Modo conservador: 20 envios por dia, divididos por hora dentro do horário comercial.
- Prioridade: mais quente primeiro.
- Quem recebeu follow-up espera pelo menos 3–4 dias pelo próximo.

## Decisões do construtor (revisáveis)

- **Horário comercial = janela já existente, 8h às 19h59 de São Paulo** (12 horas).
- **Cota acumulada por hora:** até o fim da hora `h` pode ter saído `ceil(cota × (h − 7) / 12)`.
  Conservador: 2, 4, 5, 7, 9, 10, 12, 14, 15, 17, 19, 20. O que não saiu numa hora sai na
  seguinte; o intervalo mínimo de 120 s entre envios continua.
- **Prazo de 3 dias** (o menor dos "3–4 dias"), contado do último follow-up comum `enviado`
  para o mesmo lead. Lembrete de aula ("amanhã"/"hoje") não espera e não conta para o prazo.
- **Ordem:** lembretes de aula primeiro (têm hora marcada), depois temperatura (quente, morno,
  frio, sem temperatura), depois maior valor esperado, depois o aprovado mais antigo.
- Aprovado de lead dentro do prazo fica `aprovado` e some da tela "Fila de envio" até o prazo
  passar.

## Mudanças

| Arquivo | O quê |
|---|---|
| `src/server/motor/ritmo.ts` | `cotaAteAgora(cotaDia, agora)` |
| `src/server/motor/envio-followups.ts` | cota do tick usa `cotaAteAgora`; `Candidato.temperatura`; `ordenarFila` por temperatura; `listarCandidatos` exclui lead com follow-up comum enviado há menos de 3 dias |
| `src/server/motor/ritmo.test.ts` | `cotaAteAgora` no conservador e no aquecido |
| `src/server/motor/envio-followups.db.test.ts` | ordem por temperatura; cota espalhada às 8h30; prazo de 3 dias; lembrete não espera; cota cheia testada às 19h30 |
| `docs/architecture.md` | "Ritmo, cota, janela e intervalo" e a ordem da fila |

Sem migração e sem mudança de tela.

## Verificação

- `bun run check`: 319 pass, 0 fail.
- `bun run test:db` (banco descartável 0001–0008): 574 pass, 0 fail.

## Produção

Deploy junto com o PR #8 (migração 0008), na ordem do PR #8: parar o container antigo →
`bun run db:migrate` → `bun run db:apply` → subir a imagem nova. Exige autorização do dono.
