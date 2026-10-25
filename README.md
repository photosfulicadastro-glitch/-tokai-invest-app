# TOKAI INVEST — Protótipo XAUUSD

Interface estática e responsiva para apresentar um possível painel de acompanhamento de **XAUUSD (ouro/dólar americano)**.

> **Aviso importante:** este repositório é somente um protótipo visual. Não há conexão com MetaTrader 5 (MT5), corretoras, contas de clientes, cotações em tempo real ou envio de ordens. Todos os preços, saldos, sinais e resultados são fictícios e não constituem recomendação financeira.

## O que está incluído

- Painel inicial com saldo, desempenho e atividades demonstrativas;
- Tela de mercado dedicada exclusivamente a **XAUUSD**;
- Histórico de operações exemplificativas;
- Central de sinais demonstrativos;
- Área de conta que deixa clara a ausência de conexão com corretora/MT5;
- Navegação por menu, endereço da página (`#mercado`, `#sinais` etc.), botões e modais;
- Layout responsivo para computador, tablet e celular;
- Sem dependências, sem instalação e sem processo de compilação.

## Estrutura

```text
tokai-invest-app/
├── index.html    # Estrutura da interface
├── styles.css    # Design responsivo
├── app.js        # Navegação e interações demonstrativas
└── README.md     # Documentação do projeto
```

## Como visualizar no computador

Abra `index.html` diretamente no navegador ou, se preferir executar um servidor local, dentro da pasta do projeto use:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Publicar no GitHub Pages

O repositório alvo é `photosfulicadastro-glitch/-tokai-invest-app` e a branch padrão é `main`.

1. Envie **os arquivos extraídos desta pasta** (`index.html`, `styles.css`, `app.js` e `README.md`) para a raiz da branch `main`. Não envie apenas o arquivo ZIP, pois o GitHub Pages não o executa.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch **`main`** e a pasta **`/(root)`**.
5. Clique em **Save** e aguarde o GitHub terminar a publicação.
6. O endereço esperado será `https://photosfulicadastro-glitch.github.io/-tokai-invest-app/`.

O GitHub pode levar alguns minutos para disponibilizar ou atualizar a página. Ao abrir o endereço, deve aparecer o selo **DEMONSTRAÇÃO** no topo.

## Para uma futura integração real

Uma integração com MT5 não deve ser adicionada diretamente a este site estático. Ela exige, no mínimo:

1. Um backend próprio e autenticado;
2. Armazenamento seguro de segredos fora do navegador e do GitHub Pages;
3. Integração contratada com a corretora/ponte MT5 apropriada;
4. Consentimento explícito do usuário, limites de risco, registros de auditoria e análise jurídica/regulatória.

Nunca publique credenciais, tokens ou senhas de corretora neste repositório.
