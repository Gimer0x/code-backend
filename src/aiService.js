import OpenAI from 'openai';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export class AIService {
  static getClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return new OpenAI({ apiKey });
  }

  static sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    // Cap to last 20 messages, trim long content
    const trimmed = messages.slice(-20).map(m => ({
      role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
      content: typeof m.content === 'string' ? m.content.slice(0, 8000) : ''
    }));
    return trimmed;
  }

  static async chat({ messages, model, metadata }) {
    try {
      const client = this.getClient();
      const safeMessages = this.sanitizeMessages(messages);
      if (safeMessages.length === 0) {
        return { success: false, error: 'messages required', code: 'MISSING_MESSAGES' };
      }

      const response = await client.chat.completions.create({
        model: model || DEFAULT_MODEL,
        messages: safeMessages
      });

      const reply = response.choices?.[0]?.message?.content || '';
      return {
        success: true,
        reply,
        usage: response.usage || null
      };
    } catch (error) {
      console.error('AI chat error:', error);
      return { success: false, error: 'AI request failed', code: 'AI_FAILED' };
    }
  }

  static async stream(req, res, { messages, model }) {
    try {
      const client = this.getClient();
      const safeMessages = this.sanitizeMessages(messages);
      if (safeMessages.length === 0) {
        res.status(400).json({ success: false, error: 'messages required', code: 'MISSING_MESSAGES' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await client.chat.completions.create({
        model: model || DEFAULT_MODEL,
        messages: safeMessages,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('AI stream error:', error);
      try {
        res.write(`data: ${JSON.stringify({ error: 'AI stream failed' })}\n\n`);
        res.end();
      } catch {}
    }
  }
}

export default AIService;


