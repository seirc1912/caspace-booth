# SelfBooth FolderWatcher

Copy `config.example.json` to `config.json`, then set `SUPABASE_SERVICE_ROLE_KEY` in the watcher machine's environment. Build with `npm run build`, then run `npm start -- config.json`.

The watcher talks directly to Supabase—there is no application server. It accepts JPG/JPEG files, waits for three stable size checks, processes files serially, hashes content to prevent duplicate session imports, and retries transient failures with exponential backoff.

The service-role key is intentionally not stored in `config.json` or source control. Each booth machine must protect its environment and configuration as production credentials.
