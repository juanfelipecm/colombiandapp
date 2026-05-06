import "server-only";
import {
  appBaseUrl,
  buildTeacherSummary,
  createTeacherFromTelegram,
  formatMateriaPrompt,
  parseMateriaSelection,
  resetTelegramUser,
  saveAttendanceFromTelegram,
  startTelegramProjectGeneration,
  teacherExists,
} from "./app-actions";
import { sendTelegramDocument, sendTelegramMessage } from "./client";
import { buildIntroMessage, buildLinkedIntroMessage } from "./messages";
import {
  clearSession,
  consumeLinkCode,
  deleteIdentity,
  getIdentity,
  getSession,
  logTelegramMessage,
  saveIdentity,
  saveSession,
} from "./store";
import type { TelegramIdentity, TelegramMessage, TelegramSession, TelegramUpdate } from "./types";

type HandlerResult = {
  background?: () => Promise<void>;
};

const HELP_TEXT = buildIntroMessage();

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<HandlerResult> {
  const message = update.message ?? update.edited_message;
  if (!message?.chat?.id) return {};

  const chatId = String(message.chat.id);
  const providerUserId = message.from?.id ? String(message.from.id) : chatId;
  const text = message.text?.trim() ?? "";
  const identity = await getIdentity(providerUserId);

  await logTelegramMessage({
    ts: Date.now(),
    direction: "in",
    chatId,
    providerUserId,
    teacherId: identity?.teacherId,
    username: message.from?.username,
    firstName: message.from?.first_name,
    text,
    command: commandName(text),
    updateId: update.update_id,
  });

  if (!text) {
    await reply(chatId, "Por ahora solo leo mensajes de texto.", identity);
    return {};
  }

  if (text.startsWith("/reset")) {
    if (process.env.TELEGRAM_ENABLE_RESET !== "true") {
      await reply(chatId, "Comando no disponible.", identity);
      return {};
    }
    if (identity) {
      await resetTelegramUser(identity.teacherId);
      await deleteIdentity(identity);
      await reply(chatId, "Listo. Te borré como usuario de prueba. Escribe cualquier mensaje para empezar de nuevo.", null);
    } else {
      await clearSession(chatId);
      await reply(chatId, "Listo. No había usuario guardado; escribe cualquier mensaje para empezar.", null);
    }
    return {};
  }

  if (text.startsWith("/start") || text.startsWith("/abrir")) {
    return handleStart(message, text);
  }

  if (isCancel(text)) {
    await clearSession(chatId);
    await reply(chatId, "Listo, cancelé el flujo actual.", identity);
    return {};
  }

  const session = await getSession(chatId);
  if (!identity && session?.flow === "onboard") {
    return handleOnboardMessage(chatId, text, message, session);
  }

  if (!identity) {
    // Auto-create account silently on any first message
    const tgFirst = message.from?.first_name?.trim() || "Profe";
    const tgLast = message.from?.last_name?.trim() || "";
    const result = await createTeacherFromTelegram(tgFirst, tgLast);
    if (!result) {
      await reply(chatId, "Hubo un error. Intenta de nuevo.", null);
      return {};
    }
    const newIdentity: TelegramIdentity = {
      teacherId: result.teacherId,
      providerUserId,
      chatId,
      username: message.from?.username ?? null,
      firstName: tgFirst,
      lastName: tgLast || null,
      linkedAt: Date.now(),
    };
    await saveIdentity(newIdentity);
    await clearSession(chatId);
    await reply(chatId, buildIntroMessage(tgFirst), newIdentity);
    return {};
  }

  if (session && session.flow !== "idle") {
    return handleSessionMessage(chatId, text, identity, session);
  }

  const normalized = normalize(text);
  if (normalized.startsWith("/help") || normalized.startsWith("/ayuda") || normalized === "help" || normalized === "ayuda") {
    await reply(chatId, HELP_TEXT, identity);
    return {};
  }
  if (isIntroRequest(normalized)) {
    await reply(chatId, buildIntroMessage(identity.firstName), identity);
    return {};
  }
  if (normalized.startsWith("/resumen") || normalized.includes("resumen") || normalized.includes("inicio")) {
    await reply(chatId, await buildTeacherSummary(identity.teacherId), identity);
    return {};
  }
  if (normalized.startsWith("/asistencia") || normalized.includes("asistencia") || normalized.includes("lista")) {
    await saveSession(chatId, { flow: "attendance", teacherId: identity.teacherId, updatedAt: Date.now() });
    await reply(
      chatId,
      `Tomemos asistencia de hoy.\n\nResponde "todos presentes" o "ausentes: Maria, Pedro; tarde: Ana".`,
      identity,
    );
    return {};
  }
  if (normalized.startsWith("/proyecto") || normalized.includes("proyecto")) {
    await saveSession(chatId, {
      flow: "project",
      step: "materias",
      teacherId: identity.teacherId,
      selectedMateriaIds: [],
      updatedAt: Date.now(),
    });
    await reply(chatId, await formatMateriaPrompt(), identity);
    return {};
  }

  // Free-form: send any message to the LLM as a teaching assistant
  return handleFreeformMessage(chatId, text, identity);
}

