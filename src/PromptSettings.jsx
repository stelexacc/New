import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Cpu, Layers3, Loader2, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';

export const promptText = {
  de: {
    title: 'KI-Anweisungen', subtitle: 'Gib Stelex deinen Stil, deine Rolle und die Regeln für deine Antworten vor.', chat: 'Für diesen Chat', defaults: 'Meine Standards',
    inherit: 'Meinen Standard verwenden', inheritHelp: 'Dieser Chat übernimmt deine gespeicherten Standard-Anweisungen. Änderungen am Standard gelten bei der nächsten Nachricht.',
    ownHelp: 'Diese Anweisungen gelten nur für diesen Chat. Bereits vorhandene Antworten bleiben erhalten.', defaultHelp: 'Dein Standard gilt für neue Chats und alle Chats, die ihn übernehmen.',
    instructions: 'Anweisungen', additional: 'Zusatzprompt', instructionsHint: 'Zum Beispiel: Antworte auf Deutsch. Erkläre Code kurz und liefere vollständige Beispiele.',
    additionalHint: 'Optional: eigenen Rollentext oder einen weiteren Prompt einfügen.', effect: 'Deine Texte werden bei der nächsten Nachricht an das ausgewählte Modell übergeben. Die Wirkung hängt vom Modell ab.',
    empty: 'Texte leeren', save: 'Anweisungen speichern', cancel: 'Abbrechen', saved: 'KI-Anweisungen gespeichert.', defaultSaved: 'Deine Standard-Anweisungen wurden gespeichert.', loading: 'Anweisungen werden geladen …', retry: 'Erneut laden',
    active: 'Eigene Anweisungen aktiv', standardActive: 'Dein Standard ist aktiv', standardTitle: 'Deine KI. Deine Anweisungen.', standardSub: 'Lege fest, wie Stelex dir antworten soll. Du kannst deinen Standard in jedem Chat überschreiben.', editDefaults: 'Standard bearbeiten', none: 'Noch keine eigenen Standard-Anweisungen.',
    modelTitle: 'Welches Modell antwortet?', modelSub: 'Hier siehst du den verbundenen Anbieter und die aktuell gewählte Modell-ID.', provider: 'Anbieter', selected: 'Aktive Modell-ID', models: 'Verfügbare Modelle',
    demoTitle: 'Demo — kein KI-Modell verbunden', demoHelp: 'Stelex Fast und Stelex Pro sind in der Demo nur Bezeichnungen für Beispielantworten. Es läuft dabei kein Sprachmodell.',
    localHelp: 'Lokaler Standard: Qwen 3.5 Abliterated 9B über Ollama. Ein anderes installiertes oder serverseitig konfiguriertes Modell kann ausgewählt werden.',
    realHelp: 'Stelex übergibt deine Anfrage an dieses konfigurierte Modell. Qualität und Geschwindigkeit hängen von Modell, Provider und Hardware ab.', unknown: 'Nicht verbunden', configured: 'OpenAI-kompatible API', close: 'Schließen', working: 'Speichert …'
  },
  en: {
    title: 'AI instructions', subtitle: 'Give Stelex your style, your role and the rules for your responses.', chat: 'For this chat', defaults: 'My defaults',
    inherit: 'Use my defaults', inheritHelp: 'This chat follows your saved default instructions. Changes to your defaults apply to the next message.',
    ownHelp: 'These instructions apply only to this chat. Existing responses stay unchanged.', defaultHelp: 'Your defaults apply to new chats and every chat that follows them.',
    instructions: 'Instructions', additional: 'Additional prompt', instructionsHint: 'For example: Reply in English. Explain code briefly and provide complete examples.',
    additionalHint: 'Optional: paste your own role description or another prompt.', effect: 'Your text is sent to the selected model with the next message. Its effect depends on the model.',
    empty: 'Clear text', save: 'Save instructions', cancel: 'Cancel', saved: 'AI instructions saved.', defaultSaved: 'Your default instructions have been saved.', loading: 'Loading instructions …', retry: 'Try again',
    active: 'Custom instructions active', standardActive: 'Your defaults are active', standardTitle: 'Your AI. Your instructions.', standardSub: 'Choose how Stelex responds. You can override your defaults in each chat.', editDefaults: 'Edit defaults', none: 'No custom default instructions yet.',
    modelTitle: 'Which model is responding?', modelSub: 'The actual connected provider and the currently selected model identifier appear here.', provider: 'Provider', selected: 'Active model identifier', models: 'Available models',
    demoTitle: 'Demo — no AI model connected', demoHelp: 'Stelex Fast and Stelex Pro are labels for sample responses in demo mode. No language model runs in this mode.',
    localHelp: 'Local default: Qwen 3.5 Abliterated 9B through Ollama. You can select another installed or server-configured model.',
    realHelp: 'Stelex sends your request to this configured model. Quality and speed depend on the model, provider and hardware.', unknown: 'Not connected', configured: 'OpenAI-compatible API', close: 'Close', working: 'Saving …'
  }
};
const emptySettings = () => ({ instructions: '', additionalPrompt: '' });
const normalize = value => ({ instructions: typeof value?.instructions === 'string' ? value.instructions : '', additionalPrompt: typeof value?.additionalPrompt === 'string' ? value.additionalPrompt : '' });

