# TOKAI INVEST — integração MT5 em preparação

Esta branch substitui a demonstração por um painel privado de dados recebidos via API.
**Ainda não publicada nem validada em um terminal MT5. Não é uma ativação concluída.**

## Implementado
- Interface mantém CSS e logo; remove dados e gráfico simulados. Sem dados, mostra estado vazio.
- Monitor MQL5 somente leitura, em gráfico separado do robô, envia snapshots a cada 5 segundos.
- Posições com SL/TP, execuções individuais (entradas, saídas parciais e reversões), bid/ask e moeda real.
- API Node 24 com SQLite persistente, chaves diferentes para envio e leitura, CORS restrito e validação.
- Execuções identificadas por ticket textual, sem perda de precisão e sem duplicação no reenvio.
- Estado offline após 30 segundos, mantendo os últimos dados.
- Recuperação de execuções a partir do cursor persistido no terminal; carga inicial padrão de 30 dias.

## Implantação do servidor
Necessário um serviço HTTPS com Node 24 e volume persistente. GitHub Pages hospeda apenas a interface.
1. Gerar duas chaves independentes: `openssl rand -hex 32` (uma para ingestão, outra para consulta).
2. Configurar variáveis do `server/.env.example` no provedor. Nunca salvar chaves no repositório.
3. Executar `node server/server.mjs`, ou construir a imagem em `server/` e montar volume em `/data`.
4. Configurar HTTPS, backups do SQLite e limitação de requisições no proxy do provedor.
5. Ajustar `config.js` com a URL pública HTTPS, sem chaves. Publicar a interface no GitHub Pages.
6. Usar a chave VIEWER_TOKEN para acessar o painel privado. Ela fica apenas em memória e sai ao recarregar.

## Instalação no Mac com Parallels
Dentro do **Windows do Parallels**, no MT5:
1. Arquivo → Abrir pasta de dados → MQL5 → Experts; copiar `mt5/TokaiMonitor.mq5`.
2. Abrir no MetaEditor e compilar. A compilação e execução precisam ser verificadas neste ambiente.
3. Ferramentas → Opções → Expert Advisors: permitir WebRequest para a URL HTTPS do servidor.
4. Abrir um gráfico separado do robô e anexar TokaiMonitor.
5. Preencher ApiUrl (sem barra final), IngestToken, ExpectedAccount (login da conta), Source=principal e GoldSymbol com o nome exato da corretora (ex.: XAUUSD ou XAUUSD.s).
6. Manter relógio do Windows sincronizado, MT5 conectado e Windows virtual em execução; evitar suspensão do Mac.
7. Conferir aba Experts, API e painel. Não precisa enviar senha da corretora ao servidor.

O monitor acompanha todas as execuções do símbolo configurado nesta conta, incluindo as manuais. Não filtra por robô/Magic Number. Uma conta/símbolo por servidor nesta versão; para trocar a conta, usar banco e chaves novos.

## Validação
`node --test tests/api.test.mjs`
`node --check live.js`

Antes da operação real: compilar no MetaEditor, testar em conta de demonstração entrada, fechamento parcial, fechamento completo, SL/TP, reconexão, reinício e suspensão do Parallels. Não abrir ordens reais para teste automaticamente.

## Limites e pendências explícitas
- Notificações push com aplicativo fechado e cadastro/assinatura individual **ainda não implementados**. A chave de consulta é para validação privada pelo responsável, não para distribuição a assinantes.
- Alterações de SL/TP aparecem no snapshot seguinte; alterações transitórias entre snapshots não têm trilha de auditoria.
- História exibe execuções, não estatísticas de operações agregadas. Comissão, swap e taxas vinculadas ao deal são incluídos; lançamentos separados de saldo/taxas não entram.
- Histórico do MT5 usa horário da corretora; a última recepção é exibida em Asia/Tokyo.
- Os últimos 1.000 deals são consultados pelo painel; o banco conserva os demais. Cotações são o último tick recebido, que pode não ser recente fora da sessão de mercado.
- O cursor avança apenas com resposta HTTP 200; execuções antigas alteradas pela corretora fora da sobreposição de 2 segundos requerem reimportação. Reinstalação do terminal sem cursor usa HistoryDays.
- Se o servidor/banco for recriado, restaurar backup ou limpar a variável global Tokai_ correspondente no terminal para reimportar o período configurado.
- Compilação MQL5, notificações e validação visual no navegador ainda pendentes. Nenhum envio real verificado.
- Publicação exige acesso de escrita ao repositório e escolha/configuração da hospedagem.
