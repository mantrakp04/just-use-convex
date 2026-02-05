import type { UIMessageStreamWriter } from 'ai';
import type { VoltAgentTextStreamPart } from '@voltagent/core';

export async function parseStreamToUI(
  fullStream: AsyncIterable<VoltAgentTextStreamPart>,
  writer: UIMessageStreamWriter
): Promise<void> {
  try {
    for await (const part of fullStream) {
      if (
        part.subAgentId != null ||
        part.subAgentName != null ||
        part.executingAgentId != null ||
        part.executingAgentName != null ||
        part.parentAgentId != null ||
        part.parentAgentName != null ||
        (Array.isArray(part.agentPath) && part.agentPath.length > 0)
      ) {
        writer.write({
          type: 'data-subagent-stream',
          data: {
            ...part,
            originalType: part.type,
          },
        });
      }

      switch (part.type) {
        case 'text-start':
          writer.write({
            type: 'text-start',
            id: part.id,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'text-delta':
          writer.write({
            type: 'text-delta',
            id: part.id,
            delta: part.text,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'text-end':
          writer.write({
            type: 'text-end',
            id: part.id,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'reasoning-start':
          writer.write({
            type: 'reasoning-start',
            id: part.id,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'reasoning-delta':
          writer.write({
            type: 'reasoning-delta',
            id: part.id,
            delta: part.text,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'reasoning-end':
          writer.write({
            type: 'reasoning-end',
            id: part.id,
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
          });
          break;
        case 'source':
          if (part.sourceType === 'url') {
            writer.write({
              type: 'source-url',
              sourceId: part.id,
              url: part.url,
              title: part.title,
              ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
            });
          }
          if (part.sourceType === 'document') {
            writer.write({
              type: 'source-document',
              sourceId: part.id,
              mediaType: part.mediaType,
              title: part.title,
              filename: part.filename,
              ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
            });
          }
          break;
        case 'file':
          writer.write({
            type: 'file',
            mediaType: part.file.mediaType,
            url: `data:${part.file.mediaType};base64,${part.file.base64}`,
          });
          break;
        case 'tool-input-start':
          writer.write({
            type: 'tool-input-start',
            toolCallId: part.id,
            toolName: part.toolName,
            ...(part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {}),
            ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
            ...(part.dynamic != null ? { dynamic: part.dynamic } : {}),
            ...(part.title != null ? { title: part.title } : {}),
          });
          break;
        case 'tool-input-delta':
          writer.write({
            type: 'tool-input-delta',
            toolCallId: part.id,
            inputTextDelta: part.delta,
          });
          break;
        case 'tool-call':
          if (part.invalid) {
            writer.write({
              type: 'tool-input-error',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              errorText: String(part.error),
              ...(part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {}),
              ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
              ...(part.dynamic != null ? { dynamic: part.dynamic } : {}),
              ...(part.title != null ? { title: part.title } : {}),
            });
          } else {
            writer.write({
              type: 'tool-input-available',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              ...(part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {}),
              ...(part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}),
              ...(part.dynamic != null ? { dynamic: part.dynamic } : {}),
              ...(part.title != null ? { title: part.title } : {}),
            });
          }
          break;
        case 'tool-approval-request':
          writer.write({
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: part.toolCall.toolCallId,
          });
          break;
        case 'tool-result':
          writer.write({
            type: 'tool-output-available',
            toolCallId: part.toolCallId,
            output: part.output,
            ...(part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {}),
            ...(part.preliminary != null ? { preliminary: part.preliminary } : {}),
            ...(part.dynamic != null ? { dynamic: part.dynamic } : {}),
          });
          break;
        case 'tool-error':
          writer.write({
            type: 'tool-output-error',
            toolCallId: part.toolCallId,
            errorText: String(part.error),
            ...(part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {}),
            ...(part.dynamic != null ? { dynamic: part.dynamic } : {}),
          });
          break;
        case 'tool-output-denied':
          writer.write({
            type: 'tool-output-denied',
            toolCallId: part.toolCallId,
          });
          break;
        case 'start':
          writer.write({ type: 'start' });
          break;
        case 'finish':
          writer.write({ type: 'finish', finishReason: part.finishReason });
          break;
        case 'start-step':
          writer.write({ type: 'start-step' });
          break;
        case 'finish-step':
          writer.write({ type: 'finish-step' });
          break;
        case 'error':
          if (!String(part.error).includes('WritableStream has been closed')) {
            writer.write({ type: 'error', errorText: String(part.error) });
          }
          break;
        case 'abort':
          writer.write({
            type: 'abort',
            ...(part.reason != null ? { reason: part.reason } : {}),
          });
          break;
        case 'tool-input-end':
        case 'raw':
          break;
        default:
          break;
      }
    }
  } catch (error) {
    if (!String(error).includes('WritableStream has been closed')) {
      throw error;
    }
  }
}
