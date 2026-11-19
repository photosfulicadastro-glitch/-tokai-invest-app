# Migração para o Trade Room (domínio novo + copy na corretora)

Ordem importa. Cada passo diz em qual terminal rodar.

## 1. DNS (painel da Hostinger)
Crie um registro **A** `traderoom` (zona `tokaiinvest.jp`) apontando para o **mesmo IP** do registro `sinais`. Mantenha o `sinais`.
Confirme que propagou antes de seguir (**Terminal do Mac**): `dig +short traderoom.tokaiinvest.jp` deve mostrar o IP do VPS.

## 2. Ajustar o `.env` (Terminal da VPS)
`nano /opt/tokai/app/.env` e deixe:

```
PUBLIC_DOMAIN=traderoom.tokaiinvest.jp
LEGACY_DOMAIN=sinais.tokaiinvest.jp
COPY_ENGINE=0
```
(`COPY_ENGINE=0` liga o modo Trade Room: plano único, copy feito na Monaxa. `1` volta ao comportamento antigo.)

## 3. Deploy (Terminal da VPS)
```
cd /opt/tokai/app && git pull --ff-only && docker compose --env-file /opt/tokai/app/.env -f deploy/docker-compose.yml up -d --build && sleep 20 && docker compose --env-file /opt/tokai/app/.env -f deploy/docker-compose.yml ps
```
O Caddy emite o certificado dos dois domínios sozinho.

## 4. Conferir
- `https://traderoom.tokaiinvest.jp/api/health` responde `{"ok":true}`.
- `https://sinais.tokaiinvest.jp/api/health` continua respondendo (monitores MT5 antigos seguem enviando).
- `https://sinais.tokaiinvest.jp/` redireciona para o domínio novo.
- No painel, o menu mostra "Copy Monaxa" e a aba Acessos não mostra mais planos de Copy.

## 5. Depois
- Aba **Copy Monaxa** (como admin): preencha título, link e passo a passo da Monaxa.
- **Monitores MT5:** gere pacotes novos (Conexão MT5) e, no MT5 de cada computador, libere `https://traderoom.tokaiinvest.jp` em Ferramentas > Opções > Expert Advisors. O endereço antigo segue valendo enquanto isso.
- **Alunos:** reinstalar o app na tela inicial do iPhone (endereço novo) e ligar as notificações de novo.
- **Alunos com o EA de Copy antigo:** desinstalar o EA antes de ligar o copy na Monaxa, ou a posição entra duas vezes.

## Voltar atrás
Troque `COPY_ENGINE=1` e `PUBLIC_DOMAIN=sinais.tokaiinvest.jp`, remova `LEGACY_DOMAIN` e rode o deploy do passo 3.
