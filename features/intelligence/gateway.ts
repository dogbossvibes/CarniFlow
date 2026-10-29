import { parseReply, parseServerError, validConversationRequest, type ConversationGateway, type ConversationRequest } from './contract';

export interface IntelligenceHttpReply { status: number; bodyText: string }
// Transport owner must authenticate with the current account JWT and bound the
// network body before materialising this string. No default/live transport.
export type IntelligenceHttpTransport = (operation: 'intelligence-respond-v1', request: ConversationRequest,
  signal: AbortSignal) => Promise<IntelligenceHttpReply>;
export function createConversationGateway(transport: IntelligenceHttpTransport): ConversationGateway {
  return { async respond(request, signal) {
    if (signal.aborted) return null;
    if (!validConversationRequest(request)) return { version: 1, error: { code: 'INVALID_INPUT' } };
    const sent: ConversationRequest = { ...request, messages: request.messages.map(m => ({ ...m })), sources: request.sources.map(s => ({ ...s })) };
    const response = await transport('intelligence-respond-v1', sent, signal);
    if (signal.aborted || !Number.isInteger(response.status) || response.status < 200 || response.status > 599
      || typeof response.bodyText !== 'string' || !response.bodyText || response.bodyText.length > 20000) return null;
    let body: unknown;
    try { body = JSON.parse(response.bodyText); } catch { return null; }
    if (response.status >= 400) {
      const code = parseServerError(body);
      if (code === 'DAILY_LIMIT_REACHED' && response.status !== 429) return null;
      return code ? { version: 1, error: { code } } : null;
    }
    if (response.status >= 300) return null;
    return parseReply(body, sent);
  } };
}