export function InstructionsDialog({ lang, request, errorText, t, conversationId, initialSettings, initialScope = 'chat', onClose, onSaved, onPreferencesSaved }) {
  const c = promptText[lang];
  const [scope, setScope] = useState(initialScope);
  const [defaults, setDefaults] = useState(emptySettings);
  const [savedDefaults, setSavedDefaults] = useState(emptySettings);
  const [chat, setChat] = useState(() => ({ ...normalize(initialSettings), override: Boolean(initialSettings?.override) }));
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const loadController = useRef(null);
  const mounted = useRef(true);

  async function load() {
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setLoaded(false); setError('');
    try {
      const [savedDefaults, savedChat] = await Promise.all([
        request('/preferences', { signal: controller.signal }),
        conversationId ? request(`/conversations/${encodeURIComponent(conversationId)}/instructions`, { signal: controller.signal }) : Promise.resolve(initialSettings)
      ]);
      if (controller.signal.aborted || !mounted.current) return;
      setDefaults(normalize(savedDefaults)); setSavedDefaults(normalize(savedDefaults)); setLoaded(true);
      setChat({ ...normalize(savedChat), override: Boolean(savedChat?.override) });
      onPreferencesSaved(normalize(savedDefaults));
    } catch (err) {
      if (err.name !== 'AbortError' && mounted.current) setError(errorText(err, t));
    } finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    load(); dialog.current?.focus();
    return () => { mounted.current = false; loadController.current?.abort(); previous?.focus?.(); };
  }, []);
  const displayed = scope === 'defaults' ? defaults : !chat.override ? savedDefaults : chat;
  const disabled = loading || !loaded || busy || (scope === 'chat' && !chat.override);
  function change(key, value) { (scope === 'defaults' ? setDefaults : setChat)(current => ({ ...current, [key]: value })); }
  async function submit(event) {
    event.preventDefault(); if (loading || !loaded || busy) return;
    setBusy(true); setError('');
    try {
      if (scope === 'defaults') {
        const result = await request('/preferences', { method: 'PUT', body: normalize(defaults) });
        onPreferencesSaved(normalize(result));
        onClose(c.defaultSaved);
      } else {
        const value = chat.override ? { ...normalize(chat), override: true } : { ...emptySettings(), override: false };
        const result = conversationId ? await request(`/conversations/${encodeURIComponent(conversationId)}/instructions`, { method: 'PATCH', body: value }) : value;
        onSaved({ ...normalize(result), override: Boolean(result.override) });
        onClose(c.saved);
      }
    } catch (err) { if (mounted.current) setError(errorText(err, t)); }
    finally { if (mounted.current) setBusy(false); }
  }
  function keyboard(event) {
    event.stopPropagation();
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const nodes = dialog.current?.querySelectorAll('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),[tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  return <div className="modal-backdrop instructions-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section ref={dialog} className="modal instructions-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-heading" tabIndex={-1} onKeyDown={keyboard}>
      <button type="button" className="icon-button modal-close" aria-label={c.close} onClick={() => onClose()} disabled={busy}><X size={19}/></button>
      <div className="instructions-heading"><span><SlidersHorizontal size={23}/></span><div><div className="eyebrow">STELEX / PERSONALIZE</div><h2 id="prompt-heading">{c.title}</h2></div></div>
      <p className="instructions-subtitle">{c.subtitle}</p>
      <div className="instructions-tabs" role="tablist" aria-label={c.title}>
        {['chat', 'defaults'].map(value => <button key={value} type="button" data-prompt-scope={value} role="tab" aria-selected={scope === value} disabled={busy || loading || !loaded} onClick={() => { setScope(value); setError(''); }}>{c[value]}</button>)}
      </div>
      {loading ? <div className="instructions-loading" role="status"><Loader2 className="spin" size={20}/>{c.loading}</div> : loaded ? <form className="instructions-form" onSubmit={submit}>
        {scope === 'chat' && <label className="instructions-inherit"><input id="prompt-inherit" type="checkbox" checked={!chat.override} disabled={busy} onChange={event => { const override = !event.target.checked; setChat(current => ({ ...(override && !current.override ? savedDefaults : current), override })); }}/><span>{c.inherit}</span></label>}
        <p className="instructions-scope-help">{scope === 'defaults' ? c.defaultHelp : chat.override ? c.ownHelp : c.inheritHelp}</p>
        <label className="instruction-field" htmlFor="prompt-instructions"><span>{c.instructions}<small>{displayed.instructions.length.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} / 8.000</small></span><textarea id="prompt-instructions" name="instructions" value={displayed.instructions} maxLength={8000} rows={5} disabled={disabled} placeholder={c.instructionsHint} onChange={event => change('instructions', event.target.value)}/></label>
        <label className="instruction-field" htmlFor="prompt-additional"><span>{c.additional}<small>{displayed.additionalPrompt.length.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} / 8.000</small></span><textarea id="prompt-additional" name="additionalPrompt" value={displayed.additionalPrompt} maxLength={8000} rows={4} disabled={disabled} placeholder={c.additionalHint} onChange={event => change('additionalPrompt', event.target.value)}/></label>
        <div className="instructions-effect"><ShieldCheck size={14}/><p>{c.effect}</p></div>
        {error && <div className="inline-error" role="alert"><AlertCircle size={15}/>{error}</div>}
        <div className="instructions-actions"><button type="button" className="text-button" disabled={disabled} onClick={() => { if (scope === 'defaults') setDefaults(emptySettings()); else setChat({ ...emptySettings(), override: true }); }}><RotateCcw size={14}/>{c.empty}</button><div><button type="button" className="button button-secondary" onClick={() => onClose()} disabled={busy}>{c.cancel}</button><button id="prompt-save" type="submit" className="button button-primary" disabled={busy || loading || !loaded}>{busy ? <Loader2 size={16} className="spin"/> : <Check size={16}/>} {busy ? c.working : c.save}</button></div></div>
      </form> : error && <div className="inline-error" role="alert"><AlertCircle size={15}/>{error}</div>}
      {!loading && !loaded && error && <button className="text-button instructions-retry" type="button" onClick={load} disabled={busy}><RotateCcw size={13}/>{c.retry}</button>}
    </section>
  </div>;
}

export function InstructionDefaultsCard({ lang, preferences, onEdit }) {
  const c = promptText[lang];
  const preview = preferences?.instructions || preferences?.additionalPrompt;
  return <section className="settings-card instructions-defaults-card"><div className="settings-icon"><SlidersHorizontal size={20}/></div><div className="settings-card-content"><h2>{c.standardTitle}</h2><p>{c.standardSub}</p><div className={`instructions-default-preview ${preview ? 'has-instructions' : ''}`}>{preview ? <><Check size={14}/><span>{preview.length > 170 ? `${preview.slice(0, 170)}…` : preview}</span></> : <><Settings2 size={14}/><span>{c.none}</span></>}</div><button type="button" className="button button-secondary edit-default-instructions" onClick={onEdit}>{c.editDefaults}<ArrowRight size={14}/></button></div></section>;
}

export function ModelInfoCard({ lang, health, model }) {
  const c = promptText[lang];
  const demo = Boolean(health?.demoMode);
  const selected = health?.models?.find(item => item.id === model);
  const provider = !health ? c.unknown : demo ? 'Demo' : health.provider?.kind === 'ollama' ? 'Ollama' : c.configured;
  return <section className="settings-card model-info-card"><div className="settings-icon"><Cpu size={20}/></div><div className="settings-card-content"><h2>{c.modelTitle}</h2><p>{c.modelSub}</p><dl className="model-info-grid"><div><dt>{c.provider}</dt><dd>{provider}</dd></div><div><dt>{c.selected}</dt><dd><code data-active-model>{demo ? c.demoTitle : selected?.configuredModel || selected?.upstreamModel || selected?.id || model || c.unknown}</code></dd></div></dl>{demo ? <div className="model-info-note"><AlertCircle size={15}/><p>{c.demoHelp}</p></div> : <p className="model-info-explanation">{c.realHelp}</p>}<p className="model-info-explanation">{c.localHelp}</p>{!demo && health?.models?.length > 0 && <div className="model-identifier-list"><span><Layers3 size={13}/>{c.models}</span>{health.models.map(item => <code key={item.id}>{item.configuredModel || item.upstreamModel || item.id}</code>)}</div>}</div></section>;
}
