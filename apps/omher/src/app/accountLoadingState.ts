import { chatReadRecoverable, type AppState } from "../state/store";

/** Initial connection only: loaded conversations and actionable errors stay available. */
export function accountIsLoading(state: AppState): boolean {
  if (state.ui.view !== "chat" || !state.selectedBot) return false;
  const bot = state.bots.find((b) => b.name === state.selectedBot);
  if (!bot) return false;
  const chat = state.chats[bot.name];
  if (chat?.items.length) return false;
  const recovering = chatReadRecoverable(chat?.openErrorCode);
  const starting = bot.status === "starting" || chat?.openErrorCode === "gateway_starting";
  if (chat?.openError && !recovering && !starting) return false;
  return starting || recovering || !chat?.loaded || state.conn !== "open";
}
