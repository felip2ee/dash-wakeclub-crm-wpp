/**
 * DADO FALSO — só a tela /templates (Disparos) usa isto.
 *
 * Todo o resto do painel lê o Postgres do CRM através de `src/server/*`.
 * Se você está aqui procurando de onde vem um número que viu na tela, e a tela
 * não era a de Disparos, procurou no lugar errado.
 *
 * Quando disparo virar de verdade, este arquivo some junto com a tela — o
 * caminho será o WF-03 no n8n, não um mock aqui.
 */

export type Template = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  body: string;
  updatedAt: string;
  variables: number;
};

export const templates: Template[] = [
  {
    id: "t1",
    name: "welcome_offer_v3",
    category: "MARKETING",
    language: "pt_BR",
    status: "APPROVED",
    body: "Oi {{1}}! 👋 Preparamos uma condição especial para você: 30% off no primeiro mês. Bora ativar?",
    updatedAt: "há 2 dias",
    variables: 1,
  },
  {
    id: "t2",
    name: "order_confirmation",
    category: "UTILITY",
    language: "pt_BR",
    status: "APPROVED",
    body: "Olá {{1}}, seu pedido #{{2}} foi confirmado. Previsão de entrega: {{3}}.",
    updatedAt: "há 5 dias",
    variables: 3,
  },
  {
    id: "t3",
    name: "otp_login_code",
    category: "AUTHENTICATION",
    language: "pt_BR",
    status: "APPROVED",
    body: "Seu código de acesso é {{1}}. Não compartilhe com ninguém.",
    updatedAt: "há 1 semana",
    variables: 1,
  },
  {
    id: "t4",
    name: "black_friday_teaser",
    category: "MARKETING",
    language: "pt_BR",
    status: "PENDING",
    body: "🖤 {{1}}, a Black do ano tá chegando. Quer ser avisado em primeira mão?",
    updatedAt: "há 3h",
    variables: 1,
  },
  {
    id: "t5",
    name: "cart_abandon_24h",
    category: "MARKETING",
    language: "pt_BR",
    status: "REJECTED",
    body: "Ei {{1}}, ficou algo pra trás no carrinho. Finalize agora com frete grátis!",
    updatedAt: "há 1 dia",
    variables: 1,
  },
  {
    id: "t6",
    name: "appointment_reminder",
    category: "UTILITY",
    language: "pt_BR",
    status: "APPROVED",
    body: "Oi {{1}}, lembrete do seu horário {{2}} às {{3}}. Podemos confirmar?",
    updatedAt: "há 6 dias",
    variables: 3,
  },
];

export type Campaign = {
  id: string;
  name: string;
  template: string;
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  status: "Rascunho" | "Agendada" | "Enviando" | "Concluída";
  scheduledFor: string;
};

export const campaigns: Campaign[] = [
  {
    id: "cp1",
    name: "Reativação inativos 60d",
    template: "welcome_offer_v3",
    audience: 4820,
    sent: 4820,
    delivered: 4712,
    read: 3980,
    replied: 612,
    status: "Concluída",
    scheduledFor: "18/07 09:00",
  },
  {
    id: "cp2",
    name: "Aviso manutenção sábado",
    template: "appointment_reminder",
    audience: 1290,
    sent: 812,
    delivered: 790,
    read: 410,
    replied: 22,
    status: "Enviando",
    scheduledFor: "hoje 15:30",
  },
  {
    id: "cp3",
    name: "Black Friday teaser",
    template: "black_friday_teaser",
    audience: 12400,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    status: "Agendada",
    scheduledFor: "25/11 08:00",
  },
  {
    id: "cp4",
    name: "Feedback pós-compra",
    template: "order_confirmation",
    audience: 2200,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    status: "Rascunho",
    scheduledFor: "—",
  },
];
