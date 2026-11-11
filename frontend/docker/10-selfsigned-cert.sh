#!/bin/sh
# HTTPS da rede interna, sem aviso no navegador.
# Na primeira subida cria uma AUTORIDADE CERTIFICADORA LOCAL (hubify-ca.crt) e, com ela, assina o
# certificado do site. Tudo fica salvo no volume hubify-certs.
#   - A autoridade nunca muda: cada aparelho instala o hubify-ca.crt UMA vez (baixe em /hubify-ca.crt)
#     e o aviso "sua conexão não é particular" some de vez.
#   - O certificado do site é refeito sozinho quando HUBIFY_HOSTS muda ou perto de vencer,
#     sem precisar reinstalar nada nos aparelhos.
# HTTPS é exigido pelos navegadores para liberar microfone e câmera fora de "localhost".
set -e

CERT_DIR=/etc/nginx/certs
CA_KEY="$CERT_DIR/hubify-ca.key"
CA_CRT="$CERT_DIR/hubify-ca.crt"
CRT="$CERT_DIR/hubify.crt"
KEY="$CERT_DIR/hubify.key"
HOSTS_FILE="$CERT_DIR/hosts.txt"
HOSTS="${HUBIFY_HOSTS:-}"
LEAF_DAYS=800          # iPhone/iPad recusam certificados de site com mais de 825 dias
RENEW_BEFORE=2592000   # 30 dias, em segundos

mkdir -p "$CERT_DIR"

# Trechos do nginx que dependem do .env (incluídos por nginx.docker.conf)
mkdir -p /etc/nginx/hubify-redirect /etc/nginx/hubify-hsts
HTTPS_PORT="${HUBIFY_HTTPS_PORT:-443}"
if [ "$HTTPS_PORT" = "443" ]; then PORT_SUFFIX=""; else PORT_SUFFIX=":$HTTPS_PORT"; fi
# HTTP (porta 80) -> HTTPS, mantendo o caminho pedido
echo "location / { return 308 https://\$host$PORT_SUFFIX\$request_uri; }" > /etc/nginx/hubify-redirect/redirect.conf
# HSTS é opcional: com ele o navegador recusa de vez qualquer certificado não confiável neste endereço
rm -f /etc/nginx/hubify-hsts/hsts.conf
case "${HUBIFY_HSTS:-}" in
  1|true|on|yes) echo 'add_header Strict-Transport-Security "max-age=31536000" always;' > /etc/nginx/hubify-hsts/hsts.conf ;;
esac

# 1) Autoridade local (uma vez só)
if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CRT" ]; then
  echo "[hubify] Criando a autoridade certificadora local (só na primeira vez)"
  openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
    -keyout "$CA_KEY" -out "$CA_CRT" \
    -subj "/CN=Hubify CA local/O=Hubify" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
  chmod 600 "$CA_KEY"
  rm -f "$CRT" "$KEY" "$HOSTS_FILE"
fi

# 2) Certificado do site: mantém o atual se os endereços não mudaram, se ele foi assinado por esta
#    autoridade e se ainda falta mais de 30 dias para vencer
if [ -f "$CRT" ] && [ -f "$KEY" ] && [ "$(cat "$HOSTS_FILE" 2>/dev/null)" = "$HOSTS" ] \
  && openssl verify -CAfile "$CA_CRT" "$CRT" >/dev/null 2>&1 \
  && openssl x509 -in "$CRT" -noout -checkend "$RENEW_BEFORE" >/dev/null 2>&1; then
  exit 0
fi

SAN="DNS:localhost,IP:127.0.0.1"
OLD_IFS=$IFS
IFS=','
for h in $HOSTS; do
  h=$(echo "$h" | tr -d ' ')
  [ -z "$h" ] && continue
  if echo "$h" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    SAN="$SAN,IP:$h"
  else
    SAN="$SAN,DNS:$h"
  fi
done
IFS=$OLD_IFS

echo "[hubify] Gerando o certificado do site para: $SAN"
TMP=$(mktemp -d)
cat > "$TMP/ext.cnf" <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
authorityKeyIdentifier=keyid
EOF
openssl req -new -nodes -newkey rsa:2048 -sha256 \
  -keyout "$KEY" -out "$TMP/site.csr" -subj "/CN=Hubify (rede interna)" >/dev/null 2>&1
openssl x509 -req -sha256 -days "$LEAF_DAYS" -in "$TMP/site.csr" \
  -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -extfile "$TMP/ext.cnf" -out "$TMP/site.crt" >/dev/null 2>&1
# O navegador recebe o certificado do site seguido do da autoridade
cat "$TMP/site.crt" "$CA_CRT" > "$CRT"
chmod 600 "$KEY"
rm -rf "$TMP"
echo "$HOSTS" > "$HOSTS_FILE"
echo "[hubify] Para o navegador confiar no HTTPS, instale em cada aparelho: http://IP-DO-SERVIDOR/hubify-ca.crt"
