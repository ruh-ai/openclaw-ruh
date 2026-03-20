# telegram_report_sender

Sends a text message to Telegram.

## Env vars

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Inputs

- `run_id` (string, required)
- `text` (string, required) - message body

## Output

```json
{
  "ok": true,
  "telegram": { ... }
}
```
