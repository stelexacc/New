export const DEFAULT_SYSTEM_PROMPT = "You are Stelex GPT, a direct, thoughtful coding and creative assistant. Give practical, complete answers. Be accurate about limitations. Respect your model provider's safety requirements. Never claim to bypass safeguards or reveal hidden chain-of-thought.";
export const MAX_CUSTOM_PROMPT_LENGTH = 8000;
export const MAX_SYSTEM_PROMPT_LENGTH = 16000;

export function validPromptSettings(value, requireOverride = false) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (!requireOverride || typeof value.override === 'boolean')
    && typeof value.instructions === 'string' && value.instructions.length <= MAX_CUSTOM_PROMPT_LENGTH
    && typeof value.additionalPrompt === 'string' && value.additionalPrompt.length <= MAX_CUSTOM_PROMPT_LENGTH);
}

export function initializePrompts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
    userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    instructions TEXT NOT NULL DEFAULT '',additionalPrompt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS conversation_instructions (
    conversationId TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    instructions TEXT NOT NULL DEFAULT '',additionalPrompt TEXT NOT NULL DEFAULT '');`);
  if (!db.prepare('PRAGMA table_info(chat_requests)').all().some(column => column.name === 'promptHash')) {
    db.exec('ALTER TABLE chat_requests ADD COLUMN promptHash TEXT');
  }
  const readPreferences = userId => {
    const found = db.prepare('SELECT instructions,additionalPrompt FROM user_preferences WHERE userId=?').get(userId);
    return found ? { ...found } : { instructions: '', additionalPrompt: '' };
  };
  const readConversation = (userId,conversationId) => {
    const found = conversationId ? db.prepare('SELECT instructions,additionalPrompt FROM conversation_instructions WHERE conversationId=?').get(conversationId) : null;
    return found ? { ...found, override: true } : { ...readPreferences(userId), override: false };
  };
  const saveConversation = (conversationId, value) => {
    if (!value.override) db.prepare('DELETE FROM conversation_instructions WHERE conversationId=?').run(conversationId);
    else db.prepare('INSERT INTO conversation_instructions VALUES(?,?,?) ON CONFLICT(conversationId) DO UPDATE SET instructions=excluded.instructions,additionalPrompt=excluded.additionalPrompt').run(conversationId,value.instructions,value.additionalPrompt);
  };
  return {
    readPreferences,readConversation,saveConversation,
    savePreferences(userId,value) {
      db.prepare('INSERT INTO user_preferences VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET instructions=excluded.instructions,additionalPrompt=excluded.additionalPrompt').run(userId,value.instructions,value.additionalPrompt);
      return readPreferences(userId);
    },
    get systemPrompt() {
      return db.prepare("SELECT value FROM settings WHERE key='systemPrompt'").get()?.value ?? DEFAULT_SYSTEM_PROMPT;
    },
    saveSystemPrompt(value) {
      db.prepare("INSERT INTO settings VALUES('systemPrompt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
    },
    buildMessages(settings,language) {
      const base = this.systemPrompt;
      const systemText = [base,`Reply in ${language === 'de' ? 'German' : 'English'}.`];
      if (settings.instructions.trim()) systemText.push(`User's custom instructions:\n${settings.instructions}`);
      if (settings.additionalPrompt.trim()) systemText.push(`User's additional prompt:\n${settings.additionalPrompt}`);
      return { role: 'system',content:systemText.join('\n\n') };
    },
  };
}