async function handleStart(message: TelegramMessage, text: string): Promise<HandlerResult> {
  const chatId = String(message.chat.id);
  const providerUserId = message.from?.id ? String(message.from.id) : chatId;
  const code = text.split(/\s+/)[1]?.trim();

  // If they have a link code, use the existing web-linking flow
  if (code) {
    const linked = await consumeLinkCode(code);
    if (!linked || !(await teacherExists(linked.teacherId))) {
      await reply(chatId, "Ese código no sirve o ya venció. Genera uno nuevo desde ColombiAndo.", null);
      return {};
    }
    const identity: TelegramIdentity = {
      teacherId: linked.teacherId,
      providerUserId,
      chatId,
      username: message.from?.username ?? null,
      firstName: message.from?.first_name ?? null,
      lastName: message.from?.last_name ?? null,
      linkedAt: Date.now(),
    };
    await saveIdentity(identity);
    await clearSession(chatId);
    await reply(chatId, buildLinkedIntroMessage(identity.firstName), identity);
    return {};
  }

  // Already linked?
  const existing = await getIdentity(providerUserId);
  if (existing) {
    await reply(chatId, buildIntroMessage(existing.firstName), existing);
    return {};
  }

  // New teacher — start onboarding. Use Telegram name as default if available.
  const tgFirst = message.from?.first_name?.trim();
  const tgLast = message.from?.last_name?.trim();

  if (tgFirst) {
    // We have at least a first name from Telegram, try to auto-create
    const result = await createTeacherFromTelegram(tgFirst, tgLast || "");
    if (result) {
      const identity: TelegramIdentity = {
        teacherId: result.teacherId,
        providerUserId,
        chatId,
        username: message.from?.username ?? null,
        firstName: tgFirst,
        lastName: tgLast ?? null,
        linkedAt: Date.now(),
      };
      await saveIdentity(identity);
      await clearSession(chatId);
      await reply(chatId, buildIntroMessage(tgFirst), identity);
      return {};
    }
  }

  // No Telegram name available — ask for it
  await saveSession(chatId, { flow: "onboard", step: "nombre", providerUserId, chatId, updatedAt: Date.now() });
  await reply(chatId, "\u00a1Hola! Soy ColombiAndo. \u00bfC\u00f3mo te llamas? (nombre y apellido)", null);
  return {};
}

async function handleOnboardMessage(
  chatId: string,
  text: string,
  message: TelegramMessage,
  session: { flow: "onboard"; step: "nombre"; providerUserId: string; chatId: string; updatedAt: number },
): Promise<HandlerResult> {
  const parts = text.trim().split(/\s+/);
  const firstName = parts[0] || "Profe";
  const lastName = parts.slice(1).join(" ") || "";

  const result = await createTeacherFromTelegram(firstName, lastName);
  if (!result) {
    await reply(chatId, "Hubo un error creando tu cuenta. Intenta de nuevo con /abrir.", null);
    await clearSession(chatId);
    return {};
  }

  const identity: TelegramIdentity = {
    teacherId: result.teacherId,
    providerUserId: session.providerUserId,
    chatId,
    username: message.from?.username ?? null,
    firstName,
    lastName: lastName || null,
    linkedAt: Date.now(),
  };
  await saveIdentity(identity);
  await clearSession(chatId);
  await reply(chatId, buildIntroMessage(firstName), identity);
  return {};
}

