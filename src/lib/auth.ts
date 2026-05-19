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

const POLL_INTERVAL_MS = 250;
const MAX_POLL_ATTEMPTS = 8;

const getGoogleApi = (): GoogleIdApi | undefined =>
  window.google?.accounts?.id as GoogleIdApi | undefined;

export const initGoogleSignIn = (
  elementId: string,
  onSuccess: (token: string) => void,
  onError: (message: string) => void,
  onTimeout?: () => void
) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    onError("Missing Google client ID.");
    return () => {};
  }

  // `done` covers two situations: (a) we settled into an initialize-or-timeout
  // outcome, (b) the consumer ran cleanup before we settled. Either case
  // suppresses further callbacks. `activeApi` is set only once renderButton
  // succeeds, so cleanup-after-success can still call cancel().
  let done = false;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let activeApi: GoogleIdApi | null = null;

  const stopWaiting = () => {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const initializeWith = (googleApi: GoogleIdApi) => {
    if (done) return;
    done = true;
    stopWaiting();

    const target = document.getElementById(elementId);
    if (!target) {
      onError("Sign-in container not found.");
      return;
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

    activeApi = googleApi;
  };

  const fireTimeout = () => {
    if (done) return;
    done = true;
    stopWaiting();
    onTimeout?.();
  };

  // Fast path: GIS already loaded at call time. Preserves the synchronous
  // success path; no timers are scheduled.
  const ready = getGoogleApi();
  if (ready) {
    initializeWith(ready);
  } else {
    // Bounded wait. Poll for window.google?.accounts?.id; the absolute
    // setTimeout below caps total wait at POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS.
    pollHandle = setInterval(() => {
      const api = getGoogleApi();
      if (api) initializeWith(api);
    }, POLL_INTERVAL_MS);

    timeoutHandle = setTimeout(
      fireTimeout,
      POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS
    );
  }

  return () => {
    done = true;
    stopWaiting();
    if (activeApi) {
      activeApi.cancel();
      activeApi = null;
    }
  };
};
