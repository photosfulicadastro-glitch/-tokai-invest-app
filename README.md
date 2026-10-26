# TOKAI INVEST — teste privado de sinais MT5

Painel de consulta para XAUUSD: Visão geral, Mercado, Operações e Histórico. Login individual por convite, com acesso administrativo separado. Consulte [ACCESS.md](ACCESS.md) para criar convites, bloquear acessos e recuperar senhas.

## Funcionamento

- Frontend estático no GitHub Pages; API Node 24 com PostgreSQL no Render gratuito.
- Monitor `mt5/TokaiMonitor.mq5` 1.20 somente leitura: posições, SL/TP, execuções, bid/ask, moeda da conta e até 180 candles de cada período M1/M5/M15. Posições e execuções são enviadas a cada segundo; candles a cada dez segundos, com MT5 conectado. A rede e o processamento acrescentam latência.
- Histórico por ticket textual, com reenvio idempotente, recuperação via cursor local e carga inicial de 30 dias. Horários das velas/execuções são os da corretora; recebimento é exibido no horário do Japão.
- Monitor acompanha todas as operações do símbolo configurado na conta, inclusive manuais. Não filtra Magic Number.
- Último estado permanece visível como desatualizado quando o recebimento para. O painel consulta até 1.000 execuções; o banco conserva as demais.
- Usuários têm acesso somente de leitura. Nenhuma ordem pode ser aberta ou fechada pelo aplicativo. Espelhamento e telas futuras estão reservados em `archive/future-pages.js.txt`, fora da aplicação carregada.

## Instalação do monitor

No Windows do Parallels: MT5 → Arquivo → Abrir pasta de dados → MQL5 → Experts. Copie o MQ5, compile no MetaEditor e anexe a um gráfico separado do robô. Configure `ApiUrl`, `IngestToken`, `ExpectedAccount`, `Source=principal` e `GoldSymbol` com o símbolo exato. Autorize a URL HTTPS do servidor na lista de WebRequest. Não desative proteções de negociação nem troque a conta do robô para instalar o monitor.

O Mac, Windows virtual e MT5 precisam permanecer em execução e conectados. Atualizações do monitor devem preservar os parâmetros. Não publique chaves nem capturas com segredos.

## Servidor

`npm ci && npm test` para construir e validar; `npm start` para iniciar. Variáveis: `DATABASE_URL`, `INGEST_TOKEN`, `VIEWER_TOKEN`, `MT5_SOURCE=principal`, `APP_ORIGIN=https://photosfulicadastro-glitch.github.io`. As chaves de ingestão e administração são diferentes. `config.js` contém somente a URL pública da API.

As tabelas de autenticação são adicionais às tabelas de operações. O monitor continua usando a mesma chave de ingestão. `VIEWER_TOKEN` é exclusivo do administrador; convidados não recebem essa chave. O banco de testes gratuito expira em 25/11/2026; os cadastros e sinais precisam de exportação/migração antes disso. O serviço gratuito pode suspender por inatividade e levar tempo para retomar. Não há contratação paga nesta implementação.

## Limites atuais

- Notificações push com o aplicativo fechado, cadastro público, assinaturas, pagamentos e cópia de operações não estão implementados.
- Sinais são exibidos enquanto o painel está aberto; a distribuição inicial é por convite a um grupo pequeno.
- SL/TP são amostrados; alterações transitórias entre snapshots não são auditadas.
- Execuções são individuais, incluindo fechamentos parciais, e não um relatório agregado de desempenho. Lançamentos separados de saldo/taxas não são incluídos.
- Correções antigas de execuções fora da sobreposição do cursor exigem reimportação. Se o banco for recriado, restaurar backup ou limpar a variável global Tokai_ correspondente no terminal para reimportar o período configurado.
- Compilação MQL5 e testes de operação devem ser verificados no terminal do usuário; não abrir ordens reais apenas para testar.

## Verificação

`npm test` testa ingestão, autenticação, autorização, convites, recuperação, persistência, validade de candles e navegação. Os testes usam SQLite e o mesmo repositório SQL de autenticação utilizado com PostgreSQL. `node --check live.js` verifica a sintaxe do frontend.
