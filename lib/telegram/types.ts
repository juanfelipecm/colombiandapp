export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

export type TelegramIdentity = {
  teacherId: string;
  providerUserId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedAt: number;
};

export type TelegramSession =
  | { flow: "idle"; teacherId?: string; updatedAt: number }
  | { flow: "attendance"; teacherId: string; updatedAt: number }
  | { flow: "onboard"; step: "nombre"; providerUserId: string; chatId: string; updatedAt: number }
  | {
      flow: "project";
      step: "materias" | "duracion" | "tema" | "generating";
      teacherId: string;
      selectedMateriaIds: string[];
      duracionSemanas?: 1 | 2;
      updatedAt: number;
    };

export type TelegramLogDirection = "in" | "out" | "system";

export type TelegramMessageLog = {
  ts: number;
  direction: TelegramLogDirection;
  chatId: string;
  providerUserId?: string;
  teacherId?: string;
  username?: string;
  firstName?: string;
  text: string;
  command?: string;
  updateId?: number;
  ok?: boolean;
  error?: string;
};
