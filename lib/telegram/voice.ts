import "server-only";
import { writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TelegramIdentity, TelegramMessage } from "./types";
import { sendTelegramMessage, telegramApi, telegramApiUrl, telegramFileUrl } from "./client";
import { logTelegramMessage } from "./store";

const execFileAsync = promisify(execFile);

function openaiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  return key;
}

export async function handleVoiceMessage(
  message: TelegramMessage,
  identity: TelegramIdentity,
): Promise<void> {
  const chatId = String(message.chat.id);
  const voice = message.voice;
  if (!voice) return;

  const tmpDir = join(tmpdir(), `colombiando-voice-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputPath = join(tmpDir, "input.ogg");
  const outputMp3 = join(tmpDir, "reply.mp3");
  const outputOgg = join(tmpDir, "reply.ogg");

  try {
    await downloadTelegramFile(voice.file_id, inputPath);

    let transcript: string;
    try {
      transcript = await transcribeAudio(inputPath);
    } catch (err) {
      console.error("[voice] transcription failed", err);
      await sendTelegramMessage({
        chatId,
        text: "Perdón, no pude entender esa nota de voz. ¿Puedes intentarlo otra vez?",
        teacherId: identity.teacherId,
        providerUserId: identity.providerUserId,
      });
      return;
    }

    if (!transcript.trim()) {
      await sendTelegramMessage({
        chatId,
        text: "Perdón, no pude entender esa nota de voz. ¿Puedes intentarlo otra vez?",
        teacherId: identity.teacherId,
        providerUserId: identity.providerUserId,
      });
      return;
    }

    await logTelegramMessage({
      ts: Date.now(),
      direction: "system",
      chatId,
      providerUserId: identity.providerUserId,
      teacherId: identity.teacherId,
      text: `[transcripción] ${transcript}`,
    });

    let claudeResponse: string;
    try {
      claudeResponse = await askClaude(transcript);
    } catch (err) {
      console.error("[voice] Claude failed", err);
      await sendTelegramMessage({
        chatId,
        text: "Perdón, tuve un problema generando la respuesta.",
        teacherId: identity.teacherId,
        providerUserId: identity.providerUserId,
      });
      return;
    }

    await sendTelegramMessage({
      chatId,
      text: claudeResponse.length > 3900 ? `${claudeResponse.slice(0, 3900)}...` : claudeResponse,
      teacherId: identity.teacherId,
      providerUserId: identity.providerUserId,
    });

    try {
      await generateSpeech(claudeResponse, outputMp3);
      await convertToTelegramVoice(outputMp3, outputOgg);
      await sendTelegramVoice(chatId, outputOgg);
    } catch (err) {
      console.error("[voice] TTS/sendVoice failed (text was already sent)", err);
    }
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

export async function downloadTelegramFile(fileId: string, destPath: string): Promise<void> {
  const fileInfo = await telegramApi<{ file_path: string }>("getFile", { file_id: fileId });
  const resp = await fetch(telegramFileUrl(fileInfo.file_path), { cache: "no-store" });
  if (!resp.ok) throw new Error(`Telegram file download failed: ${resp.status}`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(destPath, buffer);
}

export async function transcribeAudio(filePath: string): Promise<string> {
  const audioData = await readFile(filePath);

  const form = new FormData();
  form.append("file", new Blob([audioData], { type: "audio/ogg" }), "voice.ogg");
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "es");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey()}` },
    body: form,
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw new Error(`OpenAI transcription failed (${resp.status}): ${errorText}`);
  }

  const data = (await resp.json()) as { text?: string };
  return data.text ?? "";
}

export async function askClaude(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

  const systemPrompt = [
    "Eres ColombiAndo, asistente para profes rurales en Colombia.",
    "Responde en español natural. Mantén las respuestas concisas y conversacionales a menos que el usuario pida más detalle.",
    "Responde lo mas corto posible. Maximo 2-3 oraciones.",
    "Usa espanol sencillo y directo. Palabras simples, oraciones cortas.",
    "Da respuestas practicas y concretas. Ve al grano.",
    "Habla como un colega, no como un manual.",
    "Tu respuesta será leída en voz alta, así que usa un tono natural para hablar. No uses formato markdown.",
  ].join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API failed with ${resp.status}`);
  }

  const data = (await resp.json()) as { content?: Array<{ text?: string }> };
  const answer = data.content
    ?.map((b) => b.text || "")
    .join("\n")
    .trim();
  if (!answer) throw new Error("Empty response from Claude");
  return answer;
}

export async function generateSpeech(text: string, outputPath: string): Promise<void> {
  const truncated = text.length > 4096 ? text.slice(0, 4096) : text;

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      input: truncated,
      voice: "coral",
      instructions: "Habla en español latinoamericano con tono natural, cálido y conversacional.",
      response_format: "mp3",
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw new Error(`OpenAI TTS failed (${resp.status}): ${errorText}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(outputPath, buffer);
}

export async function convertToTelegramVoice(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-c:a", "libopus",
    "-b:a", "32k",
    outputPath,
  ]);
}

export async function sendTelegramVoice(chatId: string, voicePath: string): Promise<void> {
  const audioData = await readFile(voicePath);

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("voice", new Blob([audioData], { type: "audio/ogg" }), "reply.ogg");

  const resp = await fetch(telegramApiUrl("sendVoice"), {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  const data = (await resp.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.description ?? `Telegram sendVoice failed: ${resp.status}`);
  }

  await logTelegramMessage({
    ts: Date.now(),
    direction: "out",
    chatId,
    text: "[nota de voz]",
    ok: true,
  });
}
