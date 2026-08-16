// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Bring-your-own-key AI art
//
// Reuses RT Convo's TRANSPORT (window.electronAPI.aiCall, falling back to the
// hub's /api/ai-call proxy) but not its caller: RT Convo's callAI() ends in
// `raw.match(/\{[\s\S]*\}/)` and JSON.parse, which is text-completion specific.
// Image responses use a completely different envelope, so the adapters below
// are new code.
//
// Two deliberate departures from RT Convo's key handling:
//
//   1. The provider is an explicit choice, not inferred from the key prefix
//      alone. RT Convo's detectProvider() defaults unknown keys to Anthropic,
//      which cannot generate images at all — that would fail confusingly.
//      Prefix detection only seeds the dropdown.
//   2. The key lives in localStorage for this browser and is NEVER written into
//      a pack. A pack is a shareable artefact; a key inside one is a leaked
//      credential. Packs carry the generated image, so playing never needs a key.
//
// NOTE ON MODEL NAMES: image model identifiers change faster than anything else
// in this stack. If generation starts failing with "model not found", update
// MODELS below against the provider's current docs — nothing else needs to change.
// ═══════════════════════════════════════════════════════════════════════════════

window.ShownSoundAI = (function () {
    'use strict';

    const LS_PROVIDER = 'shownsound_ai_provider';
    const LS_KEY_PREFIX = 'shownsound_aikey_';   // + provider

    const MODELS = {
        google: 'gemini-2.5-flash-image',
        openai: 'gpt-image-1'
    };

    // Rough per-image cost, USD, shown in the confirm dialog. Indicative only —
    // it exists so a contributor is never surprised by their own bill.
    const APPROX_COST = { google: 0.04, openai: 0.04 };

    const PROVIDER_LABEL = { google: 'Google', openai: 'OpenAI' };

    /** Seeds the provider dropdown; never the final word. */
    function detectProvider(key) {
        if (!key) return null;
        if (key.startsWith('AIza')) return 'google';
        if (key.startsWith('sk-ant-')) return null;   // Anthropic makes no images
        if (key.startsWith('sk-')) return 'openai';
        return null;
    }

    function getProvider() {
        const p = localStorage.getItem(LS_PROVIDER);
        return (p === 'google' || p === 'openai') ? p : 'google';
    }
    function setProvider(p) { localStorage.setItem(LS_PROVIDER, p); }

    function getKey(provider) {
        return localStorage.getItem(LS_KEY_PREFIX + (provider || getProvider())) || '';
    }
    function setKey(provider, key) {
        localStorage.setItem(LS_KEY_PREFIX + provider, key);
    }
    function clearKey(provider) {
        localStorage.removeItem(LS_KEY_PREFIX + provider);
    }
    function hasKey(provider) { return !!getKey(provider); }

    function approxCost(provider) { return APPROX_COST[provider || getProvider()] || 0.04; }
    function label(provider) { return PROVIDER_LABEL[provider || getProvider()] || provider; }

    /**
     * Wrap the contributor's words into something that yields usable sector art.
     * A raw prompt like "lion" gives a cluttered photographic scene that reads
     * as mud at 40px; this asks for the flat, centred, isolated subject the
     * wheel actually needs.
     */
    function scaffold(prompt) {
        return (
            'A single centred ' + prompt.trim() + '. ' +
            'Simple bold flat illustration for a children\'s picture card. ' +
            'Thick clean outlines, bright saturated colours, high contrast, ' +
            'one clearly recognisable subject filling the frame, ' +
            'plain solid white background, no text, no words, no letters, ' +
            'no borders, no drop shadows, no photorealism.'
        );
    }

    // ─── Transport ───────────────────────────────────────────────────────────
    // Same three-tier path RT Convo uses, because CORS and CSP differ depending
    // on whether the editor is running inside the hub's Electron shell, served
    // by the hub's local server, or opened directly in a browser.
    async function post(url, headers, bodyObj) {
        const body = JSON.stringify(bodyObj);

        if (window.electronAPI && window.electronAPI.aiCall) {
            const r = await window.electronAPI.aiCall({ url, headers, body });
            if (!r.ok) throw new Error(r.error || 'API request failed');
            return r.data;
        }

        // Hub local server proxy (present when launched via editor_server.py or
        // the Electron main process).
        try {
            const probe = await fetch('/api/ai-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, headers, body })
            });
            if (probe.ok) return await probe.json();
            if (probe.status !== 404) {
                const e = await probe.json().catch(() => ({}));
                const msg = typeof e?.error === 'string'
                    ? e.error : (e?.error?.message || e?.message || probe.statusText);
                throw new Error(msg);
            }
            // 404 → no proxy here, fall through to a direct call.
        } catch (e) {
            if (e && e.message && !/Failed to fetch|NetworkError/i.test(e.message)) throw e;
        }

        // Direct. Google allows browser calls with an API key; OpenAI generally
        // does not send CORS headers, so this may fail with an opaque network
        // error — which we translate below rather than leaving cryptic. This is
        // the one path with no server-side timeout backing it (the IPC and
        // local-proxy tiers above both have one in main.js), so it needs its
        // own ceiling or a silent provider hangs the UI forever.
        const ac = new AbortController();
        const killTimer = setTimeout(() => ac.abort(), 45000);
        let res;
        try {
            res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('The AI request timed out. Try again in a moment.');
            throw new Error(
                'Could not reach the API from the browser (likely CORS). ' +
                'Launch this editor from Benny\'s Hub so it can proxy the request.');
        } finally {
            clearTimeout(killTimer);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.error?.message || data?.message || ('HTTP ' + res.status));
        }
        return data;
    }

    // ─── Per-provider adapters ───────────────────────────────────────────────

    async function generateGoogle(key, prompt) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + MODELS.google + ':generateContent?key=' + encodeURIComponent(key);
        const data = await post(url, { 'Content-Type': 'application/json' }, {
            contents: [{ parts: [{ text: scaffold(prompt) }] }],
            generationConfig: { responseModalities: ['IMAGE'] }
        });

        const parts = data?.candidates?.[0]?.content?.parts || [];
        const img = parts.find(p => p.inlineData && p.inlineData.data);
        if (!img) {
            const finish = data?.candidates?.[0]?.finishReason;
            if (finish === 'SAFETY' || data?.promptFeedback?.blockReason) {
                throw new Error('The provider refused this prompt. Try describing it differently.');
            }
            throw new Error('No image came back. Check the model name in editor-ai.js.');
        }
        return 'data:' + (img.inlineData.mimeType || 'image/png') + ';base64,' + img.inlineData.data;
    }

    async function generateOpenAI(key, prompt) {
        const data = await post(
            'https://api.openai.com/v1/images/generations',
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            { model: MODELS.openai, prompt: scaffold(prompt), n: 1, size: '1024x1024' }
        );
        const b64 = data?.data?.[0]?.b64_json;
        if (b64) return 'data:image/png;base64,' + b64;
        if (data?.data?.[0]?.url) return data.data[0].url;   // some models return a URL
        throw new Error('No image came back. Check the model name in editor-ai.js.');
    }

    /**
     * @param {string} prompt  the contributor's words, unscaffolded
     * @returns {Promise<string>} a data: URI for the generated image
     */
    async function generate(prompt) {
        const provider = getProvider();
        const key = getKey(provider);
        if (!key) throw new Error('No API key saved. Open AI Art Settings first.');
        if (!prompt || !prompt.trim()) throw new Error('Type what you want a picture of.');

        if (provider === 'google') return generateGoogle(key, prompt);
        if (provider === 'openai') return generateOpenAI(key, prompt);
        throw new Error('Unknown provider: ' + provider);
    }

    return {
        generate, detectProvider,
        getProvider, setProvider,
        getKey, setKey, clearKey, hasKey,
        approxCost, label,
        MODELS
    };
})();
