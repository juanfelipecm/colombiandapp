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
import { sendTelegramMessage } from "./client";
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

const HELP_TEXT = [
  "Comandos disponibles:",
  "/resumen - ver estado de tu aula",
  "/asistencia - tomar asistencia de hoy",
  "/proyecto - crear un proyecto ABP",
  "/cancelar - cancelar el flujo actual",
].join("\n");

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
    await reply(chatId, `¡Hola, ${tgFirst}! Soy ColombiAndo, tu asistente pedagógico.\n\n¿En qué te puedo ayudar hoy?`, newIdentity);
    return {};
  }

  const session = await getSession(chatId);
  if (session && session.flow !== "idle") {
    return handleSessionMessage(chatId, text, identity, session);
  }

  const normalized = normalize(text);
  if (normalized.startsWith("/help") || normalized === "help" || normalized === "ayuda") {
    await reply(chatId, HELP_TEXT, identity);
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
    await reply(chatId, `Cuenta vinculada. Ya puedes usar /resumen, /asistencia o /proyecto.`, identity);
    return {};
  }

  // Already linked?
  const existing = await getIdentity(providerUserId);
  if (existing) {
    await reply(chatId, `Ya estás registrado. Puedes escribir /resumen, /asistencia o /proyecto.`, existing);
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
      await reply(chatId, `\u00a1Bienvenido, ${tgFirst}! Tu cuenta est\u00e1 lista.\n\nPuedes escribir /resumen, /asistencia o /proyecto.`, identity);
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
  await reply(chatId, `\u00a1Bienvenido, ${firstName}! Tu cuenta est\u00e1 lista.\n\nPuedes escribir /resumen, /asistencia o /proyecto.`, identity);
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
      "Eres ColombiAndo, un asistente pedagogico para profesores rurales en Colombia.",
      "Ayudas con planificacion de clases, ideas de proyectos, estrategias de ensenanza, y cualquier pregunta educativa.",
      "Responde en espanol, de forma clara y practica. Se breve pero util.",
      "Si el profesor pide ayuda con un proyecto, sugiere ideas concretas adaptadas a escuelas rurales multigrado.",
      "No menciones que eres una IA. Habla como un colega experimentado.",
    ].join(" ");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
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
    if (answer) {
      await reply(chatId, answer, identity);
    } else {
      await reply(chatId, HELP_TEXT, identity);
    }
  } catch (err) {
    console.error("[telegram] LLM call failed", err);
    await reply(chatId, HELP_TEXT, identity);
  }
  return {};
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
