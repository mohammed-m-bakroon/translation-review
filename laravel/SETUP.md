# AI and API setup

The runnable backend is `server/`. It stores the strings, enforces the review workflow, and calls Anthropic. The browser never sees the model key.

## Server

1. Copy `server/.env.example` to `server/.env`.
2. Set `ANTHROPIC_API_KEY`. Set `API_TOKEN` if anything other than your own machine can reach the port.
3. From the repo root:

   ```bash
   npm run server
   ```

4. In `.env.local` (see `.env.example` at the repo root):

   ```
   VITE_API_BASE_URL=http://localhost:8787/api
   VITE_API_TOKEN=
   ```

   Use the same token value as `API_TOKEN`. Leave both empty on your own machine. The token is visible in the browser; it is not the model key.

5. Restart `npm run dev`. New and missing strings are translated by the model, and each edit gets a meaning check. Only approved English is still exported from the dashboard.

`CORS_ORIGIN` must include the origin Vite prints (usually `http://localhost:5173`). `ANTHROPIC_MODEL` must be a model id your key can call.

A translation is one short request. The meaning check runs once per distinct English text, after typing stops for 0.7 seconds. Glossary and placeholder errors are answered on the server and do not call the model. Model calls are limited to 30 per minute per client.

## Laravel alternative

Use this when the API should live in an existing Laravel app. The persistence routes are not included here; `server/` is the full implementation.

1. Copy `AiTranslationController.php` to `app/Http/Controllers/Api/`.

2. `routes/api.php`, protected and rate-limited because every call costs money:

   ```php
   use App\Http\Controllers\Api\AiTranslationController;

   Route::middleware(['auth:sanctum', 'throttle:30,1'])->prefix('ai')->group(function () {
       Route::post('translate', [AiTranslationController::class, 'translate']);
       Route::post('review', [AiTranslationController::class, 'review']);
   });
   ```

3. `config/services.php`:

   ```php
   'anthropic' => [
       'key' => env('ANTHROPIC_API_KEY'),
       'model' => env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
   ],
   ```

4. `.env` (never commit this, never put the key in the React app):

   ```
   ANTHROPIC_API_KEY=your-key-here
   ANTHROPIC_MODEL=claude-sonnet-5-5
   ```

5. React app `.env.local`, if translations stay in the browser and only AI is remote:

   ```
   VITE_AI_BASE_URL=https://api.example.com/api
   ```

   If the routes require a login token, set `VITE_API_TOKEN` as well. `src/main.tsx` passes it to `createHttpTranslator`.

6. Check CORS (`config/cors.php`) allows the origin where the dashboard runs.
