# TOKAI INVEST — layout preservado e corrigido

Este pacote restaura a interface multipágina do protótipo aprovado, preservando navegação, telas de operações, histórico, sinais, conexão MT5, espelhamento, notificações e perfil. A tela Mercado usa candles demonstrativos e seletor M1, M5 e M15; não usa gráfico de linha. A marca TOKAI INVEST — Trade Club & School aparece na entrada e no menu.

## Arquivos
- `index.html`: aplicativo estático com estilos e JavaScript embutidos.
- `marca-tokai-school.png`: logo da escola usada na tela de entrada.

## Publicar no GitHub Pages
1. Extraia este ZIP no computador.
2. No repositório `photosfulicadastro-glitch/-tokai-invest-app`, faça upload de `index.html` e `marca-tokai-school.png` para a raiz da branch configurada no GitHub Pages.
3. Confirme o commit e aguarde a publicação.
4. Abra `https://photosfulicadastro-glitch.github.io/-tokai-invest-app/` e recarregue com `Command + Shift + R`.

Não apague arquivos adicionais do repositório sem necessidade. Este ZIP restaura a interface de arquivo único, então o site usa os arquivos nele contidos; os antigos `app.js` e `styles.css` deixam de ser necessários para este `index.html`, mas podem permanecer no repositório.

## Limites da demonstração
Preços, candles, sinais, histórico e resultados são dados fictícios. Não há conexão real com MT5, conta do robô, backend nem notificações push reais. Alertas de entradas e saídas exigem integração segura entre MT5/EA, backend e serviço de notificações.
