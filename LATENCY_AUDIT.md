# Auditoria de gráfico e latência — 26/10/2026

Base auditada: bdffae13160943ee946bc91eeb629fca649ea4d9, main e feat/mt5-integration.

## Correções nesta versão

- O SVG tem largura mínima de 650px. No celular, a vela mais recente fica à direita, fora da posição inicial. O render completo destruía o contêiner e restaurava a rolagem para zero a cada resposta.
- O gráfico agora abre na extremidade direita e acompanha as atualizações. Rolar para trás pausa o acompanhamento e conserva scrollLeft nos renders. Chegar à direita ou tocar “Voltar à última vela” retoma. Trocar o período retoma o acompanhamento.
- Consultas visíveis passam de 1000ms para 500ms quando online. Sem conexão recente/erro, intervalo de 1000ms. Aba oculta não consulta; voltar à aba consulta imediatamente. A trava busy continua impedindo requisições simultâneas.
- Respostas com o mesmo received_at e status não recriam o DOM; erros, recuperação e mudança para candles desatualizados continuam atualizando a interface.
- O HTML referencia uma nova versão de live.js para evitar o cache antigo.

## Caminho do sinal e esperas identificadas

| Etapa | Estado verificado no código | Implicação |
|---|---|---|
| Monitor 1.20 | EventSetTimer(1), envio síncrono WebRequest | Uma execução pode aguardar quase 1s pelo próximo envio, além da rede. Instalação da versão no terminal não foi verificada nesta sessão. |
| Candles | Séries M1/M5/M15 a cada 10000ms | A rolagem corrigida não transforma esse fluxo em candles por tick. |
| Ingestão | Valida, grava estado/execuções e fila push na transação, depois confirma | Preserva persistência antes da entrega. |
| Aplicativo aberto | Polling autenticado, agora 500ms | Espera nominal de detecção de 0–500ms quando livre e online, antes de somar rede/processamento. Antes era 0–1000ms. Em um modelo uniforme ideal, ganho médio de 250ms nesta etapa; não é uma medição ponta a ponta. |
| Leitura PostgreSQL | Sessão autenticada, transação e consulta de até 1000 execuções em cada consulta | O polling online pode dobrar requisições por leitor; redução de renders economiza CPU no celular, não reduz essas leituras. Reavaliar antes de ampliar leitores. |
| Push com aplicativo fechado | drain acionado logo após commit; timer de 2s como recuperação; entrega sequencial por inscrição | O timer de 2s não é uma espera obrigatória no fluxo normal. O provedor/SO e inscrições lentas podem acrescentar atraso. Polling de 500ms não acelera push em segundo plano. |

Não foram feitas operações reais, acesso a sessões dos convidados, alteração de senhas, contratação ou mudança de conta MT5. Não houve medição de execução real até a tela do aparelho, nem comprovação de recebimento físico de push.

## Validação e próximos ganhos

Os 10 testes Node passaram, incluindo acompanhamento/pausa/retomada da rolagem, consulta de 500ms, exclusão de renders idênticos, bloqueio de consultas simultâneas e regressões de autenticação, persistência e push. O teste adicional em navegador móvel não rodou porque este ambiente não tem o binário Chromium instalado; a verificação física no telefone permanece pendente.

Para reduções maiores, priorizar entrega por evento ao aplicativo aberto (stream autenticado com reconexão e revogação), sem multiplicar consultas completas ao banco. No MT5, avaliar disparo orientado a transações com recuperação por timer; requer compilação/validação no MetaEditor e cuidado com WebRequest bloqueante. Nenhuma dessas mudanças foi implementada nesta versão.

Para medir: registrar relógios monotônicos por etapa (captura, HTTP, commit, recebimento e render), correlacionar um identificador de execução e calcular p50/p95 com operações naturais ou dados sintéticos isolados. Horários atuais de execução têm precisão de segundos e usam relógio da corretora; não bastam para comprovar melhora de centenas de milissegundos.

## Outras corretoras

GoldSymbol precisa corresponder exatamente ao símbolo no MT5. A API aceita XAUUSD seguido de letras, números, ponto, sublinhado ou hífen; por exemplo, XAUUSDdz. Nomes como GOLD, prefixos antes de XAUUSD e outros caracteres exigem ajuste da validação. Não foi verificado o símbolo específico de Monaxa/Equity. ExpectedAccount deve corresponder ao login MT5. A arquitetura atual não isola histórico por corretora/conta; planejar essa separação antes de trocar a origem ou usar mais de uma conta.
