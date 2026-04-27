import { AI_PROVIDER_PRESETS } from '../src/lib/ai.ts';

const prompt = 'Reply with only the exact model identifier you are serving, if available.';
const maxModelsPerProvider = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '0');

function envOrDefault(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function supportsTemperature(model) {
  return !(model.startsWith('gpt-5') || model.startsWith('o'));
}

function openaiUsesResponses(model) {
  return model === 'gpt-5.4-pro';
}

function markdownTable(rows) {
  const header = '| Provider | Model | Result | API model | Self-report / Error |';
  const divider = '| --- | --- | --- | --- | --- |';
  const body = rows.map((row) => (
    `| ${row.provider} | \`${row.model}\` | ${row.ok ? 'OK' : 'FAIL'} | ${escapeCell(row.apiModel || '')} | ${escapeCell(row.answer || row.error || '')} |`
  ));
  return [header, divider, ...body].join('\n');
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!response.ok) {
      const message = json?.error?.message || text || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    if (!json) {
      throw new Error(text.trim() || 'Empty non-JSON response');
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function testOpenAI(model) {
  const baseUrl = envOrDefault('OPENAI_BASE_URL', 'https://api.aicodemirror.com/api/codex/backend-api/codex/v1').replace(/\/$/, '');
  const apiKey = requiredEnv('OPENAI_API_KEY');
  const useResponses = openaiUsesResponses(model);
  const body = useResponses
    ? {
        model,
        instructions: 'Return only the requested identifier.',
        input: prompt,
        max_output_tokens: 32,
        stream: false
      }
    : {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 32,
        stream: false
      };
  if (supportsTemperature(model)) body.temperature = 0;

  const data = await postJson(`${baseUrl}/${useResponses ? 'responses' : 'chat/completions'}`, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }, body);

  return ensureModelReply({
    apiModel: data?.model,
    answer: useResponses
      ? data?.output_text || collectResponseText(data)
      : data?.choices?.[0]?.message?.content
  });
}

async function testClaude(model) {
  const baseUrl = envOrDefault('ANTHROPIC_BASE_URL', 'https://api.aicodemirror.com/api/claudecode').replace(/\/$/, '');
  const apiKey = requiredEnv('ANTHROPIC_API_KEY');
  const data = await postJson(`${baseUrl}/messages`, {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }, {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 32,
    temperature: 0
  });

  return ensureModelReply({
    apiModel: data?.model,
    answer: data?.content?.map((part) => part.text ?? '').join('')
  });
}

async function testGemini(model) {
  const baseUrl = envOrDefault('GEMINI_BASE_URL', 'https://api.aicodemirror.com/api/gemini').replace(/\/$/, '');
  const apiKey = requiredEnv('GEMINI_API_KEY');
  const data = await postJson(`${baseUrl}/v1beta/models/${model}:generateContent`, {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  }, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32
    }
  });

  return ensureModelReply({
    apiModel: data?.modelVersion || data?.model,
    answer: data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
  });
}

function ensureModelReply(result) {
  if (!String(result.apiModel ?? '').trim() && !String(result.answer ?? '').trim()) {
    throw new Error('Empty model test response');
  }
  return result;
}

function collectResponseText(data) {
  return data?.output
    ?.flatMap((item) => item.content ?? [])
    ?.map((part) => part.text || part.output_text || '')
    ?.join('');
}

async function testModel(provider, model) {
  if (provider === 'openai') return testOpenAI(model);
  if (provider === 'anthropic') return testClaude(model);
  if (provider === 'gemini') return testGemini(model);
  throw new Error(`Unsupported provider ${provider}`);
}

const rows = [];
for (const preset of AI_PROVIDER_PRESETS) {
  const models = preset.models.filter((model) => model.id).slice(0, maxModelsPerProvider || undefined);
  for (const model of models) {
    try {
      const result = await testModel(preset.id, model.id);
      rows.push({
        provider: preset.name,
        model: model.id,
        ok: true,
        apiModel: result.apiModel,
        answer: result.answer
      });
    } catch (error) {
      rows.push({
        provider: preset.name,
        model: model.id,
        ok: false,
        error: error?.message ?? String(error)
      });
    }
  }
}

console.log(markdownTable(rows));
