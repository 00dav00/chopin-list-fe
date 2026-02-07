type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel: () => void;
};

export const initGoogleSignIn = (
  elementId: string,
  onSuccess: (token: string) => void,
  onError: (message: string) => void
) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    onError("Missing Google client ID.");
    return () => {};
  }

  const googleApi = window.google?.accounts?.id as GoogleIdApi | undefined;
  if (!googleApi) {
    onError("Google sign-in script not loaded.");
    return () => {};
  }

  const target = document.getElementById(elementId);
  if (!target) {
    onError("Sign-in container not found.");
    return () => {};
  }

  googleApi.initialize({
    client_id: clientId,
    callback: (response) => {
      if (!response?.credential) {
        onError("Google did not return a credential.");
        return;
      }
      onSuccess(response.credential);
    },
  });

  target.innerHTML = "";
  googleApi.renderButton(target, {
    theme: "outline",
    size: "large",
    width: 280,
  });

  return () => {
    googleApi.cancel();
  };
};
