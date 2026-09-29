FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-crosextra-carlito \
    fonts-liberation2 \
    fonts-noto-cjk \
    libreoffice-calc \
  && rm -rf /var/lib/apt/lists/*

# Only legally redistributable packages are installed. The aliases are explicit:
# Arial -> Liberation Sans; Songti SC/宋体 -> Noto Serif CJK SC.
COPY fontconfig/99-romiku-order-template.conf /etc/fonts/conf.d/99-romiku-order-template.conf
COPY scripts/font-preflight.sh /usr/local/bin/order-template-font-preflight
RUN chmod 0555 /usr/local/bin/order-template-font-preflight
RUN fc-cache -f

WORKDIR /app
COPY src ./src

CMD ["node", "src/server.mjs"]
