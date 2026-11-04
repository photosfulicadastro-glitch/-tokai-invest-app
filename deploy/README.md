# Preparação para VPS Hostinger

Esta pasta prepara o servidor sem mudar o ambiente atual do Render. Ela publica o painel e a API no mesmo endereço, usando `https://sinais.tokaiinvest.jp` e a API em `https://sinais.tokaiinvest.jp/api`.

## O que já está pronto

- PostgreSQL privado em volume persistente; ele não é exposto à internet.
- API Node do TOKAI INVEST.
- Painel estático servido com HTTPS automático pelo Caddy.
- Rota de saúde: `https://sinais.tokaiinvest.jp/api/health`.
- Caminho do MT5 após o corte: `https://sinais.tokaiinvest.jp/api`.

## Antes de ligar o VPS

1. Mantenha o Render ativo: ele continua sendo a produção até a validação final.
2. Exporte um backup do PostgreSQL do Render e guarde uma cópia fora do servidor.
3. Copie `.env.hostinger.example` para `.env` somente no VPS e preencha com valores secretos novos ou importados. Nunca versione esse arquivo.
4. Crie o DNS do subdomínio `sinais.tokaiinvest.jp` apontando para o IP do VPS.
5. Espere a propagação do DNS antes de iniciar a pilha; o certificado HTTPS depende desse apontamento.

## Início no VPS

Com Docker e Docker Compose instalados, na raiz do repositório:

```sh
cp .env.hostinger.example .env
# edite .env com as chaves verdadeiras
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

O Caddy emite e renova o certificado HTTPS. Libere somente as portas 80 e 443 no firewall público; não exponha a porta do PostgreSQL.

## Migração do banco

Faça o backup do Render antes do corte e restaure-o no container novo. O procedimento exato depende da URL de banco atual; use `pg_dump` no ambiente que possui a URL e, no VPS, restaure por `pg_restore` no serviço `db`.

Só altere `ApiUrl` no MT5 depois de confirmar que o painel novo abre, o login funciona e `GET /api/health` retorna `{ "ok": true }`. Mantenha a mesma chave de ingestão durante a transição para não interromper o monitor. Após a validação, gire as chaves de ingestão e administração e atualize o MT5.

## Checklist de corte

1. Backup restaurado e conferido.
2. Login administrativo e de um convidado testados.
3. Uma atualização de sinal recebida no novo painel.
4. Notificação de teste enviada a um aparelho autorizado.
5. Render mantido disponível até a confirmação de pelo menos um ciclo de operação.

Este projeto apenas consulta sinais e não abre, fecha ou copia operações.
