# TOKAI INVEST — acessos, Copy Trading e operação

Documento de operação. Não contém chaves nem senhas: elas ficam só no arquivo `.env` da VPS (`/opt/tokai/app/.env`, fora do Git).

## Ambiente
- Site e API: https://sinais.tokaiinvest.jp (VPS Hostinger; Docker Compose com `db` PostgreSQL 16, `api` Node 24 e `web` Caddy).
- Deploy (☁️ terminal da VPS), sempre com o arquivo de configurações:
  `cd /opt/tokai/app && git pull --ff-only && cd deploy && docker compose --env-file /opt/tokai/app/.env up -d --build api web`
- Branch de produção: `chore/hostinger-vps-prep`. Mudanças entram por Pull Request com testes verdes (`npm test`).

## Fluxo do aluno
1. **Cadastro** (`https://sinais.tokaiinvest.jp/#cadastro=1`): nome, usuário, senha de 9 caracteres, plano de assinatura (Sinais, Copy ou Sinais + Copy), **plano de pagamento** (Teste grátis 7 dias, Mensal 30, Trimestral 90, Semestral 180 ou Anual 365 dias) e aceite do Termo de Ciência de Riscos. Para Copy, informa conta MT5 e servidor.
2. O cadastro entra como **pendente**. Para Copy, a conta MT5 já é cadastrada com limite diário de 10% e **não pode se repetir entre alunos**.
3. **Aprovação** (admin → Acessos → Lista de alunos → *Aprovar (após pagamento)*): libera o acesso e define o vencimento pela duração do plano de pagamento.
4. **Instalador** (Copy): admin → Copy Trading → *Licença e instalador individual* → baixar pacote. Cada licença vale para uma instalação. Para reinstalar ou trocar de computador: *Revogar licença* e baixar novo pacote (cada download revoga o anterior).
5. O aluno só pode **reduzir** o próprio limite diário de perda; aumentar é com a equipe.

## Bloqueio e encerramento (Copy)
- **Bloquear**, plano vencido/pausado ou modo global "desligado": o robô do aluno **não abre novas posições**, mas as já copiadas continuam acompanhando as saídas da conta-mãe.
- **Bloquear e encerrar Copy** (emergência): bloqueia e manda o robô fechar todas as posições do Copy em poucos segundos.
- Licença revogada ou instalação diferente: o servidor recusa o robô (sem instruções).
- Modo global (Copy Trading → controle): desligado, só demo, só real, demo e real. **Hoje: só demo.** Só passar para real após teste final com alunos de confiança.

## Conta-mãe e monitores
- A conta-mãe é uma só, aberta em vários computadores. O `TokaiMonitor` pode rodar em mais de um; o servidor descarta dados repetidos ou mais antigos.
- Cada computador deve ter a **sua chave de envio**: admin → Acessos → *Monitores*. A chave aparece uma vez; revogar uma não afeta as outras. A chave antiga (`INGEST_TOKEN` do `.env`) segue válida até ser desligada.
- O relógio de cada computador deve estar automático (o servidor recusa dados com mais de 5 minutos de diferença).

## Segurança
- Senhas com scrypt; sessões, convites e licenças guardados apenas como hash; sessões revogadas no bloqueio.
- A chave administrativa (`VIEWER_TOKEN`) é exclusiva do responsável. Nunca enviar a alunos ou professores.
- Caddy com HSTS, anti-clickjacking, `nosniff` e sem cache de tela/API.
- Os dados de produção ficam no PostgreSQL da VPS. A pasta `backups/` nunca vai para o Git.

## Backup
- Diário: `/opt/tokai/backup.sh` (cron 18:15 UTC = 03:15 no Japão), `pg_dump -Fc` em `/opt/tokai/app/backups`, retenção de 14 dias. Restauração testada em 09/11/2026.
- Semanal: backup automático da Hostinger (ativo no hPanel).
- Pendente: cópia diária fora da VPS (por exemplo, para o Mac).
- Restaurar para teste (sem tocar a produção): criar um banco temporário e usar `pg_restore --no-owner` com o arquivo `.dump`.

## Verificação
`npm test` cobre convites, ativação, cadastro público com plano de pagamento e teste grátis, aprovação, bloqueio e liberação, modo só-saída e encerramento de emergência, chaves de monitor, conta MT5 duplicada, isolamento entre perfis e a navegação.
