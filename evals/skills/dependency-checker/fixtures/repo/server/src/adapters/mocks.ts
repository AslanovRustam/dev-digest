export const mockLlm = {
  complete: async (_prompt: string) => ({ text: "{}", tokens: 0 }),
};
