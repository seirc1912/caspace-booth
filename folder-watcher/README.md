# SelfBooth FolderWatcher

Copy `config.example.json` to `config.json`, set the booth, Capture One export folder, server URL, and the shared `BOOTH_IMPORT_KEY` when configured. Build with `npm run build`, then run `npm start -- config.json` from this directory.

The watcher accepts JPG/JPEG files only, waits for three stable size checks, processes files serially, hashes content to prevent duplicate imports, and retries transient failures with exponential backoff.
