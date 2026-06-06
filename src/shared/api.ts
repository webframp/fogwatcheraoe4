export const ApiEndpoint = {
  OnCommentCreate: "/internal/on-comment-create",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];
