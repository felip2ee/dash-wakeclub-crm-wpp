# Design e acessibilidade

## Direção

- Público: equipe interna da Wake Club. Admin usa desktop e celular; o atendente usa
  quase só o celular, como PWA instalada.
- Idioma `pt-BR` (`<html lang="pt-BR">` em `src/routes/__root.tsx`), datas em
  `America/Sao_Paulo` via `src/lib/formato.ts`.
- Tom: ferramenta de trabalho direta. Ações principais grandes e alcançáveis com o
  polegar no celular.
- Implementado: abas inferiores por papel no celular, barra lateral no desktop, fila
  "Para avaliar" com dois botões grandes e folha de motivo, "Meu painel" do vendedor com a
  comissão em destaque.

## Referências visuais

As telas ficam iguais às imagens de `docs/ref/ui/` (índice e leitura de cada imagem em
`docs/ref/README.md`), no tema verde; o rosa é tema opcional. Em dúvida entre a imagem e um
componente atual, vale a imagem (com a cor do tema). Fotos, nomes e números das imagens são
inventados: fotos viram avatar com iniciais. Spec:
`docs/superpowers/specs/2026-11-05-wakecrm-interface.md`.

| Imagem                                         | Tela                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| `01-mobile-para-avaliar-e-conversa.png`        | Para avaliar (`/aprovar`) e conversa                    |
| `02-admin-configuracoes-e-operacao.png`        | Configurações e operação (`/configuracoes`)             |
| `03-admin-visao-geral.png`                     | Visão geral (`/visao-geral`)                            |
| `04-admin-pipeline.png`                        | Pipeline (`/pipeline`)                                  |
| `05-mobile-conversas-painel-pipeline-config.png` | abas do celular: Conversas, Meu painel, Pipeline, Config. |
| `05b-variante-anterior-mobile-com-aba-painel.png` | só comparação; vale a 05                              |

Onde a referência e o CRM divergem, o CRM vence e a divergência está registrada nos
ledgers: a ordem das colunas do Pipeline segue o funil do CRM (não a da imagem), o card de
lead não mostra R$ nem número do toque, e as telas não têm sino, ajuda nem foto de perfil.

## Sistema de tokens

Fonte da verdade: `src/styles.css` (Tailwind v4 `@theme inline` + variáveis CSS). Não
duplique valores aqui; mude o token na fonte.

- **Base:** fundo off-white quente no claro; no escuro, superfícies grafite das referências
  (fundo `oklch(0.13 0.01 260)`, cartão `oklch(0.18 0.01 260)`, borda `oklch(1 0 0 / 8%)`).
  Tokens semânticos `success`, `warning`, `info`, `destructive` e `chart-1..5`.
- **Tipografia:** `Inter` (texto) e `Space Grotesk` (display), em `--font-sans` e
  `--font-display`. Raio base `--radius: 0.75rem` (muda com a densidade).
- **Tokens novos:**
  - `--gradiente-primario` e `--gradiente-primario-suave` (utilitários `bg-gradiente-primario`
    e `bg-gradiente-primario-suave`): KPIs, botão Enviar, item ativo da navegação e fundo da
    caixa "Sugestão da IA";
  - `--quente`, `--morno`, `--frio`: fundos sólidos dos chips de temperatura, iguais nos dois
    temas;
  - `--sucesso-whatsapp`: verde do ✓✓ e do status "Conectado" (versão própria no escuro);
  - `--serie-lead`, `--serie-equipe`, `--serie-ia`: séries da linha do tempo e dos gráficos
    (passos próprios no escuro, não derivados dos claros);
  - `--sidebar*`: barra lateral grafite nos dois temas; só `--sidebar-primary` e
    `--sidebar-ring` mudam com o tema;
  - `--espaco`: multiplicador de espaçamento da densidade.
- PWA: `public/manifest.webmanifest`, `public/sw.js` (sem cache offline de dados),
  `theme-color` `#0b1220`.

### Temas (`data-tema`)

`<html data-tema="verde" | "rosa">`. Só trocam cor, nunca layout.

| Tema           | Primária (claro / escuro)                          | Degradê primário (135°)                            |
| -------------- | -------------------------------------------------- | -------------------------------------------------- |
| verde (padrão) | `oklch(0.52 0.16 158)` / `oklch(0.7 0.17 158)`      | `oklch(0.45 0.15 158)` → `oklch(0.54 0.16 152)`    |
| rosa           | `oklch(0.56 0.22 15)` / `oklch(0.62 0.25 15)` (texto do acento escuro `oklch(0.15 0.03 15)`) | `oklch(0.58 0.25 15)` → `oklch(0.585 0.2 35)`      |

Contraste medido ≥ 4,5:1 nos quatro casos: verde claro 4,68; rosa claro 5,02; rosa escuro 4,57 como texto e 4,80 no badge.