async function handleSessionMessage(
  chatId: string,
  text: string,
  identity: TelegramIdentity,
  session: Exclude<TelegramSession, { flow: "idle" }>,
): Promise<HandlerResult> {
  if (session.flow === "attendance") {
    const result = await saveAttendanceFromTelegram(identity.teacherId, text);
    if (result.ok) await clearSession(chatId);
    await reply(chatId, result.message, identity);
    return {};
  }

  if (session.flow === "project") {
    if (session.step === "materias") {
      const parsed = await parseMateriaSelection(text);
      if (!parsed.ok) {
        await reply(chatId, parsed.message, identity);
        return {};
      }
      await saveSession(chatId, {
        ...session,
        step: "duracion",
        selectedMateriaIds: parsed.materiaIds,
        updatedAt: Date.now(),
      });
      await reply(chatId, `Materias: ${parsed.labels.join(", ")}.\n\n¿Cuánto dura el proyecto? Responde 1 o 2 semanas.`, identity);
      return {};
    }

    if (session.step === "duracion") {
      const duration = parseDuration(text);
      if (!duration) {
        await reply(chatId, "Responde solo 1 o 2 semanas.", identity);
        return {};
      }
      await saveSession(chatId, {
        ...session,
        step: "tema",
        duracionSemanas: duration,
        updatedAt: Date.now(),
      });
      await reply(chatId, `¿Algo específico para incluir? Puedes escribir un tema de tu vereda o responder "sin tema".`, identity);
      return {};
    }

    if (session.step === "tema") {
      const tema = isNoTopic(text) ? null : text.slice(0, 500);
      await saveSession(chatId, { ...session, step: "generating", updatedAt: Date.now() });
      await reply(chatId, "Listo. Estoy generando el proyecto. Te escribo cuando termine.", identity);

      return {
        background: async () => {
          const result = await startTelegramProjectGeneration({
            teacherId: identity.teacherId,
            materiaIds: session.selectedMateriaIds,
            duracionSemanas: session.duracionSemanas ?? 1,
            temaContexto: tema,
          });
          await clearSession(chatId);
          if (!result.ok) {
            await reply(chatId, result.message, identity);
            return;
          }
          const link = result.projectId ? `${appBaseUrl()}/proyectos/${result.projectId}` : appBaseUrl();
          await reply(chatId, `Tu proyecto está listo:\n${link}`, identity);
        },
      };
    }

    await reply(chatId, "Sigo generando tu proyecto. Te aviso cuando esté listo.", identity);
    return {};
  }

  return {};
}

async function reply(chatId: string, text: string, identity: TelegramIdentity | null): Promise<void> {
  await sendTelegramMessage({
    chatId,
    text: text.length > 3900 ? `${text.slice(0, 3900)}...` : text,
    teacherId: identity?.teacherId,
    providerUserId: identity?.providerUserId,
  });
}

