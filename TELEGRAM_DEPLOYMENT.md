# Telegram Deployment Notes

## Live droplet staging

- App path: `/root/.openclaw/workspace/colombiandapp`
- Service: `colombiandapp.service`
- Local app port: `3001`
- HTTPS URL: `https://colombiando.134.122.12.116.nip.io`
- Webhook URL: `https://colombiando.134.122.12.116.nip.io/api/telegram/webhook`
- Reverse proxy: Caddy (`/etc/caddy/Caddyfile`)

## Required env

The droplet env file is:

```text
/root/.openclaw/workspace/colombiandapp/.env.production
```

Before the demo, replace the placeholder values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TEACHER_IDS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

`TELEGRAM_WEBHOOK_SECRET` is already generated on the droplet. Use it as the Telegram webhook secret token.

## BotFather sequence

1. Create the bot with BotFather.
2. Put the token in `TELEGRAM_BOT_TOKEN`.
3. Put the bot username without `@` in `TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
4. Restart the service:

```bash
systemctl restart colombiandapp.service
```

5. While logged in as the admin teacher, call:

```bash
curl -X POST https://colombiando.134.122.12.116.nip.io/api/admin/telegram/set-webhook
```

Or set the webhook directly with Telegram using:

```text
https://colombiando.134.122.12.116.nip.io/api/telegram/webhook
```

## Useful checks

```bash
systemctl status colombiandapp.service --no-pager
systemctl status caddy --no-pager
journalctl -u colombiandapp.service -n 120 --no-pager
curl -i https://colombiando.134.122.12.116.nip.io/api/telegram/webhook
```
