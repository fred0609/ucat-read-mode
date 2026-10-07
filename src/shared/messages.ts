/** Message types between background and content script. */
export const MSG = {
  START_PRACTICE: "UCAT_RM_START_PRACTICE",
  PING: "UCAT_RM_PING",
  PONG: "UCAT_RM_PONG",
} as const;

export type ExtensionMessage =
  | { type: typeof MSG.START_PRACTICE }
  | { type: typeof MSG.PING }
  | { type: typeof MSG.PONG };
