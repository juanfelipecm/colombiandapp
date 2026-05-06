import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDailyCap: vi.fn(),
  checkKillSwitch: vi.fn(),
  checkMonthlyBudget: vi.fn(),
  createAdminClient: vi.fn(),
  resolveSchoolId: vi.fn(),
  runProjectGeneration: vi.fn(),
  verifyStudentsOwnedByTeacher: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/api/pbl-gate", () => ({
  checkDailyCap: mocks.checkDailyCap,
  checkKillSwitch: mocks.checkKillSwitch,
  checkMonthlyBudget: mocks.checkMonthlyBudget,
  resolveSchoolId: mocks.resolveSchoolId,
  verifyStudentsOwnedByTeacher: mocks.verifyStudentsOwnedByTeacher,
}));
vi.mock("@/lib/api/project-generation-runner", () => ({
  runProjectGeneration: mocks.runProjectGeneration,
}));

import { startTelegramProjectGeneration } from "@/lib/telegram/app-actions";

describe("startTelegramProjectGeneration", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.checkKillSwitch.mockReturnValue({ ok: true });
    mocks.checkMonthlyBudget.mockResolvedValue({ ok: true });
    mocks.checkDailyCap.mockResolvedValue({ ok: true });
    mocks.resolveSchoolId.mockResolvedValue("school-1");
    mocks.verifyStudentsOwnedByTeacher.mockResolvedValue({
      ok: true,
      studentCountsByGrade: { 2: 2, 3: 2 },
    });
    mocks.runProjectGeneration.mockResolvedValue({
      status: "success",
      projectId: "project-1",
    });
  });

  it("creates example students when a Telegram project starts with an empty roster", async () => {
    const insertedStudents = [
      { id: "student-1", grade: 2 },
      { id: "student-2", grade: 2 },
      { id: "student-3", grade: 3 },
      { id: "student-4", grade: 3 },
    ];
    const admin = createAdminMock({
      existingStudents: [],
      insertedStudents,
      schoolGrades: [2, 3],
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await startTelegramProjectGeneration({
      teacherId: "teacher-1",
      materiaIds: ["materia-1"],
      duracionSemanas: 1,
      temaContexto: "la huerta",
    });

    expect(result).toEqual({ ok: true, generationId: "generation-1", projectId: "project-1" });
    expect(admin.studentInsert).toHaveBeenCalledWith([
      { school_id: "school-1", first_name: "Ana", last_name: "Ejemplo", grade: 2 },
      { school_id: "school-1", first_name: "Luis", last_name: "Ejemplo", grade: 2 },
      { school_id: "school-1", first_name: "Marta", last_name: "Ejemplo", grade: 3 },
      { school_id: "school-1", first_name: "Carlos", last_name: "Ejemplo", grade: 3 },
    ]);
    expect(mocks.verifyStudentsOwnedByTeacher).toHaveBeenCalledWith(
      admin.client,
      "teacher-1",
      ["student-1", "student-2", "student-3", "student-4"],
      [2, 3],
    );
    expect(admin.generationLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher_id: "teacher-1",
        inputs_jsonb: expect.objectContaining({
          student_ids: ["student-1", "student-2", "student-3", "student-4"],
          studentCountsByGrade: { 2: 2, 3: 2 },
          source: "telegram",
        }),
      }),
    );
    expect(mocks.runProjectGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: admin.client,
        teacherId: "teacher-1",
        schoolId: "school-1",
        generationId: "generation-1",
        studentIds: ["student-1", "student-2", "student-3", "student-4"],
        inputs: expect.objectContaining({
          grados: [2, 3],
          studentCountsByGrade: { 2: 2, 3: 2 },
          tema_contexto: "la huerta",
        }),
      }),
    );
  });
});

function createAdminMock(args: {
  existingStudents: Array<{ id: string; grade: number }>;
  insertedStudents: Array<{ id: string; grade: number }>;
  schoolGrades: number[];
}) {
  const studentSelectEq = vi.fn().mockResolvedValue({ data: args.existingStudents, error: null });
  const studentInsertSelect = vi.fn().mockResolvedValue({ data: args.insertedStudents, error: null });
  const studentInsert = vi.fn(() => ({ select: studentInsertSelect }));

  const schoolMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: "school-1", grades: args.schoolGrades },
    error: null,
  });
  const schoolEq = vi.fn(() => ({ maybeSingle: schoolMaybeSingle }));
  const schoolSelect = vi.fn(() => ({ eq: schoolEq }));

  const generationLogSingle = vi.fn().mockResolvedValue({
    data: { id: "generation-1" },
    error: null,
  });
  const generationLogSelect = vi.fn(() => ({ single: generationLogSingle }));
  const generationLogInsert = vi.fn(() => ({ select: generationLogSelect }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === "students") {
        return {
          select: vi.fn(() => ({ eq: studentSelectEq })),
          insert: studentInsert,
        };
      }
      if (table === "schools") {
        return { select: schoolSelect };
      }
      if (table === "project_generation_logs") {
        return { insert: generationLogInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client,
    generationLogInsert,
    studentInsert,
  };
}
