import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error" | "waiting";
  error?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  contextChips?: string[];
  attachments?: Attachment[];
  createdAt: Date;
}

export interface QuestionOption {
  label: string;
  value?: string;
  imageUrl?: string;
  description?: string;
}

export interface Question {
  question: string;
  options?: (string | QuestionOption)[];
  type: "single" | "multi" | "text";
}

export interface PendingQuestion {
  id: string;
  toolCallId: string;
  messageId: string;
  questions: Question[];
  answers?: (string | string[])[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  pendingQuestion: PendingQuestion | null;
  questionResolver: ((answers: (string | string[])[]) => void) | null;
  pendingAttachments: Attachment[];

  createSession: (title?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  getCurrentMessages: () => Message[];
  addMessage: (message: Omit<Message, "id" | "createdAt">) => string;
  updateMessage: (id: string, content: string) => void;
  addToolCall: (messageId: string, toolCall: Omit<ToolCall, "status">) => void;
  updateToolCall: (messageId: string, toolCallId: string, update: Partial<ToolCall>) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  addAttachment: (attachment: Omit<Attachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setPendingQuestion: (question: PendingQuestion | null) => void;
  setQuestionResolver: (resolver: ((answers: (string | string[])[]) => void) | null) => void;
  answerQuestion: (answers: (string | string[])[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      isStreaming: false,
      error: null,
      pendingQuestion: null,
      questionResolver: null,
      pendingAttachments: [],

      createSession: (title?: string) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const sessionTitle = title || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const newSession: ChatSession = {
          id,
          title: sessionTitle,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: id,
          pendingAttachments: [],
        }));
        return id;
      },

      switchSession: (id) => {
        const session = get().sessions.find((s) => s.id === id);
        if (session) {
          set({ currentSessionId: id, pendingAttachments: [] });
        }
      },

      deleteSession: (id) => {
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== id);
          let newCurrentId = state.currentSessionId;
          if (state.currentSessionId === id) {
            newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
          }
          return { sessions: newSessions, currentSessionId: newCurrentId };
        });
      },

      updateSessionTitle: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s
          ),
        })),

      getCurrentMessages: () => {
        const { sessions, currentSessionId } = get();
        const session = sessions.find((s) => s.id === currentSessionId);
        return session?.messages || [];
      },

      addMessage: (message) => {
        const id = crypto.randomUUID();
        const { pendingAttachments, currentSessionId, sessions } = get();
        if (!currentSessionId) {
          get().createSession();
        }
        set((state) => {
          const now = new Date().toISOString();
          return {
            sessions: state.sessions.map((session) =>
              session.id === state.currentSessionId
                ? {
                    ...session,
                    messages: [
                      ...session.messages,
                      { ...message, id, createdAt: new Date(), attachments: pendingAttachments },
                    ],
                    updatedAt: now,
                  }
                : session
            ),
            pendingAttachments: [],
          };
        });
        return id;
      },

      updateMessage: (id, content) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            sessions: state.sessions.map((session) =>
              session.id === state.currentSessionId
                ? {
                    ...session,
                    messages: session.messages.map((msg) =>
                      msg.id === id ? { ...msg, content } : msg
                    ),
                    updatedAt: now,
                  }
                : session
            ),
          };
        }),

      addToolCall: (messageId, toolCall) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          toolCalls: [
                            ...(msg.toolCalls || []),
                            { ...toolCall, status: "pending" as const },
                          ],
                        }
                      : msg
                  ),
                }
              : session
          ),
        })),

      updateToolCall: (messageId, toolCallId, update) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls?.map((tc) =>
                            tc.id === toolCallId ? { ...tc, ...update } : tc
                          ),
                        }
                      : msg
                  ),
                }
              : session
          ),
        })),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setError: (error) => set({ error }),

      clearMessages: () =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.currentSessionId
              ? { ...session, messages: [], updatedAt: new Date().toISOString() }
              : session
          ),
          pendingAttachments: [],
        })),

      addAttachment: (attachment) =>
        set((state) => ({
          pendingAttachments: [
            ...state.pendingAttachments,
            { ...attachment, id: crypto.randomUUID() },
          ],
        })),

      removeAttachment: (id) =>
        set((state) => ({
          pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
        })),

      clearAttachments: () => set({ pendingAttachments: [] }),

      setPendingQuestion: (question) => set({ pendingQuestion: question }),

      setQuestionResolver: (resolver) => set({ questionResolver: resolver }),

      answerQuestion: (answers) => {
        const { questionResolver, pendingQuestion } = get();
        if (questionResolver && pendingQuestion) {
          questionResolver(answers);
          set({ pendingQuestion: null, questionResolver: null });
        }
      },
    }),
    {
      name: "stud-chat-storage",
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
