export function buildIntroMessage(firstName?: string | null): string {
  const greeting = firstName?.trim()
    ? `Hola, ${firstName.trim()}! Soy ColombiAndo, tu asistente pedagógico.`
    : "Hola! Soy ColombiAndo, tu asistente pedagógico.";

  return [
    greeting,
    "",
    "Puedes escribirme cualquier pregunta sobre tu clase. También tengo estos modos guiados:",
    "",
    "/proyecto - Crear un proyecto ABP",
    "Te pregunto materia, duración y contexto.",
    "",
    "/asistencia - Tomar asistencia",
    "Registra hoy con frases como “todos presentes” o “ausentes: María; tarde: Pedro”.",
    "",
    "/resumen - Ver resumen del aula",
    "Muestra asistencia de hoy y proyectos recientes.",
    "",
    "/cancelar - Cancelar un flujo",
    "Sales del modo actual y puedes empezar de nuevo.",
    "",
    "También puedes escribir normal, por ejemplo: “dame una actividad corta sobre fracciones para tercero”.",
  ].join("\n");
}

export function buildLinkedIntroMessage(firstName?: string | null): string {
  return ["Cuenta vinculada.", "", buildIntroMessage(firstName)].join("\n");
}
