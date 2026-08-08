# SelfBooth FolderWatcher

Copy `config.example.json` to `config.json`, then provide `SUPABASE_SERVICE_ROLE_KEY` through the OS environment, `serviceRoleKey` in `config.json`, or a `.env` file beside `config.json`. The priority is OS environment, `config.serviceRoleKey`, then `.env`. Build with `npm run build`, then run `npm start -- config.json`.

The watcher talks directly to Supabase—there is no application server. It accepts JPG/JPEG files, waits for three stable size checks, processes files serially, hashes content to prevent duplicate session imports, and retries transient failures with exponential backoff.

The service-role key is a production credential. Never commit a populated `config.json` or `.env`; each booth machine must protect both its environment and configuration files.
