# Design e acessibilidade

## Direção

- Público: equipe interna da Wake Club. Admin usa desktop e celular; o atendente usa
  quase só o celular, como PWA instalada.
- Idioma `pt-BR` (`<html lang="pt-BR">` em `src/routes/__root.tsx`), datas em
  `America/Sao_Paulo` via `src/lib/formato.ts`.
- Tom: ferramenta de trabalho direta. Ações principais grandes e alcançáveis com o
  polegar no celular.

Direção planejada (não implementada) para o WakeCRM: abas inferiores por papel, fila
de follow-ups estilo Reels com dois botões grandes e folha de motivo, comissão em
destaque no início do vendedor. Rascunhos aprovados no design do WakeCRM, §7.4 e §9.

## Sistema existente

- Fonte da verdade dos tokens: `src/styles.css` (Tailwind v4 `@theme inline` + variáveis
  CSS em `:root`/`.dark`). Fundo off-white quente, texto quase preto, acento esmeralda;
  tokens semânticos `success`, `warning`, `info`, `destructive` e `chart-1..5`.
- Tipografia: `Inter` (texto) e `Space Grotesk` (display), declaradas em `--font-sans` e
  `--font-display`.
- Raio base `--radius: 0.75rem`.
- Componentes: shadcn/ui estilo `new-york`, base `slate`, ícones `lucide`
  (`components.json`), 46 componentes em `src/components/ui/`.
- Shell: `src/components/AppSidebar.tsx`, menus diferentes para admin e atendente.
- PWA: `public/manifest.webmanifest`, `public/sw.js` (sem cache offline de dados),
  `theme-color` `#0b1220`.

Não duplique valores aqui: mude o token em `src/styles.css`.

## Interação

Use HTML semântico, navegação por teclado, foco visível e contraste adequado. Rotule
controles e campos. Erro de validação fica ao lado do campo; operação assíncrona mostra
progresso e resultado. Respeite `prefers-reduced-motion`.

Regras deste projeto:

- Navegação no iOS instalado usa `window.location.href`, nunca `window.open()`.
- Permissão de push é pedida por gesto direto do usuário.
- Texto de mensagem e dado do lead são texto não confiável: renderize como texto.

## Layout e revisão

- Breakpoint de celular do shell: `useIsMobile` (`src/hooks/`), padrão do shadcn.
- Estados que cada tela operacional precisa ter: carregando, vazio, erro e sem
  permissão.
- Revisões de interface registradas: nenhuma formal até 04/11/2026. PWA, push e retorno
  do WhatsApp ainda dependem de teste em aparelho real (iPhone na Tela de Início).

## Manutenção

Mudança visual ou de interação atualiza o token/componente na fonte e esta página quando
uma regra muda. Em revisões, use as skills `web-design-guidelines` e `shadcn`.