O seletor `:root[data-tema="rosa"]` vence `.dark` na especificidade; por isso
`:root[data-tema="rosa"].dark` devolve os valores do escuro (acento e texto do acento).

### Modo e densidade

- Modo: classe `.dark` em `<html>`; o padrão segue `prefers-color-scheme` e as preferências
  permitem fixar claro ou escuro.
- Densidade: `<html data-densidade="grande" | "medio" | "pequeno">` muda o `font-size` base
  (17 / 16 / 14,5 px), o `--radius` (0,9 / 0,75 / 0,6 rem) e `--espaco` (1,15 / 1 / 0,85).
  Médio é o padrão de `:root`. Vale para o CRM inteiro, neste navegador.
- Preferências (`src/features/preferencias/`): tema, modo e densidade em
  `localStorage["wakecrm.preferencias"]`. Um script inline no `<head>` (`SCRIPT_INLINE`)
  aplica `data-tema`, `data-densidade` e `.dark` antes da hidratação; os testes executam a
  mesma string. Storage bloqueado ou corrompido cai no padrão (verde, sistema, médio).
  Seletores em Configurações (`TemaEModo`, `TamanhoInterface`) e em Perfil.

## Componentes

- shadcn/ui estilo `new-york`, base `slate`, ícones `lucide` (`components.json`), 46
  componentes em `src/components/ui/` mais os três abaixo.
- `CardDegrade` (`ui/card-degrade.tsx`): cartão de KPI em degradê do tema, com ícone,
  título, valor grande, legenda e botão ⓘ com a explicação do número. Texto sempre branco.
- `ChipTemperatura` (`ui/chip-temperatura.tsx`): chip Quente / Morno / Frio com fundo sólido
  (nunca o degradê).
- `AvatarIniciais` (`ui/avatar-iniciais.tsx`): iniciais do nome, cor derivada do nome.
- Shell (`src/components/shell/`): `AppShell` (monta a área útil), `BarraLateral` (desktop),
  `BarraInferior` (celular), `MenuUsuario` (usuário no rodapé: perfil e sair), `navegacao.ts`
  (itens por papel, `rotaInicial`) e `useSair`. Breakpoint de celular: `useIsMobile`.

## Regras de contraste (medidas)

Contraste calculado sobre os tokens de `src/styles.css`; remeça se mexer neles.

- Números grandes (≥ 24 px, negrito) em branco sobre o degradê: ≥ 3:1.
- Texto pequeno em branco pleno (sem opacidade) sobre o degradê: ≥ 4,5:1 no ponto mais claro.
  O fim do degradê foi escurecido por isso (verde L 0,54; rosa início L 0,58 e fim L 0,585);
  as medições ficaram em ≥ 4,6:1, com folga pequena no verde (4,61): remeça ao mexer.
- Chips de temperatura em 12 px: quente com texto branco 6,0:1; morno com texto escuro
  8,9:1; frio com texto branco 4,9:1.
- Texto pequeno sobre degradê nunca usa opacidade; chips nunca usam o degradê.
- Pendente: as séries `--serie-*` não foram revalidadas no escuro para contraste de texto.

## Interação

Use HTML semântico, navegação por teclado, foco visível e contraste adequado. Rotule
controles e campos. Erro de validação fica ao lado do campo; operação assíncrona mostra
progresso e resultado. Respeite `prefers-reduced-motion`.

Regras deste projeto:

- Navegação no iOS instalado usa `window.location.href`, nunca `window.open()`.
- Permissão de push é pedida por gesto direto do usuário.
- Texto de mensagem, dado do lead e texto da IA são texto não confiável: renderize como texto.
- Ação irreversível pede confirmação (aquecido em dois passos, vincular venda, marcar mês
  pago).

## Layout e revisão

- Celular (abaixo de `md`), no jeito do WhatsApp iOS: com uma conversa aberta (`?lead=` em `/`
  e `/meus-leads`, `conversaAberta` em `navegacao.ts`) somem o cabeçalho e a barra inferior, e
  a conversa ocupa `100dvh`. O viewport usa `viewport-fit=cover`; cabeçalhos, Composer,
  sheets e drawer descontam `env(safe-area-inset-*)`.

- Estados que cada tela operacional precisa ter: carregando, vazio, erro e sem permissão.
- Pendências conhecidas: altura das telas antigas no celular (`h-[calc(100dvh-...)]`) e área
  útil no iPhone instalado (rodapé sob a barra inferior com safe-area) precisam de conferência
  em aparelho; PWA, push e retorno do WhatsApp dependem de teste em iPhone na Tela de Início.
- Nenhuma revisão formal de interface com login real foi feita até 05/11/2026.

## Manutenção

Mudança visual ou de interação atualiza o token/componente na fonte e esta página quando
uma regra muda. Em revisões, use as skills `web-design-guidelines` e `shadcn`.
