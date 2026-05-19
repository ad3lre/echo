export function createPromptSignInHandler(openAuthModal: () => unknown) {
  return () => {
    void openAuthModal();
  };
}
