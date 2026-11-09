FROM caddy:2-alpine

ARG PUBLIC_DOMAIN
WORKDIR /srv
COPY index.html landing.html landing.css landing.js gate.js app.js config.js live.js notifications.js styles.css sw.js manifest.webmanifest termos-de-risco.html marca-tokai-invest.jpeg ./
COPY brand ./brand
COPY icons ./icons
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
RUN printf "window.TOKAI_API_URL = 'https://%s/api';\n" "$PUBLIC_DOMAIN" > /srv/config.js
