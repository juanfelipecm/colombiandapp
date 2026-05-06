export function buildIntroMessage(firstName?: string | null): string {
  const greeting = firstName?.trim()
    ? `Hola, ${firstName.trim()}! Soy ColombiAndo, tu asistente pedagógico.`
    : "Hola! Soy ColombiAndo, tu asistente pedagógico.";

  return [
    greeting,
    "",
    "Puedes escribirme cualquier pregunta sobre tu clase. También tengo estos modos guiados:",
    "",
    "1. Crear un proyecto ABP",
    "Escribe /proyecto y te pregunto materia, duración y contexto.",
    "",
    "2. Tomar asistencia",
    "Escribe /asistencia y registra hoy con frases como “todos presentes” o “ausentes: María; tarde: Pedro”.",
    "",
    "3. Ver resumen del aula",
    "Escribe /resumen para ver asistencia de hoy y proyectos recientes.",
    "",
    "4. Cancelar un flujo",
    "Escribe /cancelar si quieres salir y empezar de nuevo.",
    "",
    "También puedes escribir normal, por ejemplo: “dame una actividad corta sobre fracciones para tercero”.",
  ].join("\n");
}

export function buildLinkedIntroMessage(firstName?: string | null): string {
  return ["Cuenta vinculada.", "", buildIntroMessage(firstName)].join("\n");
}

