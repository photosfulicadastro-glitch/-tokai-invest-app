# Acesso individual — teste de sinais

## Para Fuli
1. Abra o aplicativo e escolha **Acesso administrativo**.
2. Use a chave atual `VIEWER_TOKEN` (Render → Environment). Essa chave é exclusiva do responsável: não distribua.
3. Abra **Acessos**, informe nome e um nome de usuário (por exemplo `maria.silva`) e clique em **Gerar convite**.
4. Copie o link e envie individualmente à pessoa, junto com o nome de usuário. O aplicativo não envia e-mails ou mensagens automaticamente.
5. O convidado abre o link, cria uma senha de pelo menos 12 caracteres e passa a usar seu nome de usuário e senha.

O convite vale 72 horas e é de uso único. O link só é mostrado na criação e não fica armazenado em texto no banco. Para reenviar, gere **Novo convite**. Essa ação também invalida a senha e as sessões anteriores. **Bloquear** impede novas consultas e revoga as sessões; **Liberar** exige um novo login. Um convite bloqueado precisa de um novo convite para ser ativado.

## O que o usuário recebe

Apenas Visão geral, Mercado, Operações e Histórico da conta principal, em modo de leitura. Nenhum usuário conecta sua própria conta MT5 ou envia ordens. Acesso à conexão MT5 e à gestão de usuários fica restrito ao administrador. Espelhamento, Minha conta, cadastro de sinais manuais e telas futuras foram retirados da navegação. O código reservado está em `archive/future-pages.js.txt` e no histórico Git, sem ser carregado pelo aplicativo.

As posições, cotações, candles e execuções são consultadas a cada um segundo enquanto o painel está aberto. **Notificações push estão disponíveis:** use “Ativar notificações”, autorize no aparelho e toque em “Testar notificação”. No iPhone, adicione à Tela de Início pelo Safari e abra pelo ícone (iOS 16.4+). Entradas, saídas parciais e fechamentos novos são notificados; recuperação do histórico não dispara alertas antigos.

## Segurança e persistência

- Senhas com scrypt (N=32768, r=8, p=3), salt individual; nenhum armazenamento de senha em texto.
- Tokens de sessão e de convite aleatórios de 256 bits; apenas hashes no banco.
- Sessões de usuário expiram em 12 horas e são revogadas no servidor no logout, bloqueio ou recuperação.
- A sessão do leitor fica no sessionStorage da aba, sem guardar a senha; a chave administrativa fica só em memória. Fechar a aba normalmente exige novo login.
- Controle de acesso em cada rota da API, além de esconder menus; usuários não podem ingerir snapshots nem gerir acessos.
- Limite de tentativas de login por nome de usuário e limite global em memória. Reinício zera esses contadores; não substitui proteção de borda para uma distribuição ampla.
- Sem cadastro público aberto, envio de e-mail, cobrança ou credenciais de corretora para leitores.
- Não adicionar scripts de terceiros sem rever o acesso às sessões. A hospedagem atual usa origens distintas para frontend e API.
- As tabelas de usuários e sessões são criadas automaticamente no mesmo PostgreSQL, sem alterar histórico ou chaves MT5. O banco de testes tem expiração; planejar exportação/migração antes de 25/11/2026.

## Verificação

`npm test` cobre convites, uso único concorrente, senha incorreta, leitura, isolamento entre leitor/administrador/ingestão, persistência após reinício, bloqueio, logout, recuperação, expiração, limite de tentativas, CORS, navegação e escape de nomes. O PostgreSQL é a persistência de produção; os testes locais usam SQLite com o mesmo repositório SQL de autenticação.

Em Acessos, você pode excluir usuários com confirmação e definir uma frase-senha administrativa com exatamente 9 caracteres. Entre inicialmente com VIEWER_TOKEN; após salvar, use a nova senha. A chave original continua válida para recuperação. Nunca envie a chave administrativa aos leitores.
