import { useRef, type ComponentPropsWithoutRef } from "react";

export function Select({
  onPointerDown,
  onPointerCancel,
  onClick,
  onBlur,
  ...props
}: ComponentPropsWithoutRef<"select">) {
  const openAfterRelease = useRef(false);
  const nativeFallback = useRef(false);
  return (
    <select
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        openAfterRelease.current =
          !event.defaultPrevented &&
          !nativeFallback.current &&
          event.pointerType === "mouse" &&
          event.button === 0 &&
          typeof event.currentTarget.showPicker === "function";
        if (openAfterRelease.current) {
          // Open after mouseup so the opening gesture cannot select an option.
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onPointerCancel={(event) => {
        openAfterRelease.current = false;
        onPointerCancel?.(event);
      }}
      onBlur={(event) => {
        openAfterRelease.current = false;
        onBlur?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        const open = openAfterRelease.current;
        openAfterRelease.current = false;
        if (!open || event.defaultPrevented) return;
        event.preventDefault();
        try {
          event.currentTarget.showPicker();
        } catch {
          // Keep the browser's normal interaction available if opening is denied.
          nativeFallback.current = true;
        }
      }}
    />
  );
}
