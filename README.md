# InkStack

InkStack is a local-first Markdown writing workspace built with React, Vite, TypeScript, CodeMirror, and Zustand.

## Run Locally

Prerequisite: Node.js.

```bash
npm install
npm run dev
```

## AI Configuration

AI providers are configured in the app:

1. Open the AI panel.
2. Switch to Settings.
3. Choose a provider preset or custom OpenAI-compatible endpoint.
4. Fill in Base URL, model, API Key, and temperature.
5. Save the settings.

Supported connection styles:

- OpenAI-compatible APIs, including OpenAI, DeepSeek, Qwen/DashScope, Doubao/Ark, Moonshot, Zhipu, SiliconFlow, OpenRouter, and custom endpoints.
- Google Gemini native API.
- Anthropic Claude native API.

API keys are stored in `sessionStorage` for the current browser session in this development build. Do not place provider keys in `.env` files or source code.
