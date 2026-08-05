# Botão "não atender" — especificação para o front

> **Escopo:** um botão só, em duas telas. Escrita direta no Postgres, **sem webhook**.
> Tudo o que este documento pede vive dentro de `dashboard/` — banco e n8n já estão
> prontos e não precisam ser tocados.
>
> Companheiro do `ESPEC-PAINEL-EQUIPE.md`, que descreve o painel inteiro. Aquele manda
> nas convenções gerais; este manda neste botão. Se divergirem, este é mais recente
> (05/08/2026).

---

## 0. Por que este botão existe

O CRM tem três **filtros duros** — fatos objetivos que impedem um lead de receber
followup, e que ficam em `WHERE` de SQL, nunca em julgamento de IA: `opt_out` (o lead
pediu para parar), horário comercial, e **`sem_atendimento`** (este contato não é
atendido pela equipe — parceiro, fornecedor, número interno).

Até 04/08/2026 o `sem_atendimento` vinha de uma etiqueta do WhatsApp Business. Descobriu-se
que as etiquetas do WhatsApp **não são legíveis nem graváveis** por esta versão da Evolution
API — quatro caminhos testados, todos fechados. O fato perdeu a fonte.

**A decisão foi movê-lo para uma pessoa:** alguém marca no painel. É por isso que este
botão existe, e é por isso que ele é a **segunda exceção nomeada** à regra de que o painel
nunca escreve.

---

## 1. A regra que este botão não pode quebrar

O painel é **espelho**. Ele lê o CRM e não escreve nele. A razão é concreta: quem escreve
`etiqueta` é o workflow de qualificação (WF-02) e quem escreve `atendente_id` é o de
distribuição (WF-08), ambos rodando de minuto em minuto. Se o painel também escrevesse
nessas colunas, os dois brigariam pelo mesmo registro.

A exceção que você vai usar é **estreita de propósito**: a conexão de escrita alcança
`sem_atendimento` e `sem_atendimento_motivo`, **e nada mais** em `leads`. Isso não é
convenção — é privilégio de banco, já aplicado e verificado:

```
✓ select * em leads barrado (42501)           ✓ UPDATE de sem_atendimento permitido
✓ leitura de leads.telefone barrado (42501)   ✓ UPDATE de leads.etiqueta barrado (42501)
✓ leitura de leads.sem_atendimento permitida  ✓ UPDATE de leads.atendente_id barrado (42501)
```

Se você tentar escrever em qualquer outra coluna de `leads`, o Postgres devolve `42501` e
o botão quebra. **Isso é o desenho funcionando, não um bug para contornar.**

---

## 2. O que já está pronto — não refazer

| Peça | Estado |
| --- | --- |
| Grant no banco | ✅ aplicado em 05/08 e provado por `bun run db:check` |
| `v_leads_painel` | ✅ **já expõe** `sem_atendimento` e `sem_atendimento_motivo` |
| Conexão de escrita | ✅ `getPoolRw()` em `src/server/db.ts` |
| Guardas de sessão | ✅ `exigirSessao`, `exigirAtendente`, `exigirAdmin` em `src/server/auth.ts` |
| Padrão de escrita | ✅ `registrarToque` em `src/server/followups.ts:79` — **copie a forma dele** |

Não crie role, não rode `db:apply`, não mexa em `db/*.sql`. Se o `db:check` acusar
qualquer coisa, pare e reporte — não tente consertar por conta.

---

## 3. O que construir

### 3.1 Server function — em `src/server/leads.ts`

Use o módulo que **já existe** (`leads.ts` já está na lista liberada do `vite.config.ts`).
Criar módulo novo em `src/server/` exige acrescentá-lo àquela lista, senão `bun dev`
funciona e `bun run build` quebra — ver §5.

```ts
export const definirSemAtendimento = createServerFn({ method: "POST" })
  .validator(
    z.object({
      leadId: z.string().uuid(),
      semAtendimento: z.boolean(),
      motivo: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ semAtendimento: boolean }> => {
    const sessao = await exigirSessao();

    // Atendente só mexe no lead dela; admin mexe em qualquer um.
    // Mesma forma do registrarToque (followups.ts:83) — a checagem de posse
    // vem ANTES da escrita, pela conexão de leitura.
    if (sessao.papel !== "admin") {
      const { rows } = await getPool().query(
        `select 1 from wakeclub.v_leads_painel
          where id = $1::uuid and atendente_id = $2::uuid limit 1`,
        [data.leadId, sessao.usuarioId],
      );
      if (!rows[0]) throw new Error("Lead não pertence à atendente autenticada.");
    }

    // O motivo carrega a autoria porque NÃO EXISTE coluna de autor —
    // o grant alcança só estas duas colunas. Ver a limitação no §6.
    const motivo = data.semAtendimento
      ? `${sessao.nome}: ${data.motivo?.trim() || "sem motivo informado"}`.slice(0, 200)
      : null;

    await getPoolRw().query(
      `update wakeclub.leads
          set sem_atendimento = $2::boolean,
              sem_atendimento_motivo = $3::text
        where id = $1::uuid`,
      [data.leadId, data.semAtendimento, motivo],
    );

    return { semAtendimento: data.semAtendimento };
  });
```

> **`$3::text` não é enfeite.** Parâmetro que pode chegar nulo ou vazio precisa de cast
> explícito — o Postgres infere o tipo pelo uso e já quebrou duas vezes neste projeto por
> causa disso.

### 3.2 Expor o estado na listagem

`listarMeusLeads` (`src/server/meus-leads.ts:52`) seleciona uma lista fixa de colunas que
**não inclui** `sem_atendimento`. Acrescente `sem_atendimento` e `sem_atendimento_motivo`
ao `select` e ao tipo de retorno (`semAtendimento`, `semAtendimentoMotivo`). A view já
tem as duas — é só pedir.

