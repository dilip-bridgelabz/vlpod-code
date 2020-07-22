#!/usr/bin/env bash

echo "Purge the cloudflare clache for sagemath.com -- see https://api.cloudflare.com/#zone-purge-all-files"

set -e

export API_KEY=$HOME/secrets/cloudflare/cloudflare

if [ ! -f $API_KEY ]; then
  echo "$0: You must put the CloudFlare API key in '$API_KEY'."
  exit 1
else
  echo "$0: Contacting CloudFlare servers to clear cache."

  curl -X DELETE "https://api.cloudflare.com/client/v4/zones/1f0851c75f9337545904475a1d1bbe71/purge_cache" \
     -H "X-Auth-Email: office@sagemath.com" \
     -H "X-Auth-Key: `cat $API_KEY`" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
fi