async function handleFreeformMessage(
  chatId: string,
  text: string,
  identity: TelegramIdentity,
): Promise<HandlerResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await reply(chatId, HELP_TEXT, identity);
    return {};
  }

  try {
    const systemPrompt = [
      "Eres ColombiAndo, asistente para profes rurales en Colombia.",
      "REGLA MAS IMPORTANTE: Responde lo mas corto posible. Maximo 2-3 oraciones. Si puedes decirlo en una oracion, mejor.",
      "Usa espanol sencillo y directo. Palabras simples, oraciones cortas. Nada de rodeos ni explicaciones largas.",
      "Da respuestas practicas y concretas. Ve al grano.",
      "EXCEPCION: Si te piden un plan de clase, guia de actividad, o algo que requiere contenido largo:",
      "- Empieza con 1-2 oraciones cortas de introduccion (ej: 'Aqui te va el plan de clase.').",
      "- Luego pon una linea que diga exactamente: ---",
      "- Despues del --- escribe el contenido largo con formato markdown (## titulos, listas, **negritas**, etc).",
      "- El contenido despues del --- se le manda como archivo al profe.",
      "Habla como un colega, no como un manual.",
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
      console.error("[telegram] LLM error", resp.status);
      await reply(chatId, HELP_TEXT, identity);
      return {};
    }

    const data = await resp.json() as { content?: Array<{ text?: string }> };
    const answer = data.content?.map((b) => b.text || "").join("\n").trim();
    if (!answer) {
      await reply(chatId, HELP_TEXT, identity);
    } else {
      const separatorIdx = answer.indexOf("\n---\n");
      if (separatorIdx !== -1) {
        const intro = answer.slice(0, separatorIdx).trim();
        const longContent = answer.slice(separatorIdx + 5).trim();
        if (intro) await reply(chatId, intro, identity);
        await sendAsHtmlFile(chatId, longContent, identity);
      } else {
        await reply(chatId, answer, identity);
      }
    }
  } catch (err) {
    console.error("[telegram] LLM call failed", err);
    await reply(chatId, HELP_TEXT, identity);
  }
  return {};
}

function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inList) { out.push("</ul>"); inList = false; }
      inCodeBlock = !inCodeBlock;
      out.push(inCodeBlock ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inCodeBlock) {
      out.push(esc(raw));
      continue;
    }

    let line = esc(raw);
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    line = line.replace(/\*(.+?)\*/g, "<em>$1</em>");
    line = line.replace(/`(.+?)`/g, "<code>$1</code>");

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = headingMatch[1].length;
      out.push(`<h${level}>${headingMatch[2]}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${listMatch[1]}</li>`);
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${numberedMatch[1]}</li>`);
      continue;
    }

    if (inList) { out.push("</ul>"); inList = false; }

    if (line.trim() === "") {
      out.push("<br>");
    } else {
      out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  if (inCodeBlock) out.push("</code></pre>");

  return out.join("\n");
}

async function sendAsHtmlFile(
  chatId: string,
  markdown: string,
  identity: TelegramIdentity,
): Promise<void> {
  const bodyHtml = markdownToHtml(markdown);

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ColombiAndo</title>
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}
h1,h2,h3,h4{color:#2d5016;margin:1.2em 0 0.4em}
ul{padding-left:1.5rem}li{margin:0.3em 0}
pre{background:#f4f4f4;padding:1rem;border-radius:6px;overflow-x:auto}
code{background:#f4f4f4;padding:0.15em 0.3em;border-radius:3px;font-size:0.9em}
pre code{background:none;padding:0}
strong{color:#2d5016}
</style>
</head><body>${bodyHtml}</body></html>`;

  await sendTelegramDocument({
    chatId,
    fileName: "colombiando.html",
    fileBuffer: Buffer.from(html, "utf-8"),
    teacherId: identity.teacherId,
    providerUserId: identity.providerUserId,
  });
}

function parseDuration(text: string): 1 | 2 | null {
  const match = normalize(text).match(/\b([12])\b/);
  if (!match) return null;
  return match[1] === "2" ? 2 : 1;
}

function isCancel(text: string): boolean {
  const normalized = normalize(text);
  return normalized.startsWith("/cancel") || normalized === "cancelar" || normalized === "salir";
}

function isIntroRequest(normalized: string): boolean {
  return (
    normalized === "hola" ||
    normalized === "buenas" ||
    normalized === "buenos dias" ||
    normalized === "buenas tardes" ||
    normalized === "buenas noches" ||
    normalized === "hi" ||
    normalized === "hello" ||
    normalized.includes("que puedes hacer") ||
    normalized.includes("que haces") ||
    normalized.includes("como funciona")
  );
}

function isNoTopic(text: string): boolean {
  const normalized = normalize(text);
  return normalized === "sin tema" || normalized === "no" || normalized === "ninguno" || normalized === "nada";
}

function commandName(text: string): string | undefined {
  const match = text.match(/^\/([a-zA-Z0-9_]+)/);
  return match?.[1]?.toLowerCase();
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
