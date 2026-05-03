export type AttendanceStatus = "presente" | "ausente" | "tardanza";

export interface AttendanceRow {
  studentId: string;
  status: AttendanceStatus;
  justified: boolean;
  note: string | null;
}
