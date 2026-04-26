export type AttendanceStatus = "presente" | "ausente" | "tardanza";

export interface AttendanceRow {
  studentId: string;
  status: AttendanceStatus;
  justified: boolean;
  note: string | null;
}

export interface SummaryRow {
  student_id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  student_created_at: string;
  as_of_date: string;
  days_marked_30: number;
  absences_30: number;
  lates_30: number;
  unjustified_absences_30: number;
}

export interface ResumenBuckets {
  con_ausencias: SummaryRow[];
  sin_ausencias: SummaryRow[];
  sin_datos: SummaryRow[];
}
