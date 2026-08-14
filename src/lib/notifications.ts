type ToastBridge = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

let toastRef: ToastBridge | null = null;

export function setToastRef(ref: ToastBridge | null) {
  toastRef = ref;
}

export function notifySuccess(message: string) {
  toastRef?.success(message);
}

export function notifyError(message: string) {
  toastRef?.error(message);
}

export function notifyInfo(message: string) {
  toastRef?.info(message);
}
