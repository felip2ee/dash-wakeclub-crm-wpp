-- 0006 · Webhook sem apikey: remove a chave global da Evolution dos corpos já gravados.
--
-- O envelope do webhook da Evolution traz `apikey` (chave GLOBAL da API) no nível superior
-- e o receptor a persistia em webhook_eventos.corpo. O código agora a descarta antes de
-- gravar; esta migração limpa o que já entrou. Depois de aplicar, rotacione a chave.
-- Idempotente: reaplicar por cima não muda nada.

update wakeclub.webhook_eventos
   set corpo = corpo - 'apikey'
 where origem = 'evolution' and corpo ? 'apikey';