Faça o mesmo em `src/server/leads.ts` se a tela de leads também for mostrar o estado.

### 3.3 O botão

**Onde:** na ficha do lead — em `/meus-leads` e na ficha lateral de `/` (conversas).
Não na lista: é ação destrutiva, não pode ficar a um clique de distância numa lista.

**Como se comporta:**

- **Estado desmarcado:** botão discreto, secundário, texto "Não atender". Não compete
  visualmente com nada — é uma ação rara.
- **Ao clicar:** abre confirmação com **campo de motivo obrigatório** (texto curto, até
  200 caracteres). A confirmação existe porque a consequência é permanente até alguém
  desfazer, e porque o motivo é a única auditoria que teremos.
- **Estado marcado:** a ficha mostra um selo claro — "Não atendido · {motivo}" — e o botão
  vira "Voltar a atender", que desmarca **sem pedir motivo** (desmarcar é seguro).
- **Enquanto salva:** desabilite o botão. Não faça atualização otimista: se o `42501`
  aparecer, o usuário precisa ver que **não** foi salvo.
- **Em erro:** mostre a mensagem real. Um `permission denied` aqui significa que o grant
  saiu do ar, e mascarar isso com "algo deu errado" custaria horas de investigação.

**O texto importa.** Isto não é "pausar" nem "arquivar" — é dizer que **este contato não é
cliente**. A cópia da confirmação deve deixar claro o que acontece: *"Este contato deixa de
entrar na distribuição e não recebe mais follow-up. Você pode desfazer depois."*

---

## 4. O que marcar de fato faz — e o que não faz

Seja honesto na cópia da tela, porque hoje o efeito é parcial:

| | |
| --- | --- |
| ✅ **Sai da distribuição** | O WF-08 não atribui lead marcado a ninguém. |
| ⏳ **Não recebe follow-up** | Será verdade quando o WF-03 existir; ele já foi desenhado com o filtro. |
| ❌ **Continua sendo qualificado pela IA** | O WF-02 **não** filtra `sem_atendimento` hoje. Lacuna conhecida, reportada em 05/08/2026. |
| ❌ **Não muda de dona** | Marcar não desatribui. Lead que já tem dona continua com ela e continua aparecendo na lista dela — por isso o selo na ficha importa. |

**Não escreva na tela que a IA para de processar o lead.** Hoje não para.

---

## 5. Armadilhas que já custaram tempo neste repositório

1. **`vite.config.ts` e os módulos de server function.** O preset nega `**/server/**` no
   bundle do cliente, e a exceção é uma **lista manual** de arquivos. Usando `leads.ts`
   você não precisa mexer nela. Se criar arquivo novo em `src/server/`, **acrescente à
   lista** — senão `bun dev` funciona e `bun run build` quebra, que é o pior par possível.
2. **`getPool()` versus `getPoolRw()`.** A conexão de leitura abre com
   `default_transaction_read_only=on`; qualquer `update` por ela estoura. Leitura e
   checagem de posse pela `getPool()`; só o `update` pela `getPoolRw()`.
3. **Cast explícito em parâmetro que pode vir vazio** — `$3::text`. Duas quebras neste
   projeto por conta disso.
4. **Não invente coluna nova.** Se sentir falta de um campo (autor, data da marcação), ele
   não existe e o grant não o alcançaria. Reporte em vez de contornar.

---

## 6. Limitação conhecida, e por que não foi resolvida

**Não existe registro de quem marcou nem de quando.** A tabela `leads` não tem colunas
para isso, e a exceção de privilégio foi deliberadamente estreita — abrir mais colunas para
o painel enfraqueceria a separação que o §1 protege.

A saída é o nome de quem marcou ir **dentro do `sem_atendimento_motivo`**
(`"isadora: número da contabilidade"`). É feio e não é consultável, mas é honesto e cabe no
que já existe. Se virar necessidade real, o caminho certo é uma tabela de auditoria própria
— não mais colunas de `leads` liberadas para o painel.

---

## 7. Aceite

Só está pronto quando:

- [ ] `bun run build` passa. **Rode antes de dizer que acabou** — o `bun dev` esconde o
      erro do `vite.config.ts`.
- [ ] `bun run lint` limpo.
- [ ] Marcar um lead, recarregar a página, e o selo continuar lá.
- [ ] Desmarcar, recarregar, e o selo sumir com o motivo zerado.
- [ ] Uma atendente **não** consegue marcar lead de outra (a checagem de posse recusa).
- [ ] `bun run db:check` continua passando inteiro — em especial as seis linhas de
      privilégio de `leads` citadas no §1. Se alguma virar vermelha, algo saiu do contrato.
- [ ] Nenhum arquivo em `db/`, nenhuma migração, nenhum workflow n8n tocado.

---

## 8. Por que não tem webhook aqui

Foi considerado e descartado. O painel já escreve direto no Postgres em cinco módulos
(`auth`, `admin`, `followups`, `push`, `push-dispatch`), por uma role de privilégio
estreito. Um webhook n8n seria um salto a mais para chegar ao **mesmo banco** que o painel
já tem conexão, com autenticação própria para manter e um modo de falha novo — n8n fora do
ar viraria botão que não faz nada.

O n8n é a resposta quando a ação tem **efeito colateral**: chamar IA, falar com a Evolution,
agendar alguma coisa. Trocar um booleano não tem. Se um dia entrar um botão de **reatribuir
lead**, aí sim vai por webhook — `atendente_id` é da caneta do WF-08 e a role do painel está
barrada nessa coluna justamente para impedir dois escritores.
