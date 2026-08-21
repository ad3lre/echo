/**
 * After accepting a message request, open the DM thread with the sender.
 */
export function createHandleAcceptMessageRequestOpener(deps: {
  acceptMessageRequest: (
    requestId: string,
  ) => Promise<{ fromUserId: string } | null>;
  selectDmUser: (userId: string) => Promise<string | null>;
}) {
  return function handleAcceptMessageRequest(rid: string): void {
    void (async () => {
      const req = await deps.acceptMessageRequest(rid);
      if (req) await deps.selectDmUser(req.fromUserId);
    })();
  };
}
